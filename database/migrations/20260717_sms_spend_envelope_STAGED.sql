-- SMS spend envelope — atomic real-money spend caps + undo window for the chairman SMS
-- decision channel.
-- SD-LEO-FEAT-SMS-CHAIRMAN-DECISION-001-B (FR-2 spend caps + FR-3 undo/consumeSmsReply;
-- child B of the SMS-chairman-decision orchestrator — child A shipped the decision-class
-- whitelist; this child adds the financial envelope + single-sanctioned-read seam).
-- Solomon-ratified financial-envelope work; chairman-gated real-money security control.
--
-- WHY: child A's whitelist decides WHICH decision classes may reach the chairman's phone.
-- This child bounds WHAT a phoned-in approval may authorize in dollars, and gives the
-- chairman a window to UNDO before the approval is actionable. Two real-money controls:
--   (1) a per-decision cap AND a daily-cumulative cap, enforced by an ATOMIC
--       SUM-check-and-INSERT SECURITY DEFINER RPC so two concurrent consumes of DIFFERENT
--       same-day decisions cannot both slip past the daily cap (cross-decision TOCTOU close);
--   (2) an undo window: an inbound "UNDO" cancels a spend approval before it is consumed,
--       via single-row atomic conditional UPDATEs that serialize with the consume claim and
--       bias ties to UNDO (safety).
-- consumeSmsReply() (lib/chairman/sms-bridge.js) is the ONLY sanctioned actionable read of
-- an sms_reply; the actionable gating state lives in the DEDICATED COLUMNS below (never in
-- brief_data), so a caller that bypasses the seam and reads brief_data.sms_reply directly
-- gets only inert text and cannot execute a compliant spend.
--
-- DEFERRED (stated plainly so it is NOT mistaken for a live money path): caller-population
-- of chairman_decisions.amount_usd is DEFERRED to a follow-up SD. Until callers set
-- amount_usd, every spend-class decision is fail-closed-INERT (routes to console). This
-- migration + seam is the safe scaffolding; no money moves until a follow-up wires the
-- amount and an actual disburse action.
--
-- GOVERNANCE — WHO IS STOPPED BY WHAT (mirrors 20260717_sms_decision_class_whitelist_STAGED.sql
-- and 20260717_sms_relay_staging.sql, the ratified chairman-gated STAGED precedents):
--   * anon / ordinary authenticated users are stopped at the RLS LAYER on the ledger: the
--     only SELECT policy is chairman-only (fn_is_chairman()); no anon/authenticated write
--     policy exists.
--   * service_role writes the ledger through the SECURITY DEFINER debit RPC (definer
--     semantics bypass RLS); an explicit service-role FOR ALL policy is also present so a
--     direct service_role client can read/maintain the ledger. service_role bypasses RLS by
--     default in Supabase, so it can also read the chairman-only rows.
--   * the debit RPC is EXECUTE-granted to service_role ONLY (revoked from PUBLIC/anon/
--     authenticated) — the fleet's service_role client is the sole caller.
--
-- STAGED — NOT YET APPROVED FOR APPLY. requires-chairman-apply. Do NOT auto-apply on merge;
-- no approved-by attestation directive on this file. APPLY RUNBOOK (chairman ceremony):
--   (1) chairman verbal/written approval;
--   (2) apply via the standard migration path with an approved-by attestation commit;
--   (3) run `npm run schema:snapshot:lint` and commit the regenerated snapshot in the same PR
--       (removes sms_approved_spend_ledger from scripts/lint/schema-reference-allowlist.json
--       and the schema-lint-disable-line pragmas on the new chairman_decisions columns become
--       unnecessary) — schema:snapshot:lint runs AT the ceremony, not now;
--   (4) verify with a real service_role probe: call debit_sms_daily_spend and confirm the
--       atomic cap behavior against sms_approved_spend_ledger.
-- The referencing code (lib/chairman/sms-bridge.js consumeSmsReply / handleInboundSmsReply,
-- lib/chairman/sms-spend-caps.js) is FAIL-CLOSED by construction: a missing table/column/RPC
-- resolves to {data:null,error} and the seam returns non-actionable (routes to console) —
-- never crashes the live path, never approves a spend, pre-apply.

