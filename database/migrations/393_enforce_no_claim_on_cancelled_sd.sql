-- Migration 393: Block claims on cancelled SDs (FR-5)
-- SD-LEO-INFRA-SHIP-UNMERGED-LAYERS-001
--
-- Ships the DB-level fail-closed layer of the cancelled-SD claim defense. The original
-- SD-LEO-INFRA-BLOCK-CLAIMS-CANCELLED-001 was marked completed, but this trigger (and the
-- claim-guard.mjs FR-1 refusal) never merged (stale PR #3672). claimGuard reads status at
-- the code layer (FR-1); this trigger backstops EVERY writer that sets is_working_on /
-- claiming_session_id, regardless of code path.
--
-- Design validated against the LIVE schema (database-agent, PLAN phase, evidence
-- 5f1375a9-0f2c-487a-86bc-60a7dbcd86bf):
--   * strategic_directives_v2.status is varchar (CHECK constraint, 'cancelled' is valid, NOT NULL)
--   * claim columns that exist: is_working_on (bool), claiming_session_id (text)
--     (claimed_by / current_owner do NOT exist on this table)
--   * keyed on OLD.status so the cancellation UPDATE itself (active -> cancelled, clearing
--     the claim in the same statement) is NOT blocked; only claims on ALREADY-cancelled rows are.
--   * COALESCE(OLD.status::text,'') makes the NULL / non-cancelled / non-claim path fall
--     straight through to RETURN NEW (fallback branch never throws). The ::text cast is a
--     harmless no-op today and future-proofs against an enum migration.
-- Behavioral probes (rolled-back txn against live data): claim-on-cancelled REJECTED;
-- claim-on-active SUCCEEDS; non-claim UPDATE on cancelled SUCCEEDS; release on cancelled
-- SUCCEEDS; cancel-sd.js pattern (active->cancelled + clear claim) SUCCEEDS.
--
-- Fleet risk: LOW (additive BEFORE-UPDATE trigger, never mutates rows, only RAISEs on the
-- precise NULL->claim transition against already-cancelled rows). Safe to apply while the
-- fleet is active.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS tr_enforce_no_claim_on_cancelled_sd ON strategic_directives_v2;
--   DROP FUNCTION IF EXISTS enforce_no_claim_on_cancelled_sd();

CREATE OR REPLACE FUNCTION enforce_no_claim_on_cancelled_sd()
RETURNS TRIGGER AS $$
BEGIN
    -- Outer guard: only act on rows that are ALREADY cancelled. The COALESCE(...::text,'')
    -- makes the NULL / non-cancelled / non-claim path fall straight through to RETURN NEW.
    IF COALESCE(OLD.status::text, '') = 'cancelled' THEN
        -- Block acquiring a claim (NULL -> NOT NULL). Releasing (NOT NULL -> NULL) stays allowed.
        IF NEW.claiming_session_id IS NOT NULL AND OLD.claiming_session_id IS NULL THEN
            RAISE EXCEPTION 'claiming_session_id cannot be set on cancelled SD %: cancellation_reason=%',
                OLD.sd_key, COALESCE(OLD.cancellation_reason, '(none)') USING ERRCODE = 'P0001';
        END IF;
        -- Block flipping is_working_on false/null -> true.
        IF COALESCE(NEW.is_working_on, false) = true AND COALESCE(OLD.is_working_on, false) = false THEN
            RAISE EXCEPTION 'is_working_on cannot be set true on cancelled SD %', OLD.sd_key USING ERRCODE = 'P0001';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_enforce_no_claim_on_cancelled_sd ON strategic_directives_v2;
CREATE TRIGGER tr_enforce_no_claim_on_cancelled_sd
BEFORE UPDATE ON strategic_directives_v2 FOR EACH ROW
EXECUTE FUNCTION enforce_no_claim_on_cancelled_sd();
