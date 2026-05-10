-- ============================================================================
-- Migration 393: Block claims on cancelled SDs (FR-5)
-- SD-LEO-INFRA-BLOCK-CLAIMS-CANCELLED-001
-- ============================================================================
--
-- Layer 3 of a 3-layer defense-in-depth against the cancelled-SD claim defect
-- cluster (RCA session 35d3f159, 2026-05-09; database-agent row d188965c).
--
-- Layer 1 (FR-1): lib/claim-guard.mjs pre-acquire status='cancelled' refusal.
-- Layer 2 (FR-2): lib/claim-validity-gate.js assertValidClaim cancelled throw.
-- Layer 3 (FR-5): THIS MIGRATION — BEFORE-UPDATE trigger refuses ANY UPDATE
--                 attempting to set claiming_session_id when status='cancelled'.
--                 Catches future writers that bypass the application layer.
--
-- Mirrors the pattern from migration 027_fix_completed_sd_phase_alignment.sql
-- (tr_enforce_completed_alignment).
--
-- 13th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_no_claim_on_cancelled_sd()
RETURNS TRIGGER AS $$
BEGIN
    -- Refuse setting claiming_session_id (i.e. acquiring a claim) on cancelled SDs.
    -- Only fires on the NULL → NOT-NULL transition; release transitions
    -- (NOT-NULL → NULL) and pure status flips remain permitted.
    IF OLD.status = 'cancelled'
       AND NEW.claiming_session_id IS NOT NULL
       AND OLD.claiming_session_id IS NULL THEN
        RAISE EXCEPTION 'claiming_session_id cannot be set on cancelled SD %: cancellation_reason=%',
            OLD.sd_key, COALESCE(OLD.cancellation_reason, '(none)')
            USING ERRCODE = 'P0001';
    END IF;

    -- Refuse setting is_working_on=true on cancelled SDs (defense for the
    -- writer/consumer asymmetry pattern — the FR-3 application sweep is the
    -- primary clean-up path; this is the DB-level safety net).
    IF OLD.status = 'cancelled'
       AND NEW.is_working_on = true
       AND COALESCE(OLD.is_working_on, false) = false THEN
        RAISE EXCEPTION 'is_working_on cannot be set true on cancelled SD %',
            OLD.sd_key
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Idempotent: drop existing trigger before creating
DROP TRIGGER IF EXISTS tr_enforce_no_claim_on_cancelled_sd ON strategic_directives_v2;

CREATE TRIGGER tr_enforce_no_claim_on_cancelled_sd
BEFORE UPDATE ON strategic_directives_v2
FOR EACH ROW
EXECUTE FUNCTION enforce_no_claim_on_cancelled_sd();

-- ============================================================================
-- Verification (no-op: trigger does not modify existing rows)
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration 393 applied: tr_enforce_no_claim_on_cancelled_sd is now active.';
END $$;
