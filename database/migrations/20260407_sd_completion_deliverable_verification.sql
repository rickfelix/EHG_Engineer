-- Migration: SD Completion Deliverable Verification Gate
-- SD: SD-SD-COMPLETION-DELIVERABLE-VERIFICATION-ORCH-001-A
-- Purpose: Prevent SDs from being marked COMPLETED without evidence of shipped work.
--          Code-producing SD types (feature, bugfix, infrastructure, refactor, security,
--          database, performance) must have at least one EXEC-phase handoff in
--          sd_phase_handoffs. Orchestrator and documentation types are exempt.

CREATE OR REPLACE FUNCTION enforce_progress_on_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  calculated_progress INTEGER;
  progress_breakdown JSONB;
  sd_type_val VARCHAR;
  has_exec_handoff BOOLEAN;
  exempt_types TEXT[] := ARRAY['orchestrator', 'documentation', 'docs'];
BEGIN
  -- Only enforce when transitioning TO completed status
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN

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
        RAISE EXCEPTION E'LEO Protocol Violation: Cannot mark SD complete without deliverables\n\nSD Type: % (code-producing)\nNo EXEC-phase handoffs found in sd_phase_handoffs.\n\nThis means no implementation work was recorded for this SD.\nSDs must have at least one PLAN-TO-EXEC, EXEC-TO-PLAN, or PLAN-TO-LEAD handoff.\n\nExempt types: orchestrator, documentation\n\nACTION REQUIRED:\n1. Complete implementation and run handoff: node scripts/handoff.js execute PLAN-TO-EXEC %\n2. Or change sd_type to ''documentation'' if no code changes needed\n3. Or use SET LOCAL leo.bypass_working_on_check = ''true'' for admin override',
          sd_type_val, NEW.sd_key;
      END IF;
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION enforce_progress_on_completion IS
'Trigger function that blocks SD completion if: (1) calculated progress < 100%, or (2) code-producing SD types have no EXEC-phase handoffs. Orchestrator and documentation types are exempt from deliverable check.';
