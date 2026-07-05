-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-INFRA-SIDE-CLAIM-ELIGIBILITY-001 (FR-3, FR-4)
--
-- Observe-only claim-eligibility trigger: checks a client-version floor + 3 config-free
-- invariants (requires_human_action, needs_coordinator_review, orchestrator-parent) on every
-- claim-acquisition write to strategic_directives_v2. NEVER raises, NEVER blocks the write --
-- fail-open end to end (a broken trigger must never stall the whole fleet's claim mechanism).
-- Would-reject events are logged to claim_rejects for later analysis during the soak.
--
-- OUT OF SCOPE (explicitly, not silently dropped -- see retrospective/completion-flags):
--   (a) Flipping to BINDING (RAISE EXCEPTION) mode -- requires its own reviewed follow-up SD,
--       since RAISE aborts the whole transaction INCLUDING this trigger's own claim_rejects
--       INSERT (they cannot coexist in one statement); binding mode must move the ledger
--       insert into claim_sd()'s exception handler instead.
--   (b) The 24-48h soak / false-reject-rate measurement itself -- requires real production
--       wall-clock observation, cannot happen inside a single session.
--   (c) The "repo-match" invariant -- DROPPED ENTIRELY (not deferred): it requires external
--       worker-cwd/local_path context a SQL trigger cannot see, and encoding it here would
--       reproduce the exact false-reject class QF-20260703-775 already fixed.
--
-- CONVERGENCE NOTE (FR-4): eligibility enforcement moves INSIDE the future Pool-C lease RPC
-- when it lands (+ a grant-level REVOKE of direct claim writes at that point); this trigger
-- remains as defense-in-depth observation, not the long-term enforcement point.

CREATE TABLE IF NOT EXISTS claim_rejects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_key text NOT NULL,
  session_id text,
  would_reject_reasons text[] NOT NULL,
  client_version integer,
  floor_version integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claim_rejects_created_at ON claim_rejects (created_at);
CREATE INDEX IF NOT EXISTS idx_claim_rejects_sd_key ON claim_rejects (sd_key);

CREATE OR REPLACE FUNCTION public.claim_eligibility_observe()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_floor          integer;
  v_reasons        text[] := '{}';
BEGIN
  -- Version-floor check, isolated in its OWN sub-block so a config-read error only
  -- skips THIS check (not the row-derivable invariants below).
  BEGIN
    SELECT (metadata->>'claim_gate_version_floor')::int INTO v_floor
      FROM chairman_dashboard_config WHERE config_key = 'default';
  EXCEPTION WHEN OTHERS THEN
    v_floor := NULL;
  END;

  IF NEW.claim_gate_client_version IS NOT NULL
     AND v_floor IS NOT NULL
     AND NEW.claim_gate_client_version < v_floor
  THEN
    v_reasons := array_append(v_reasons, 'version_floor');
  END IF;

  IF COALESCE((NEW.metadata->>'requires_human_action')::boolean, FALSE) THEN
    v_reasons := array_append(v_reasons, 'requires_human_action');
  END IF;

  IF NEW.metadata->>'needs_coordinator_review' = 'true' THEN
    v_reasons := array_append(v_reasons, 'needs_coordinator_review');
  END IF;

  IF NEW.sd_type = 'orchestrator' THEN
    v_reasons := array_append(v_reasons, 'orchestrator_parent');
  END IF;

  IF array_length(v_reasons, 1) > 0 THEN
    INSERT INTO claim_rejects (sd_key, session_id, would_reject_reasons, client_version, floor_version)
    VALUES (NEW.sd_key, NEW.claiming_session_id, v_reasons, NEW.claim_gate_client_version, v_floor);
  END IF;

  RETURN NEW;
-- Outer fail-open: ANY unforeseen error anywhere in this function (malformed jsonb, a
-- missing claim_rejects table, a permission error, etc.) must never block the claim write.
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_claim_eligibility_observe ON strategic_directives_v2;

CREATE TRIGGER tr_claim_eligibility_observe
  BEFORE UPDATE ON strategic_directives_v2
  FOR EACH ROW
  WHEN (NEW.claiming_session_id IS DISTINCT FROM OLD.claiming_session_id AND NEW.claiming_session_id IS NOT NULL)
  EXECUTE FUNCTION claim_eligibility_observe();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_claim_eligibility_observe') THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: tr_claim_eligibility_observe trigger not found after creation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'claim_rejects') THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: claim_rejects table not found after creation';
  END IF;
  RAISE NOTICE 'claim_eligibility_observe trigger + claim_rejects ledger created successfully.';
END $$;
