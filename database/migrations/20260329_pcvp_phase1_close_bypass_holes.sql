-- PCVP Phase 1: Close Completion Bypass Holes
-- SD: SD-LEO-PROTOCOL-PCVP-COMPLETION-INTEGRITY-001-A
--
-- Changes:
-- 1. Modify enforce_handoff_on_phase_transition() to block COMPLETED transitions without handoffs
-- 2. Enhance complete_orchestrator_sd() to verify child quality (handoff records) not just count
--
-- Rollback: See bottom of file

BEGIN;

-- ============================================================
-- 1. Fix enforce_handoff_on_phase_transition trigger
--    Close the ELSE->RETURN NEW bypass that allows any unlisted
--    phase transition (including LEAD->COMPLETED) without handoffs
-- ============================================================

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
    required_handoff_type := 'LEAD-to-PLAN';

  ELSIF NEW.current_phase = 'PLAN_PRD' AND OLD.current_phase = 'LEAD' THEN
    required_handoff_type := 'LEAD-to-PLAN';

  ELSIF NEW.current_phase = 'EXEC' AND OLD.current_phase = 'PLAN' THEN
    required_handoff_type := 'PLAN-to-EXEC';

  ELSIF NEW.current_phase = 'EXEC' AND OLD.current_phase = 'PLAN_PRD' THEN
    required_handoff_type := 'PLAN-to-EXEC';

  ELSIF NEW.current_phase = 'PLAN' AND OLD.current_phase = 'EXEC' THEN
    required_handoff_type := 'EXEC-to-PLAN';

  ELSIF NEW.current_phase = 'LEAD' AND OLD.current_phase = 'PLAN' AND NEW.status = 'pending_approval' THEN
    required_handoff_type := 'PLAN-to-LEAD';

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


-- ============================================================
-- 2. Enhance complete_orchestrator_sd() to verify child quality
--    Check that each child has handoff records, not just status
-- ============================================================

CREATE OR REPLACE FUNCTION complete_orchestrator_sd(sd_id_param VARCHAR)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sd RECORD;
  is_orch BOOLEAN;
  children_done BOOLEAN;
  retro_exists BOOLEAN;
  total_children INT;
  completed_children INT;
  children_without_handoffs INT;
  child_quality_issues JSONB;
BEGIN
  -- Get SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'SD not found: ' || sd_id_param
    );
  END IF;

  -- Already completed?
  IF sd.status = 'completed' THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'SD already completed',
      'sd_id', sd_id_param
    );
  END IF;

  -- Check if orchestrator
  is_orch := is_orchestrator_sd(sd_id_param);

  IF NOT is_orch THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not an orchestrator SD (has no children)',
      'sd_id', sd_id_param
    );
  END IF;

  -- Check children completion (count-based)
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO total_children, completed_children
  FROM strategic_directives_v2
  WHERE parent_sd_id = sd_id_param;

  children_done := (completed_children = total_children);

  IF NOT children_done THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Not all children completed: %s/%s', completed_children, total_children),
      'completed_children', completed_children,
      'total_children', total_children
    );
  END IF;

  -- PCVP: Verify child quality - each completed child must have at least 1 accepted handoff
  SELECT COUNT(*) INTO children_without_handoffs
  FROM strategic_directives_v2 child
  WHERE child.parent_sd_id = sd_id_param
  AND child.status = 'completed'
  AND NOT EXISTS (
    SELECT 1 FROM sd_phase_handoffs h
    WHERE h.sd_id = child.id
    AND h.status = 'accepted'
  );

  IF children_without_handoffs > 0 THEN
    -- Collect details of problematic children
    SELECT jsonb_agg(jsonb_build_object(
      'sd_key', child.sd_key,
      'title', child.title,
      'issue', 'No accepted handoff records found'
    ))
    INTO child_quality_issues
    FROM strategic_directives_v2 child
    WHERE child.parent_sd_id = sd_id_param
    AND child.status = 'completed'
    AND NOT EXISTS (
      SELECT 1 FROM sd_phase_handoffs h
      WHERE h.sd_id = child.id
      AND h.status = 'accepted'
    );

    RETURN jsonb_build_object(
      'success', false,
      'error', format('PCVP: %s child(ren) completed without handoff evidence', children_without_handoffs),
      'children_without_handoffs', children_without_handoffs,
      'quality_issues', child_quality_issues,
      'hint', 'Each child SD must have at least one accepted handoff in sd_phase_handoffs'
    );
  END IF;

  -- Check retrospective exists
  SELECT EXISTS (
    SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param
  ) INTO retro_exists;

  IF NOT retro_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Retrospective required but not found',
      'hint', 'Create a retrospective before completing'
    );
  END IF;

  -- All criteria met - complete the orchestrator
  INSERT INTO sd_phase_handoffs (
    sd_id,
    handoff_type,
    from_phase,
    to_phase,
    status,
    validation_score,
    executive_summary,
    deliverables_manifest,
    completeness_report,
    created_by
  ) VALUES (
    sd_id_param,
    'PLAN-TO-LEAD',
    'PLAN',
    'LEAD',
    'accepted',
    100,
    format('Orchestrator auto-completion: All %s child SDs completed with verified handoff evidence.', total_children),
    format('All %s child SDs completed with passing status and handoff records.', total_children),
    jsonb_build_object(
      'children_completed', completed_children,
      'children_total', total_children,
      'children_without_handoffs', 0,
      'quality_verified', true,
      'auto_completed', true,
      'completion_date', now()
    ),
    'ORCHESTRATOR_AUTO_COMPLETE'
  );

  -- Update SD status
  UPDATE strategic_directives_v2
  SET
    status = 'completed',
    current_phase = 'COMPLETED',
    is_working_on = false,
    updated_at = now()
  WHERE id = sd_id_param;

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Orchestrator completed: %s/%s children done (quality verified)', completed_children, total_children),
    'sd_id', sd_id_param,
    'completed_children', completed_children,
    'quality_verified', true
  );
END;
$$;

COMMIT;

-- ============================================================
-- ROLLBACK (run manually if needed)
-- ============================================================
-- To revert enforce_handoff_on_phase_transition:
--   Restore from: database/migrations/leo_protocol_enforcement_004_handoff_triggers.sql
--
-- To revert complete_orchestrator_sd:
--   Restore from: database/migrations/20251221_orchestrator_auto_complete.sql
