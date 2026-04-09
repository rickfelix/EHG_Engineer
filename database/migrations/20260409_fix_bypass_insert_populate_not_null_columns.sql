-- PCVP Emergency Bypass Fix: Populate NOT NULL columns in bypass audit INSERT
-- SD: SD-LEO-PROTOCOL-PCVP-COMPLETION-INTEGRITY-001-A (follow-up chain: 3/3)
--
-- Chain context:
--   1. 20260409_fix_pcvp_emergency_bypass_allowlist.sql (merged PR #2872)
--      Added PCVP_EMERGENCY_BYPASS to enforce_handoff_system() allowlist.
--   2. 20260409_fix_auto_validate_handoff_pcvp_bypass.sql (local)
--      Added leo.bypass_completion_check GUC check to auto_validate_handoff().
--   3. (this file) 20260409_fix_bypass_insert_populate_not_null_columns.sql
--      Fixes NOT NULL constraint violations on 5 text columns in the
--      bypass audit INSERT inside enforce_handoff_on_phase_transition().
--
-- Problem:
--   The bypass INSERT previously populated only 8 columns:
--     sd_id, handoff_type, from_phase, to_phase, status,
--     validation_score, executive_summary, created_by
--   But sd_phase_handoffs has 5 additional NOT NULL text columns:
--     deliverables_manifest, key_decisions, known_issues,
--     resource_utilization, action_items
--   Smoke test hit PostgreSQL error 23502:
--     null value in column "deliverables_manifest" of relation "sd_phase_handoffs"
--
-- Fix:
--   Add explicit sentinel text values for the 5 missing NOT NULL columns
--   that clearly indicate this row was created via the emergency bypass.
--   The 7-element content validation is handled by auto_validate_handoff()
--   which already respects leo.bypass_completion_check; sentinels here only
--   need to satisfy the column-level NOT NULL constraint.
--
-- Preserves:
--   ALL other logic in enforce_handoff_on_phase_transition() verbatim:
--     - early-exit on unchanged phase/status
--     - GUC bypass detection
--     - phase-transition routing (LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN, PLAN-TO-LEAD)
--     - COMPLETED check requiring accepted handoff evidence
--     - ELSE branch for unknown transitions
--     - 24-hour recent_handoff lookup and final RAISE EXCEPTION
--
-- Rollback: See bottom of file.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_handoff_on_phase_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
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
    -- Log bypass to audit with sentinel values for NOT NULL text columns.
    -- These sentinels clearly mark the row as a bypass artifact so downstream
    -- reporting/analytics can filter it out. 7-element validation is waived
    -- by auto_validate_handoff() when leo.bypass_completion_check = 'true'.
    INSERT INTO sd_phase_handoffs (
      sd_id, handoff_type, from_phase, to_phase, status,
      validation_score, executive_summary, created_by,
      deliverables_manifest, key_decisions, known_issues,
      resource_utilization, action_items
    ) VALUES (
      NEW.id, 'BYPASS-COMPLETION', OLD.current_phase, NEW.current_phase, 'accepted',
      0, 'Emergency bypass via leo.bypass_completion_check',
      'PCVP_EMERGENCY_BYPASS',
      'N/A — PCVP emergency bypass row, no deliverables performed',
      'N/A — PCVP emergency bypass row, no decisions captured',
      'N/A — PCVP emergency bypass row, no issues captured',
      'N/A — PCVP emergency bypass row, no resource utilization captured',
      'N/A — PCVP emergency bypass row, no action items captured'
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
$function$;

COMMIT;

-- ============================================================
-- ROLLBACK (run manually if needed)
-- ============================================================
-- To revert, re-apply the prior definition from:
--   database/migrations/20260329_pcvp_phase1_close_bypass_holes.sql
-- (But note: that version will re-introduce the NOT NULL bug.)
