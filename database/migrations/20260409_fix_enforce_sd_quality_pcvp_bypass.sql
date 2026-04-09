-- PCVP Emergency Bypass Fix: Add GUC bypass to enforce_sd_quality_on_advancement
-- SD: SD-LEO-PROTOCOL-PCVP-COMPLETION-INTEGRITY-001-A (follow-up chain: 6/?)
--
-- Chain context:
--   1. 20260409_fix_pcvp_emergency_bypass_allowlist.sql (merged PR #2872)
--   2. 20260409_fix_auto_validate_handoff_pcvp_bypass.sql (local)
--   3. 20260409_fix_bypass_insert_populate_not_null_columns.sql (local)
--   4. 20260409_fix_bypass_widen_phase_check_constraints.sql (local)
--   5. 20260409_fix_enforce_progress_pcvp_bypass.sql (local)
--   6. (this file) 20260409_fix_enforce_sd_quality_pcvp_bypass.sql
--
-- Problem:
--   Smoke test now clears the progress gate, but hits the quality gate:
--     Cannot advance SD past LEAD_APPROVAL: quality_checked is false.
--   enforce_sd_quality_on_advancement() blocks any transition out of
--   LEAD_APPROVAL into a later phase when strategic_directives_v2.quality_checked
--   is false. It has no bypass path.
--
-- Fix:
--   Add leo.bypass_completion_check GUC bypass at the top of the function,
--   consistent with the pattern already applied to:
--     - enforce_handoff_on_phase_transition
--     - auto_validate_handoff
--     - enforce_progress_on_completion
--
--   All other logic preserved verbatim.
--
-- Rollback: See bottom of file.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_sd_quality_on_advancement()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  bypass_enabled BOOLEAN;
BEGIN
  -- Only check when current_phase is actually changing
  IF NEW.current_phase IS NOT DISTINCT FROM OLD.current_phase THEN
    RETURN NEW;
  END IF;

  -- Emergency bypass via PostgreSQL session variable
  -- Usage: SET LOCAL leo.bypass_completion_check = 'true';
  BEGIN
    bypass_enabled := current_setting('leo.bypass_completion_check', true)::boolean;
  EXCEPTION WHEN OTHERS THEN
    bypass_enabled := false;
  END;

  IF bypass_enabled THEN
    RAISE NOTICE 'PCVP bypass: enforce_sd_quality_on_advancement waived for SD % (% -> %)',
      NEW.sd_key, OLD.current_phase, NEW.current_phase;
    RETURN NEW;
  END IF;

  -- Block transition FROM LEAD_APPROVAL to any later phase
  -- Later phases: LEAD_COMPLETE, LEAD_FINAL, LEAD_FINAL_APPROVAL, PLAN_PRD,
  --               PLAN_VERIFICATION, EXEC, EXEC_COMPLETE, COMPLETED
  -- Allow transitions backward to LEAD or DRAFT (not blocked)
  IF OLD.current_phase = 'LEAD_APPROVAL'
     AND NEW.current_phase NOT IN ('LEAD_APPROVAL', 'LEAD', 'DRAFT', 'CANCELLED')
     AND NEW.quality_checked = false THEN
    RAISE EXCEPTION 'Cannot advance SD past LEAD_APPROVAL: quality_checked is false. SD content does not meet minimum quality thresholds. Check quality_issues for details. (sd_key: %)', NEW.sd_key;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;

-- ============================================================
-- ROLLBACK (run manually if needed)
-- ============================================================
-- Re-apply the prior definition (without the bypass_enabled DECLARE and
-- the GUC-read block).