-- ============================================================
-- sms_approved_spend_ledger: append-only record of each SMS-channel-approved spend.
-- The atomic daily-cap SUM is computed over rows WHERE day = current_date.
-- ============================================================
CREATE TABLE IF NOT EXISTS sms_approved_spend_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL,
  amount_usd NUMERIC NOT NULL CHECK (amount_usd >= 0),
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  day DATE NOT NULL DEFAULT current_date
);

CREATE INDEX IF NOT EXISTS idx_sms_approved_spend_ledger_day
  ON sms_approved_spend_ledger (day);

COMMENT ON TABLE sms_approved_spend_ledger IS
  'Append-only ledger of SMS-channel-approved spends (SD-LEO-FEAT-SMS-CHAIRMAN-DECISION-001-B FR-2). The daily-cumulative cap is enforced by the atomic debit_sms_daily_spend RPC SUM-checking rows WHERE day = current_date. Chairman-only SELECT; written only via the SECURITY DEFINER debit RPC (or a direct service_role client).';

-- RLS + policies in the SAME migration as CREATE TABLE (SPINE-001-B recurrence guard).
ALTER TABLE sms_approved_spend_ledger ENABLE ROW LEVEL SECURITY;

-- Explicit service-role write/read policy (mirror sms_inbound_suspensions_service_all in
-- 20260717_sms_relay_staging.sql). service_role bypasses RLS by default, but the explicit
-- FOR ALL policy documents the intended write principal for a direct client.
DROP POLICY IF EXISTS sms_approved_spend_ledger_service_all ON sms_approved_spend_ledger;
CREATE POLICY sms_approved_spend_ledger_service_all ON sms_approved_spend_ledger
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Scoped chairman-read: the ledger is a chairman-audience audit surface.
DROP POLICY IF EXISTS sms_approved_spend_ledger_chairman_select ON sms_approved_spend_ledger;
CREATE POLICY sms_approved_spend_ledger_chairman_select ON sms_approved_spend_ledger
  FOR SELECT USING (fn_is_chairman());

-- ============================================================
-- chairman_decisions: the DEDICATED actionable-gating columns for the SMS spend envelope.
-- Kept OUT of brief_data on purpose — a direct brief_data.sms_reply reader gets only inert
-- text and cannot reconstruct actionability (consumed_at / undone_at / undo_deadline).
-- ============================================================
ALTER TABLE chairman_decisions
  ADD COLUMN IF NOT EXISTS amount_usd NUMERIC NULL CHECK (amount_usd IS NULL OR amount_usd >= 0),
  ADD COLUMN IF NOT EXISTS undo_deadline TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS undone_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN chairman_decisions.amount_usd IS
  'Structured spend amount for an SMS-channel spend-class decision (SD-LEO-FEAT-SMS-CHAIRMAN-DECISION-001-B FR-2). consumeSmsReply reads THIS, never the consequence-classifier regex. NULL on a spend-class decision => fail-closed to console (unknown amount). CALLER-POPULATION IS DEFERRED to a follow-up SD.';
COMMENT ON COLUMN chairman_decisions.undo_deadline IS
  'now()+UNDO_WINDOW for a spend-class reply; consumeSmsReply is non-actionable until now()>=undo_deadline (FR-3).';
COMMENT ON COLUMN chairman_decisions.undone_at IS
  'Set by an inbound UNDO (atomic conditional UPDATE) within the window; consumeSmsReply then returns undone, never executes (FR-3).';
COMMENT ON COLUMN chairman_decisions.consumed_at IS
  'Single-execution claim stamp set atomically by consumeSmsReply; a second consume is idempotent already-consumed (FR-1).';

-- Widen the inbound-log outcome vocabulary for the FR-3 undo path (mirrors the ALTER in
-- 20260717_sms_relay_staging.sql — this superset includes its values plus undone).
ALTER TABLE sms_inbound_log DROP CONSTRAINT IF EXISTS sms_inbound_log_outcome_check;
ALTER TABLE sms_inbound_log ADD CONSTRAINT sms_inbound_log_outcome_check
  CHECK (outcome IN ('answered', 'expired', 'no_match', 'invalid_signature', 'rate_limited', 'ambiguous', 'suspended', 'undone'));

