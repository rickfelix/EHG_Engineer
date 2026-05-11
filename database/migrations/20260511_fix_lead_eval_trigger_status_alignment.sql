-- =============================================================================
-- Fix update_sd_after_lead_evaluation() trigger writer/consumer asymmetry
-- =============================================================================
-- SD: SD-FDBK-ENH-PAT-LEO-INFRA-001
-- Pattern: PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 (21st-witness)
-- Closes feedback: a050c98c-f92a-4584-b257-9e6910a1f81e
--
-- Problem
-- -------
-- The update_sd_after_lead_evaluation() trigger function writes
-- status = 'active' on APPROVE decision. This value IS valid in the
-- strategic_directives_v2_status_check CHECK constraint (which permits
-- {draft, active, in_progress, planning, review, pending_approval,
-- completed, deferred, cancelled}) but it is NOT in the validator
-- allowlist at scripts/modules/handoff/validation/validator-registry/
-- gates/additional-validators.js:29 (`['approved', 'planning',
-- 'in_progress', 'draft']`).
--
-- Result: any SD that runs `npm run lead:dossier` lands in 'active' and
-- then fails L:sdTransitionReadiness at LEAD-TO-PLAN handoff with
-- "SD status active not valid for transition". Manual workaround was a
-- post-dossier UPDATE status='in_progress'.
--
-- Fix
-- ---
-- Swap the APPROVE-branch literal in the CASE/WHEN/THEN clause:
-- 'active' -> 'in_progress'. Only value in DB ∩ validator intersection
-- that preserves the post-LEAD-evaluation semantic. All other branches
-- (REJECT, REVISE/CONDITIONAL/CLARIFY, ELSE retain) UNCHANGED.
--
-- Reference: scripts/one-off/_lead-fix-status-and-log-harness.mjs documents
-- the manual workaround that this migration eliminates.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Overload-existence guard (database-agent W1 lesson).
-- Fail loudly if a stray signature appears so CREATE OR REPLACE below cannot
-- silently update only one of multiple overloads.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_overload_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_overload_count
    FROM pg_proc
    WHERE proname = 'update_sd_after_lead_evaluation';

    IF v_overload_count > 1 THEN
        RAISE EXCEPTION
            'OVERLOAD_GUARD_TRIPPED: pg_proc has % signatures of update_sd_after_lead_evaluation; expected exactly 1. CREATE OR REPLACE below would only update one and leave others stale. Enumerate all signatures and update each.',
            v_overload_count;
    END IF;

    RAISE NOTICE 'OVERLOAD_GUARD_PASS: single signature confirmed (count=%)', v_overload_count;
END $$;

-- -----------------------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION — the actual fix.
-- Body is byte-identical to current pg_proc.prosrc EXCEPT the APPROVE branch
-- of the CASE expression: 'active' -> 'in_progress'.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_sd_after_lead_evaluation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Update SD status based on LEAD decision
    UPDATE strategic_directives_v2
    SET
        status = CASE
            WHEN NEW.final_decision = 'APPROVE' THEN 'in_progress'
            WHEN NEW.final_decision = 'REJECT' THEN 'rejected'
            WHEN NEW.final_decision IN ('CONDITIONAL', 'CLARIFY') THEN 'pending_revision'
            ELSE status -- Keep current status for DEFER/CONSOLIDATE
        END,
        updated_at = NOW()
    WHERE id = NEW.sd_id;

    RETURN NEW;
END;
$function$;

-- -----------------------------------------------------------------------------
-- Post-CREATE-OR-REPLACE validation block (FR-2 of PRD).
-- Introspect pg_proc.prosrc and confirm the APPROVE-branch literal is now
-- 'in_progress'. RAISE EXCEPTION if not — migration aborts and rolls back.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_prosrc TEXT;
BEGIN
    SELECT prosrc INTO v_prosrc
    FROM pg_proc
    WHERE proname = 'update_sd_after_lead_evaluation';

    IF v_prosrc IS NULL THEN
        RAISE EXCEPTION 'POST_MIGRATION_GUARD_FAILED: pg_proc.prosrc is NULL for update_sd_after_lead_evaluation';
    END IF;

    -- Positive assertion: 'in_progress' literal must be in the APPROVE branch.
    IF v_prosrc !~ E'WHEN\\s+NEW\\.final_decision\\s*=\\s*''APPROVE''\\s+THEN\\s+''in_progress''' THEN
        RAISE EXCEPTION
            'POST_MIGRATION_GUARD_FAILED: pg_proc.prosrc does NOT contain WHEN NEW.final_decision = ''APPROVE'' THEN ''in_progress'' after CREATE OR REPLACE. Migration body may have been corrupted. prosrc preview: %',
            substring(v_prosrc from 1 for 500);
    END IF;

    -- Negative assertion: 'active' literal must NOT be in the APPROVE branch.
    IF v_prosrc ~ E'WHEN\\s+NEW\\.final_decision\\s*=\\s*''APPROVE''\\s+THEN\\s+''active''' THEN
        RAISE EXCEPTION
            'POST_MIGRATION_GUARD_FAILED: pg_proc.prosrc still contains WHEN NEW.final_decision = ''APPROVE'' THEN ''active'' after CREATE OR REPLACE. The old writer/consumer asymmetry persists.';
    END IF;

    RAISE NOTICE 'POST_MIGRATION_GUARD_PASS: APPROVE branch now writes ''in_progress''; writer/consumer asymmetry eliminated.';
END $$;

-- -----------------------------------------------------------------------------
-- PostgREST schema cache reload (database-agent W2 lesson).
-- Without this, supabase-js callers see stale function source until next
-- natural cache invalidation.
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
