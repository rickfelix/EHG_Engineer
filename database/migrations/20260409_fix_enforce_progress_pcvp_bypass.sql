-- PCVP Emergency Bypass Fix: Add GUC bypass to enforce_progress_on_completion
-- SD: SD-LEO-PROTOCOL-PCVP-COMPLETION-INTEGRITY-001-A (follow-up chain: 5/?)
--
-- Chain context:
--   1. 20260409_fix_pcvp_emergency_bypass_allowlist.sql (merged PR #2872)
--   2. 20260409_fix_auto_validate_handoff_pcvp_bypass.sql (local)
--   3. 20260409_fix_bypass_insert_populate_not_null_columns.sql (local)
--   4. 20260409_fix_bypass_widen_phase_check_constraints.sql (local)
--   5. (this file) 20260409_fix_enforce_progress_pcvp_bypass.sql
--
-- Problem:
--   Smoke test now clears the bypass INSERT and CHECK constraints, but the
--   UPDATE that sets status='completed' is blocked by the BEFORE UPDATE
--   trigger enforce_progress_on_completion:
--     LEO Protocol Violation: Cannot mark SD complete
--     SD Type: documentation (using <NULL> validation profile)
--     Progress: 0% (need 100%)
--   This trigger has no bypass path. Its existing RAISE EXCEPTION message
--   even hints at leo.bypass_working_on_check, but the code never actually
--   reads that GUC — the hint is aspirational.
--
-- Fix:
--   Add a GUC bypass at the top of enforce_progress_on_completion():
--     - If leo.bypass_completion_check = 'true', force progress_percentage
--       to 100 (to keep dashboards coherent) and RETURN NEW immediately.
--   This is consistent with the bypass pattern already applied to
--   enforce_handoff_on_phase_transition() and auto_validate_handoff().
--
--   All other logic (progress calculation, 100% gate, deliverable
--   verification gate, exempt_types, error messages) is preserved verbatim.
--
-- Rollback: See bottom of file.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_progress_on_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  calculated_progress INTEGER;
  progress_breakdown JSONB;
  sd_type_val VARCHAR;
  has_exec_handoff BOOLEAN;
  exempt_types TEXT[] := ARRAY['orchestrator', 'documentation', 'docs'];
  bypass_enabled BOOLEAN;
BEGIN
  -- Only enforce when transitioning TO completed status
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN

    -- Emergency bypass via PostgreSQL session variable
    -- Usage: SET LOCAL leo.bypass_completion_check = 'true';
    BEGIN
      bypass_enabled := current_setting('leo.bypass_completion_check', true)::boolean;
    EXCEPTION WHEN OTHERS THEN
      bypass_enabled := false;
    END;

    IF bypass_enabled THEN
      RAISE NOTICE 'PCVP bypass: enforce_progress_on_completion waived for SD % (progress forced to 100)',
        NEW.id;
      -- Keep progress_percentage coherent with completed status so
      -- dashboards/reports don't show "completed but 0% progress".
      NEW.progress_percentage := 100;
      RETURN NEW;
    END IF;

    -- Get SD type for validation
    sd_type_val := COALESCE(NEW.sd_type, 'feature');

    -- Calculate progress dynamically using profile
    calculated_progress := calculate_sd_progress(NEW.id);

    -- Update progress_percentage field
    NEW.progress_percentage := calculated_progress;

    -- Block if progress is NULL
    IF calculated_progress IS NULL THEN
      RAISE EXCEPTION E'LEO Protocol Violation: Cannot mark SD complete\n\nProgress calculation returned NULL for SD type: %\n\nACTION REQUIRED:\n1. Verify sd_type_validation_profiles table has entry for ''%''\n2. Run: SELECT get_progress_breakdown(''%'') to debug',
        sd_type_val, sd_type_val, NEW.id;
    END IF;

    -- Block if progress < 100%
    IF calculated_progress < 100 THEN
      -- Get breakdown for error message
      progress_breakdown := get_progress_breakdown(NEW.id);

      RAISE EXCEPTION E'LEO Protocol Violation: Cannot mark SD complete\n\nSD Type: % (using % validation profile)\nProgress: %%% (need 100%%)\n\nProfile Requirements:\n%\n\nPhase Breakdown:\n%\n\nACTION REQUIRED:\n1. Review: SELECT get_progress_breakdown(''%'');\n2. Complete required phases for this SD type\n3. Or update sd_type if miscategorized',
        sd_type_val,
        COALESCE((progress_breakdown->'profile'->>'name'), '<NULL>'),
        calculated_progress,
        COALESCE((progress_breakdown->'profile')::text, '<NULL>'),
        COALESCE((progress_breakdown->'phases')::text, '<NULL>'),
        NEW.id;
    END IF;

    -- DELIVERABLE VERIFICATION GATE (SD-SD-COMPLETION-DELIVERABLE-VERIFICATION-ORCH-001-A)
    -- Code-producing SD types must have at least one EXEC-phase handoff as proof of work.
    -- This prevents phantom completions where progress reaches 100% but no code was shipped.
    IF sd_type_val != ALL(exempt_types) THEN
      SELECT EXISTS (
        SELECT 1 FROM sd_phase_handoffs
        WHERE sd_id = NEW.id
        AND status = 'accepted'
        AND handoff_type IN ('PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD')
      ) INTO has_exec_handoff;

      IF NOT has_exec_handoff THEN
        RAISE EXCEPTION E'LEO Protocol Violation: Cannot mark SD complete without deliverables\n\nSD Type: % (code-producing)\nNo EXEC-phase handoffs found in sd_phase_handoffs.\n\nThis means no implementation work was recorded for this SD.\nSDs must have at least one PLAN-TO-EXEC, EXEC-TO-PLAN, or PLAN-TO-LEAD handoff.\n\nExempt types: orchestrator, documentation\n\nACTION REQUIRED:\n1. Complete implementation and run handoff: node scripts/handoff.js execute PLAN-TO-EXEC %\n2. Or change sd_type to ''documentation'' if no code changes needed\n3. Or use SET LOCAL leo.bypass_completion_check = ''true'' for admin override',
          sd_type_val, NEW.sd_key;
      END IF;
    END IF;

  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;

-- ============================================================
-- ROLLBACK (run manually if needed)
-- ============================================================
-- To revert: re-apply the prior definition. The prior definition lacks the
-- bypass_enabled declaration and the GUC-read block at the top of the
-- status-transition branch.
