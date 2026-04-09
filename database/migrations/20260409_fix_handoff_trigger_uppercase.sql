-- Fix: enforce_handoff_on_phase_transition() trigger uses lowercase handoff_type strings
-- that can never match the sd_phase_handoffs_handoff_type_check CHECK constraint
-- (which requires UPPERCASE: 'LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD').
--
-- Source of truth: database/migrations/20260329_pcvp_phase1_close_bypass_holes.sql (lines 18-139).
-- Only the 4 handoff_type string literals (6 total occurrences) and the error message
-- ACTION REQUIRED block are updated to uppercase. All other logic is preserved verbatim.
--
-- Defect discovered while transitioning SD-LEO-ORCH-STAGE-STITCH-DESIGN-001 LEAD -> PLAN_PRD.

BEGIN;

CREATE OR REPLACE FUNCTION enforce_handoff_on_phase_transition()
RETURNS TRIGGER AS $$
DECLARE
  required_handoff_type VARCHAR(50);
  handoff_exists BOOLEAN;
  recent_handoff RECORD;
  handoff_count INT;
  bypass_enabled BOOLEAN;
BEGIN
  -- Only enforce if phase or status actually changed
  IF NEW.current_phase IS NOT DISTINCT FROM OLD.current_phase AND
     NEW.status IS NOT DISTINCT FROM OLD.status THEN
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
    RAISE NOTICE 'PCVP bypass enabled for SD % (% -> %)',
      NEW.id, OLD.current_phase, NEW.current_phase;
    -- Log bypass to audit
    INSERT INTO sd_phase_handoffs (
      sd_id, handoff_type, from_phase, to_phase, status,
      validation_score, executive_summary, created_by
    ) VALUES (
      NEW.id, 'BYPASS-COMPLETION', OLD.current_phase, NEW.current_phase, 'accepted',
      0, 'Emergency bypass via leo.bypass_completion_check',
      'PCVP_EMERGENCY_BYPASS'
    );
    RETURN NEW;
  END IF;

  -- Determine required handoff based on phase transition
  IF NEW.current_phase = 'PLAN' AND OLD.current_phase = 'LEAD' THEN
    required_handoff_type := 'LEAD-TO-PLAN';

  ELSIF NEW.current_phase = 'PLAN_PRD' AND OLD.current_phase = 'LEAD' THEN
    required_handoff_type := 'LEAD-TO-PLAN';

  ELSIF NEW.current_phase = 'EXEC' AND OLD.current_phase = 'PLAN' THEN
    required_handoff_type := 'PLAN-TO-EXEC';

  ELSIF NEW.current_phase = 'EXEC' AND OLD.current_phase = 'PLAN_PRD' THEN
    required_handoff_type := 'PLAN-TO-EXEC';

  ELSIF NEW.current_phase = 'PLAN' AND OLD.current_phase = 'EXEC' THEN
    required_handoff_type := 'EXEC-TO-PLAN';

  ELSIF NEW.current_phase = 'LEAD' AND OLD.current_phase = 'PLAN' AND NEW.status = 'pending_approval' THEN
    required_handoff_type := 'PLAN-TO-LEAD';

  ELSIF NEW.current_phase = 'COMPLETED' OR NEW.status = 'completed' THEN
    -- PCVP: Block COMPLETED transition unless handoff evidence exists
    -- Check that at least one accepted handoff record exists for this SD
    SELECT COUNT(*) INTO handoff_count
    FROM sd_phase_handoffs
    WHERE sd_id = NEW.id
    AND status = 'accepted';

    IF handoff_count = 0 THEN
      RAISE EXCEPTION E'PCVP Violation: Cannot transition to COMPLETED without handoff evidence.\n\n'
        'SD: %\n'
        'Transition: % → COMPLETED\n'
        'Handoff records found: 0\n\n'
        'Every SD must have at least one accepted handoff record before completion.\n'
        'Use SET LOCAL leo.bypass_completion_check = ''true'' for emergency bypass.',
        NEW.id,
        OLD.current_phase
      USING HINT = 'Complete the LEAD->PLAN->EXEC workflow before marking as completed';
    END IF;

    -- Handoff evidence exists, allow transition
    RETURN NEW;

  ELSE
    -- Unknown transition - allow but log for monitoring
    RAISE NOTICE 'PCVP: Unrecognized phase transition % -> % for SD %, allowing',
      OLD.current_phase, NEW.current_phase, NEW.id;
    RETURN NEW;
  END IF;

  -- Check if required handoff exists (created within last 24 hours to prevent stale handoffs)
  SELECT * INTO recent_handoff
  FROM sd_phase_handoffs
  WHERE sd_id = NEW.id
  AND handoff_type = required_handoff_type
  AND status = 'accepted'
  AND created_at > NOW() - INTERVAL '24 hours'
  ORDER BY created_at DESC
  LIMIT 1;

  IF recent_handoff IS NULL THEN
    RAISE EXCEPTION E'LEO Protocol Violation: Phase transition blocked\n\n'
      'Phase: % → %\n'
      'Required handoff: %\n'
      'Status: Missing or not accepted\n\n'
      'ACTION REQUIRED:\n'
      '1. Run: node scripts/unified-handoff-system.js execute % %\n'
      '2. Ensure handoff includes all 7 mandatory elements\n'
      '3. Wait for handoff to be accepted\n'
      '4. Then retry phase transition',
      OLD.current_phase,
      NEW.current_phase,
      required_handoff_type,
      required_handoff_type,
      NEW.id
    USING HINT = 'Use unified handoff system to create required handoff';
  END IF;

  RAISE NOTICE 'Handoff verification passed: % (created %)',
    required_handoff_type,
    recent_handoff.created_at;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- Rollback:
-- Re-run database/migrations/20260329_pcvp_phase1_close_bypass_holes.sql (lines 18-139)
-- which contains the original (broken) lowercase version.