COMMENT ON COLUMN sms_inbound_log.outcome IS
  'answered|expired|no_match|invalid_signature|rate_limited|ambiguous|suspended|undone (inbound UNDO cancelled a spend within the window, FR-3)';

-- ============================================================
-- debit_sms_daily_spend: SERIALIZED per-decision + daily-cumulative cap debit.
-- Returns 1 when the spend was approved and the ledger row inserted; 0 when over-cap
-- (per-decision OR daily-cumulative).
--
-- CONCURRENCY (deep-tier SECURITY review, PR #6208): a single SUM-check-and-INSERT
-- statement is NOT sufficient under READ COMMITTED (the Supabase default) — two
-- concurrent transactions inserting DIFFERENT same-day decisions each read a snapshot
-- that excludes the other's still-uncommitted ledger row, so both can see SUM=0, both
-- pass 0+300<=500, and both commit -> $600 > cap. To actually serialize cross-decision
-- debits we take a per-DAY transaction-scoped advisory lock FIRST: pg_advisory_xact_lock
-- on hashtext('sms_daily_spend|' || current_date). All debits for the same day now run
-- one-at-a-time within the lock, so the SUM the second caller reads includes the first's
-- committed row. The lock auto-releases at transaction end (xact-scoped); day-keying keeps
-- contention to same-day callers only. This closes the cross-decision daily-cap TOCTOU.
-- ============================================================
CREATE OR REPLACE FUNCTION debit_sms_daily_spend(
  p_decision_id UUID,
  p_amount NUMERIC,
  p_per_decision_cap NUMERIC,
  p_daily_cap NUMERIC
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inserted INTEGER;
BEGIN
  -- Fail-closed on a malformed amount (never a silent approve).
  IF p_amount IS NULL OR p_amount < 0 THEN
    RETURN 0;
  END IF;

  -- Per-decision cap: a single-value check, before touching the ledger.
  IF p_amount > p_per_decision_cap THEN
    RETURN 0;
  END IF;

  -- Serialize all debits for THIS day so the daily SUM below is race-free even under
  -- READ COMMITTED (see the CONCURRENCY note above). Xact-scoped: releases on COMMIT/ROLLBACK.
  PERFORM pg_advisory_xact_lock(hashtext('sms_daily_spend|' || current_date::text));

  -- Daily-cumulative cap: SUM-check-and-INSERT, now serialized by the advisory lock so a
  -- concurrent same-day debit cannot slip a second uncommitted row past this SUM.
  INSERT INTO sms_approved_spend_ledger (decision_id, amount_usd)
  SELECT p_decision_id, p_amount
  WHERE (
    SELECT COALESCE(SUM(amount_usd), 0)
    FROM sms_approved_spend_ledger
    WHERE day = current_date
  ) + p_amount <= p_daily_cap;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted; -- 1 = approved (row inserted), 0 = over-cap (no row)
END;
$$;

-- Execution surface: closed by default, opened ONLY to service_role (the fleet's sole
-- caller). anon/authenticated/PUBLIC can never debit spend.
REVOKE EXECUTE ON FUNCTION debit_sms_daily_spend(UUID, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION debit_sms_daily_spend(UUID, NUMERIC, NUMERIC, NUMERIC) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION debit_sms_daily_spend(UUID, NUMERIC, NUMERIC, NUMERIC) TO service_role;

COMMENT ON FUNCTION debit_sms_daily_spend(UUID, NUMERIC, NUMERIC, NUMERIC) IS
  'Serialized per-decision + daily-cumulative SMS spend-cap debit (SD-LEO-FEAT-SMS-CHAIRMAN-DECISION-001-B FR-2). Returns 1 (approved, ledger row inserted) or 0 (over-cap). A per-day pg_advisory_xact_lock serializes same-day debits so the daily SUM is race-free under READ COMMITTED and concurrent consumes of different same-day decisions cannot both overshoot the daily cap. service_role EXECUTE only.';
