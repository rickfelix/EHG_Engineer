-- ============================================================================
-- Migration: Fix Progress Calculation for Reduced Workflow SD Types
-- Date: 2026-02-13
--
-- Root Cause:
-- sd_workflow_template_steps defines EXEC_implementation with completion signal
-- 'handoff:EXEC-TO-PLAN' for ALL non-orchestrator SD types. But infrastructure
-- and docs types use a reduced workflow that SKIPS EXEC-TO-PLAN (going directly
-- from EXEC to PLAN-TO-LEAD). This means these types can never reach 100%
-- progress through the intended workflow.
--
-- Fix:
-- 1. Update template steps for infrastructure/docs to use alternative signal:
--    'handoff:EXEC-TO-PLAN|handoff:PLAN-TO-LEAD'
-- 2. Update BOTH overloads of get_progress_breakdown() (TEXT and UUID) to
--    handle pipe-separated OR signals generically instead of hardcoding each
--    combination. Also fix the hardcoded fallback for reduced-workflow types.
--
-- IMPORTANT: get_progress_breakdown has TWO overloads:
--   - get_progress_breakdown(sd_id_param TEXT)  -- called by calculate_sd_progress
--   - get_progress_breakdown(sd_id_param UUID)  -- direct UUID calls
-- Both must be updated.
--
-- Affected SD types: infrastructure, docs
-- Impact: These types were stuck at ~50% max progress (EXEC_implementation weight=50)
-- ============================================================================

-- ============================================================================
-- PART 1: Update template steps for reduced-workflow SD types
-- ============================================================================

-- Infrastructure: EXEC completion signaled by either EXEC-TO-PLAN OR PLAN-TO-LEAD
UPDATE sd_workflow_template_steps
SET completion_signal = 'handoff:EXEC-TO-PLAN|handoff:PLAN-TO-LEAD'
WHERE template_id = (
  SELECT id FROM sd_workflow_templates
  WHERE sd_type = 'infrastructure' AND is_active = true
)
AND step_key = 'EXEC_implementation';

-- Docs: EXEC completion signaled by either EXEC-TO-PLAN OR PLAN-TO-LEAD
UPDATE sd_workflow_template_steps
SET completion_signal = 'handoff:EXEC-TO-PLAN|handoff:PLAN-TO-LEAD'
WHERE template_id = (
  SELECT id FROM sd_workflow_templates
  WHERE sd_type = 'docs' AND is_active = true
)
AND step_key = 'EXEC_implementation';

-- ============================================================================
-- PART 2A: Update get_progress_breakdown(UUID) with generic OR signal handler
-- ============================================================================

CREATE OR REPLACE FUNCTION get_progress_breakdown(sd_id_param UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  sd RECORD;
  result jsonb;
  total_children INT;
  completed_children INT;
  blocked_children INT;
  retrospective_exists BOOLEAN;
  lead_to_plan_exists BOOLEAN;
  plan_to_lead_exists BOOLEAN;
  plan_to_exec_exists BOOLEAN;
  exec_to_plan_exists BOOLEAN;
  lead_final_exists BOOLEAN;
  final_handoff_exists BOOLEAN;
  total_progress INT := 0;
  sd_type_profile RECORD;
  phase_breakdown jsonb := '{}'::jsonb;
  -- Template variables
  tmpl RECORD;
  step RECORD;
  step_complete BOOLEAN;
  step_progress NUMERIC;
  use_template BOOLEAN := false;
  -- Generic OR signal handling (2026-02-13)
  signal_part TEXT;
  signal_parts TEXT[];
BEGIN
  -- Load SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'SD not found', 'sd_id', sd_id_param);
  END IF;

  -- Load validation profile
  SELECT * INTO sd_type_profile
  FROM sd_type_validation_profiles
  WHERE sd_type = COALESCE(sd.sd_type, 'feature');

  -- Check handoffs
  SELECT EXISTS (SELECT 1 FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND handoff_type = 'LEAD-TO-PLAN' AND status = 'accepted') INTO lead_to_plan_exists;
  SELECT EXISTS (SELECT 1 FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND handoff_type = 'PLAN-TO-EXEC' AND status = 'accepted') INTO plan_to_exec_exists;
  SELECT EXISTS (SELECT 1 FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND handoff_type = 'EXEC-TO-PLAN' AND status = 'accepted') INTO exec_to_plan_exists;
  SELECT EXISTS (SELECT 1 FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND handoff_type = 'PLAN-TO-LEAD' AND status = 'accepted') INTO plan_to_lead_exists;

  -- FIX (2026-02-13): Check BOTH sd_phase_handoffs AND leo_handoff_executions for LEAD-FINAL-APPROVAL.
  SELECT EXISTS (
    SELECT 1 FROM sd_phase_handoffs
    WHERE sd_id = sd_id_param AND handoff_type = 'LEAD-FINAL-APPROVAL' AND status = 'accepted'
    UNION ALL
    SELECT 1 FROM leo_handoff_executions
    WHERE sd_id = sd_id_param AND handoff_type = 'LEAD-FINAL-APPROVAL' AND status = 'accepted'
  ) INTO lead_final_exists;

  SELECT EXISTS (SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param) INTO retrospective_exists;

  -- Count children
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE status = 'blocked')
  INTO total_children, completed_children, blocked_children
  FROM strategic_directives_v2
  WHERE parent_sd_id = sd_id_param;

  -- Try to load active template for this SD type
  SELECT t.* INTO tmpl
  FROM sd_workflow_templates t
  WHERE t.sd_type = COALESCE(sd.sd_type, 'feature')
    AND t.is_active = true;

  IF FOUND THEN
    use_template := true;
  END IF;

  -- ==========================================================================
  -- TEMPLATE-BASED PROGRESS (when template exists)
  -- ==========================================================================
  IF use_template THEN
    FOR step IN
      SELECT s.* FROM sd_workflow_template_steps s
      WHERE s.template_id = tmpl.id
      ORDER BY s.step_order
    LOOP
      step_complete := false;
      step_progress := 0;

      -- Evaluate completion based on completion_signal
      CASE
        WHEN step.completion_signal = 'handoff:LEAD-TO-PLAN' THEN
          IF (sd.sd_type = 'orchestrator' OR total_children > 0) THEN
            step_complete := lead_to_plan_exists OR total_children > 0;
          ELSE
            step_complete := lead_to_plan_exists;
          END IF;

        WHEN step.completion_signal = 'handoff:PLAN-TO-EXEC' THEN
          step_complete := plan_to_exec_exists;

        WHEN step.completion_signal = 'handoff:EXEC-TO-PLAN' THEN
          step_complete := exec_to_plan_exists;

        WHEN step.completion_signal = 'handoff:PLAN-TO-LEAD' THEN
          step_complete := plan_to_lead_exists;

        WHEN step.completion_signal = 'handoff:LEAD-FINAL-APPROVAL' THEN
          step_complete := lead_final_exists;

        WHEN step.completion_signal = 'artifact:retrospective' THEN
          step_complete := retrospective_exists;

        WHEN step.completion_signal = 'children:all_complete' THEN
          IF total_children > 0 THEN
            step_progress := step.weight * completed_children / total_children;
            step_complete := (completed_children = total_children);
          ELSE
            step_complete := false;
          END IF;

        ELSE
          -- =================================================================
          -- GENERIC PIPE-SEPARATED OR SIGNAL HANDLER (2026-02-13)
          -- Handles signals like 'handoff:EXEC-TO-PLAN|handoff:PLAN-TO-LEAD'
          -- by splitting on '|' and checking each part against known signals.
          -- If ANY part matches, the step is complete.
          -- =================================================================
          IF position('|' in step.completion_signal) > 0 THEN
            signal_parts := string_to_array(step.completion_signal, '|');
            step_complete := false;
            FOREACH signal_part IN ARRAY signal_parts
            LOOP
              CASE signal_part
                WHEN 'handoff:LEAD-TO-PLAN' THEN
                  IF lead_to_plan_exists THEN step_complete := true; END IF;
                WHEN 'handoff:PLAN-TO-EXEC' THEN
                  IF plan_to_exec_exists THEN step_complete := true; END IF;
                WHEN 'handoff:EXEC-TO-PLAN' THEN
                  IF exec_to_plan_exists THEN step_complete := true; END IF;
                WHEN 'handoff:PLAN-TO-LEAD' THEN
                  IF plan_to_lead_exists THEN step_complete := true; END IF;
                WHEN 'handoff:LEAD-FINAL-APPROVAL' THEN
                  IF lead_final_exists THEN step_complete := true; END IF;
                WHEN 'artifact:retrospective' THEN
                  IF retrospective_exists THEN step_complete := true; END IF;
                ELSE
                  NULL;
              END CASE;
            END LOOP;
          ELSE
            step_complete := false;
          END IF;
      END CASE;

      -- Calculate progress (children:all_complete has partial credit above)
      IF step.completion_signal != 'children:all_complete' THEN
        step_progress := CASE WHEN step_complete THEN step.weight ELSE 0 END;
      END IF;

      total_progress := total_progress + step_progress;

      phase_breakdown := phase_breakdown || jsonb_build_object(
        step.step_key,
        jsonb_build_object(
          'weight', step.weight,
          'complete', step_complete,
          'progress', step_progress,
          'step_order', step.step_order,
          'source', 'template'
        )
      );
    END LOOP;

    result := jsonb_build_object(
      'sd_id', sd_id_param,
      'sd_type', COALESCE(sd.sd_type, 'feature'),
      'is_orchestrator', (sd.sd_type = 'orchestrator' OR total_children > 0),
      'total_progress', total_progress,
      'template_id', tmpl.id,
      'template_version', tmpl.version,
      'requires_prd', COALESCE(sd_type_profile.requires_prd, true),
      'requires_e2e_tests', COALESCE(sd_type_profile.requires_e2e_tests, true),
      'requires_user_stories', COALESCE(sd_type_profile.requires_user_stories, true),
      'requires_deliverables', COALESCE(sd_type_profile.requires_deliverables, true),
      'requires_retrospective', COALESCE(sd_type_profile.requires_retrospective, true),
      'phase_breakdown', phase_breakdown
    );

    RETURN result;
  END IF;

  -- ==========================================================================
  -- FALLBACK: Original hardcoded logic (when no template exists)
  -- ==========================================================================

  -- ORCHESTRATOR progress calculation
  IF sd.sd_type = 'orchestrator' OR total_children > 0 THEN
    IF lead_to_plan_exists OR total_children > 0 THEN
      total_progress := total_progress + 20;
      phase_breakdown := phase_breakdown || jsonb_build_object('LEAD_initial', jsonb_build_object(
        'weight', 20, 'complete', true, 'progress', 20,
        'note', CASE WHEN lead_to_plan_exists
          THEN 'LEAD-TO-PLAN handoff indicates orchestrator approved and active'
          ELSE 'Auto-granted: children exist (proves orchestrator activation)'
        END,
        'lead_to_plan_handoff_exists', lead_to_plan_exists,
        'source', 'hardcoded'
      ));
    ELSE
      phase_breakdown := phase_breakdown || jsonb_build_object('LEAD_initial', jsonb_build_object(
        'weight', 20, 'complete', false, 'progress', 0,
        'note', 'LEAD-TO-PLAN handoff indicates orchestrator approved and active',
        'source', 'hardcoded'
      ));
    END IF;

    final_handoff_exists := plan_to_lead_exists OR plan_to_exec_exists;
    IF final_handoff_exists THEN
      total_progress := total_progress + 5;
    END IF;
    phase_breakdown := phase_breakdown || jsonb_build_object('FINAL_handoff', jsonb_build_object(
      'weight', 5, 'complete', final_handoff_exists, 'progress', CASE WHEN final_handoff_exists THEN 5 ELSE 0 END,
      'required', true,
      'note', 'PLAN-TO-LEAD or PLAN-TO-EXEC indicating orchestrator work complete',
      'plan_to_lead_exists', plan_to_lead_exists,
      'plan_to_exec_exists', plan_to_exec_exists,
      'source', 'hardcoded'
    ));

    IF retrospective_exists THEN
      total_progress := total_progress + 15;
    END IF;
    phase_breakdown := phase_breakdown || jsonb_build_object('RETROSPECTIVE', jsonb_build_object(
      'weight', 15, 'complete', retrospective_exists, 'progress', CASE WHEN retrospective_exists THEN 15 ELSE 0 END,
      'required', COALESCE(sd_type_profile.requires_retrospective, true),
      'source', 'hardcoded'
    ));

    IF total_children > 0 THEN
      total_progress := total_progress + (60 * completed_children / total_children);
      phase_breakdown := phase_breakdown || jsonb_build_object('CHILDREN_completion', jsonb_build_object(
        'weight', 60, 'complete', completed_children = total_children,
        'progress', (60 * completed_children / total_children),
        'total_children', total_children, 'completed_children', completed_children,
        'note', completed_children || ' of ' || total_children || ' children completed',
        'source', 'hardcoded'
      ));
    END IF;

    result := jsonb_build_object(
      'sd_id', sd_id_param,
      'sd_type', COALESCE(sd.sd_type, 'orchestrator'),
      'is_orchestrator', true,
      'total_progress', total_progress,
      'requires_prd', COALESCE(sd_type_profile.requires_prd, false),
      'requires_e2e_tests', COALESCE(sd_type_profile.requires_e2e_tests, false),
      'requires_user_stories', COALESCE(sd_type_profile.requires_user_stories, false),
      'requires_deliverables', COALESCE(sd_type_profile.requires_deliverables, false),
      'requires_retrospective', COALESCE(sd_type_profile.requires_retrospective, true),
      'phase_breakdown', phase_breakdown
    );

    RETURN result;
  END IF;

  -- STANDARD SD progress calculation (non-orchestrator)
  IF lead_to_plan_exists THEN
    total_progress := total_progress + 10;
  END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('LEAD_approval', jsonb_build_object(
    'weight', 10, 'complete', lead_to_plan_exists, 'progress', CASE WHEN lead_to_plan_exists THEN 10 ELSE 0 END,
    'plan_to_exec_accepted', plan_to_exec_exists,
    'source', 'hardcoded'
  ));

  IF plan_to_exec_exists THEN
    total_progress := total_progress + 10;
  END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('PLAN_verification', jsonb_build_object(
    'weight', 10, 'complete', plan_to_exec_exists, 'progress', CASE WHEN plan_to_exec_exists THEN 10 ELSE 0 END,
    'plan_to_exec_accepted', plan_to_exec_exists,
    'source', 'hardcoded'
  ));

  -- FIX (2026-02-13): For reduced-workflow types (infrastructure, docs),
  -- PLAN-TO-LEAD also satisfies EXEC completion since they skip EXEC-TO-PLAN.
  IF exec_to_plan_exists OR (COALESCE(sd.sd_type, 'feature') IN ('infrastructure', 'docs') AND plan_to_lead_exists) THEN
    total_progress := total_progress + 50;
  END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('EXEC_implementation', jsonb_build_object(
    'weight', 50,
    'complete', exec_to_plan_exists OR (COALESCE(sd.sd_type, 'feature') IN ('infrastructure', 'docs') AND plan_to_lead_exists),
    'progress', CASE WHEN exec_to_plan_exists OR (COALESCE(sd.sd_type, 'feature') IN ('infrastructure', 'docs') AND plan_to_lead_exists) THEN 50 ELSE 0 END,
    'required', COALESCE(sd_type_profile.requires_deliverables, true),
    'note', CASE WHEN NOT COALESCE(sd_type_profile.requires_deliverables, true)
      THEN 'Auto-complete: deliverables not required for ' || COALESCE(sd.sd_type, 'feature')
      ELSE NULL END,
    'exec_to_plan_accepted', exec_to_plan_exists,
    'plan_to_lead_accepted', plan_to_lead_exists,
    'source', 'hardcoded'
  ));

  IF plan_to_lead_exists THEN
    total_progress := total_progress + 10;
  END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('LEAD_review', jsonb_build_object(
    'weight', 10, 'complete', plan_to_lead_exists, 'progress', CASE WHEN plan_to_lead_exists THEN 10 ELSE 0 END,
    'source', 'hardcoded'
  ));

  IF retrospective_exists THEN
    total_progress := total_progress + 10;
  END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('RETROSPECTIVE', jsonb_build_object(
    'weight', 10, 'complete', retrospective_exists, 'progress', CASE WHEN retrospective_exists THEN 10 ELSE 0 END,
    'required', COALESCE(sd_type_profile.requires_retrospective, true),
    'retrospective_exists', retrospective_exists,
    'retrospective_required', COALESCE(sd_type_profile.requires_retrospective, true),
    'source', 'hardcoded'
  ));

  IF lead_final_exists THEN
    total_progress := total_progress + 10;
  END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('LEAD_final_approval', jsonb_build_object(
    'weight', 10, 'complete', lead_final_exists, 'progress', CASE WHEN lead_final_exists THEN 10 ELSE 0 END,
    'min_handoffs', 0,
    'handoffs_count', (SELECT COUNT(*) FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND status = 'accepted'),
    'retrospective_exists', retrospective_exists,
    'retrospective_required', COALESCE(sd_type_profile.requires_retrospective, true),
    'source', 'hardcoded'
  ));

  result := jsonb_build_object(
    'sd_id', sd_id_param,
    'sd_type', COALESCE(sd.sd_type, 'feature'),
    'is_orchestrator', false,
    'total_progress', total_progress,
    'requires_prd', COALESCE(sd_type_profile.requires_prd, true),
    'requires_e2e_tests', COALESCE(sd_type_profile.requires_e2e_tests, true),
    'requires_user_stories', COALESCE(sd_type_profile.requires_user_stories, true),
    'requires_deliverables', COALESCE(sd_type_profile.requires_deliverables, true),
    'requires_retrospective', COALESCE(sd_type_profile.requires_retrospective, true),
    'phase_breakdown', phase_breakdown
  );

  RETURN result;
END;
$$;

-- ============================================================================
-- PART 2B: Update get_progress_breakdown(TEXT) with generic OR signal handler
-- This is the overload called by calculate_sd_progress()
-- ============================================================================

CREATE OR REPLACE FUNCTION get_progress_breakdown(sd_id_param TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  sd RECORD;
  result jsonb;
  total_children INT;
  completed_children INT;
  blocked_children INT;
  retrospective_exists BOOLEAN;
  lead_to_plan_exists BOOLEAN;
  plan_to_lead_exists BOOLEAN;
  plan_to_exec_exists BOOLEAN;
  exec_to_plan_exists BOOLEAN;
  lead_final_exists BOOLEAN;
  final_handoff_exists BOOLEAN;
  total_progress INT := 0;
  sd_type_profile RECORD;
  phase_breakdown jsonb := '{}'::jsonb;
  tmpl RECORD;
  step RECORD;
  step_complete BOOLEAN;
  step_progress NUMERIC;
  use_template BOOLEAN := false;
  -- Generic OR signal handling (2026-02-13)
  signal_part TEXT;
  signal_parts TEXT[];
BEGIN
  -- Load SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'SD not found', 'sd_id', sd_id_param);
  END IF;

  -- Load validation profile
  SELECT * INTO sd_type_profile
  FROM sd_type_validation_profiles
  WHERE sd_type = COALESCE(sd.sd_type, 'feature');

  -- Check handoffs
  SELECT EXISTS (SELECT 1 FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND handoff_type = 'LEAD-TO-PLAN' AND status = 'accepted') INTO lead_to_plan_exists;
  SELECT EXISTS (SELECT 1 FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND handoff_type = 'PLAN-TO-EXEC' AND status = 'accepted') INTO plan_to_exec_exists;
  SELECT EXISTS (SELECT 1 FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND handoff_type = 'EXEC-TO-PLAN' AND status = 'accepted') INTO exec_to_plan_exists;
  SELECT EXISTS (SELECT 1 FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND handoff_type = 'PLAN-TO-LEAD' AND status = 'accepted') INTO plan_to_lead_exists;

  -- FIX (2026-02-13): Check BOTH sd_phase_handoffs AND leo_handoff_executions for LEAD-FINAL-APPROVAL
  SELECT EXISTS (
    SELECT 1 FROM sd_phase_handoffs
    WHERE sd_id = sd_id_param AND handoff_type = 'LEAD-FINAL-APPROVAL' AND status = 'accepted'
    UNION ALL
    SELECT 1 FROM leo_handoff_executions
    WHERE sd_id = sd_id_param AND handoff_type = 'LEAD-FINAL-APPROVAL' AND status = 'accepted'
  ) INTO lead_final_exists;

  SELECT EXISTS (SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param) INTO retrospective_exists;

  -- Count children
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE status = 'blocked')
  INTO total_children, completed_children, blocked_children
  FROM strategic_directives_v2
  WHERE parent_sd_id = sd_id_param;

  -- Try to load active template for this SD type
  SELECT t.* INTO tmpl
  FROM sd_workflow_templates t
  WHERE t.sd_type = COALESCE(sd.sd_type, 'feature')
    AND t.is_active = true;

  IF FOUND THEN
    use_template := true;
  END IF;

  -- ==========================================================================
  -- TEMPLATE-BASED PROGRESS (when template exists)
  -- ==========================================================================
  IF use_template THEN
    FOR step IN
      SELECT s.* FROM sd_workflow_template_steps s
      WHERE s.template_id = tmpl.id
      ORDER BY s.step_order
    LOOP
      step_complete := false;
      step_progress := 0;

      -- Evaluate completion based on completion_signal
      CASE
        WHEN step.completion_signal = 'handoff:LEAD-TO-PLAN' THEN
          IF (sd.sd_type = 'orchestrator' OR total_children > 0) THEN
            step_complete := lead_to_plan_exists OR total_children > 0;
          ELSE
            step_complete := lead_to_plan_exists;
          END IF;

        WHEN step.completion_signal = 'handoff:PLAN-TO-EXEC' THEN
          step_complete := plan_to_exec_exists;

        WHEN step.completion_signal = 'handoff:EXEC-TO-PLAN' THEN
          step_complete := exec_to_plan_exists;

        WHEN step.completion_signal = 'handoff:PLAN-TO-LEAD' THEN
          step_complete := plan_to_lead_exists;

        WHEN step.completion_signal = 'handoff:LEAD-FINAL-APPROVAL' THEN
          step_complete := lead_final_exists;

        WHEN step.completion_signal = 'artifact:retrospective' THEN
          step_complete := retrospective_exists;

        WHEN step.completion_signal = 'children:all_complete' THEN
          IF total_children > 0 THEN
            step_progress := step.weight * completed_children / total_children;
            step_complete := (completed_children = total_children);
          ELSE
            step_complete := false;
          END IF;

        ELSE
          -- =================================================================
          -- GENERIC PIPE-SEPARATED OR SIGNAL HANDLER (2026-02-13)
          -- =================================================================
          IF position('|' in step.completion_signal) > 0 THEN
            signal_parts := string_to_array(step.completion_signal, '|');
            step_complete := false;
            FOREACH signal_part IN ARRAY signal_parts
            LOOP
              CASE signal_part
                WHEN 'handoff:LEAD-TO-PLAN' THEN
                  IF lead_to_plan_exists THEN step_complete := true; END IF;
                WHEN 'handoff:PLAN-TO-EXEC' THEN
                  IF plan_to_exec_exists THEN step_complete := true; END IF;
                WHEN 'handoff:EXEC-TO-PLAN' THEN
                  IF exec_to_plan_exists THEN step_complete := true; END IF;
                WHEN 'handoff:PLAN-TO-LEAD' THEN
                  IF plan_to_lead_exists THEN step_complete := true; END IF;
                WHEN 'handoff:LEAD-FINAL-APPROVAL' THEN
                  IF lead_final_exists THEN step_complete := true; END IF;
                WHEN 'artifact:retrospective' THEN
                  IF retrospective_exists THEN step_complete := true; END IF;
                ELSE
                  NULL;
              END CASE;
            END LOOP;
          ELSE
            step_complete := false;
          END IF;
      END CASE;

      -- Calculate progress (children:all_complete has partial credit above)
      IF step.completion_signal <> 'children:all_complete' THEN
        step_progress := CASE WHEN step_complete THEN step.weight ELSE 0 END;
      END IF;

      total_progress := total_progress + step_progress;

      phase_breakdown := phase_breakdown || jsonb_build_object(
        step.step_key,
        jsonb_build_object(
          'weight', step.weight,
          'complete', step_complete,
          'progress', step_progress,
          'step_order', step.step_order,
          'source', 'template'
        )
      );
    END LOOP;

    result := jsonb_build_object(
      'sd_id', sd_id_param,
      'sd_type', COALESCE(sd.sd_type, 'feature'),
      'is_orchestrator', (sd.sd_type = 'orchestrator' OR total_children > 0),
      'total_progress', total_progress,
      'template_id', tmpl.id,
      'template_version', tmpl.version,
      'requires_prd', COALESCE(sd_type_profile.requires_prd, true),
      'requires_e2e_tests', COALESCE(sd_type_profile.requires_e2e_tests, true),
      'requires_user_stories', COALESCE(sd_type_profile.requires_user_stories, true),
      'requires_deliverables', COALESCE(sd_type_profile.requires_deliverables, true),
      'requires_retrospective', COALESCE(sd_type_profile.requires_retrospective, true),
      'phase_breakdown', phase_breakdown
    );

    RETURN result;
  END IF;

  -- ==========================================================================
  -- FALLBACK: Original hardcoded logic (when no template exists)
  -- ==========================================================================

  -- ORCHESTRATOR progress calculation
  IF sd.sd_type = 'orchestrator' OR total_children > 0 THEN
    IF lead_to_plan_exists OR total_children > 0 THEN
      total_progress := total_progress + 20;
      phase_breakdown := phase_breakdown || jsonb_build_object('LEAD_initial', jsonb_build_object(
        'weight', 20, 'complete', true, 'progress', 20,
        'note', CASE WHEN lead_to_plan_exists
          THEN 'LEAD-TO-PLAN handoff indicates orchestrator approved and active'
          ELSE 'Auto-granted: children exist (proves orchestrator activation)'
        END,
        'lead_to_plan_handoff_exists', lead_to_plan_exists,
        'source', 'hardcoded'
      ));
    ELSE
      phase_breakdown := phase_breakdown || jsonb_build_object('LEAD_initial', jsonb_build_object(
        'weight', 20, 'complete', false, 'progress', 0,
        'note', 'LEAD-TO-PLAN handoff indicates orchestrator approved and active',
        'source', 'hardcoded'
      ));
    END IF;

    final_handoff_exists := plan_to_lead_exists OR plan_to_exec_exists;
    IF final_handoff_exists THEN
      total_progress := total_progress + 5;
    END IF;
    phase_breakdown := phase_breakdown || jsonb_build_object('FINAL_handoff', jsonb_build_object(
      'weight', 5, 'complete', final_handoff_exists, 'progress', CASE WHEN final_handoff_exists THEN 5 ELSE 0 END,
      'required', true,
      'note', 'PLAN-TO-LEAD or PLAN-TO-EXEC indicating orchestrator work complete',
      'plan_to_lead_exists', plan_to_lead_exists,
      'plan_to_exec_exists', plan_to_exec_exists,
      'source', 'hardcoded'
    ));

    IF retrospective_exists THEN
      total_progress := total_progress + 15;
    END IF;
    phase_breakdown := phase_breakdown || jsonb_build_object('RETROSPECTIVE', jsonb_build_object(
      'weight', 15, 'complete', retrospective_exists, 'progress', CASE WHEN retrospective_exists THEN 15 ELSE 0 END,
      'required', COALESCE(sd_type_profile.requires_retrospective, true),
      'source', 'hardcoded'
    ));

    IF total_children > 0 THEN
      total_progress := total_progress + (60 * completed_children / total_children);
      phase_breakdown := phase_breakdown || jsonb_build_object('CHILDREN_completion', jsonb_build_object(
        'weight', 60, 'complete', completed_children = total_children,
        'progress', (60 * completed_children / total_children),
        'total_children', total_children, 'completed_children', completed_children,
        'note', completed_children || ' of ' || total_children || ' children completed',
        'source', 'hardcoded'
      ));
    END IF;

    result := jsonb_build_object(
      'sd_id', sd_id_param,
      'sd_type', COALESCE(sd.sd_type, 'orchestrator'),
      'is_orchestrator', true,
      'total_progress', total_progress,
      'requires_prd', COALESCE(sd_type_profile.requires_prd, false),
      'requires_e2e_tests', COALESCE(sd_type_profile.requires_e2e_tests, false),
      'requires_user_stories', COALESCE(sd_type_profile.requires_user_stories, false),
      'requires_deliverables', COALESCE(sd_type_profile.requires_deliverables, false),
      'requires_retrospective', COALESCE(sd_type_profile.requires_retrospective, true),
      'phase_breakdown', phase_breakdown
    );

    RETURN result;
  END IF;

  -- STANDARD SD progress calculation (non-orchestrator)
  IF lead_to_plan_exists THEN
    total_progress := total_progress + 10;
  END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('LEAD_approval', jsonb_build_object(
    'weight', 10, 'complete', lead_to_plan_exists, 'progress', CASE WHEN lead_to_plan_exists THEN 10 ELSE 0 END,
    'plan_to_exec_accepted', plan_to_exec_exists,
    'source', 'hardcoded'
  ));

  IF plan_to_exec_exists THEN
    total_progress := total_progress + 10;
  END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('PLAN_verification', jsonb_build_object(
    'weight', 10, 'complete', plan_to_exec_exists, 'progress', CASE WHEN plan_to_exec_exists THEN 10 ELSE 0 END,
    'plan_to_exec_accepted', plan_to_exec_exists,
    'source', 'hardcoded'
  ));

  -- FIX (2026-02-13): For reduced-workflow types (infrastructure, docs),
  -- PLAN-TO-LEAD also satisfies EXEC completion since they skip EXEC-TO-PLAN.
  IF exec_to_plan_exists OR (COALESCE(sd.sd_type, 'feature') IN ('infrastructure', 'docs') AND plan_to_lead_exists) THEN
    total_progress := total_progress + 50;
  END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('EXEC_implementation', jsonb_build_object(
    'weight', 50,
    'complete', exec_to_plan_exists OR (COALESCE(sd.sd_type, 'feature') IN ('infrastructure', 'docs') AND plan_to_lead_exists),
    'progress', CASE WHEN exec_to_plan_exists OR (COALESCE(sd.sd_type, 'feature') IN ('infrastructure', 'docs') AND plan_to_lead_exists) THEN 50 ELSE 0 END,
    'required', COALESCE(sd_type_profile.requires_deliverables, true),
    'note', CASE WHEN NOT COALESCE(sd_type_profile.requires_deliverables, true)
      THEN 'Auto-complete: deliverables not required for ' || COALESCE(sd.sd_type, 'feature')
      ELSE NULL END,
    'exec_to_plan_accepted', exec_to_plan_exists,
    'plan_to_lead_accepted', plan_to_lead_exists,
    'source', 'hardcoded'
  ));

  IF plan_to_lead_exists THEN
    total_progress := total_progress + 10;
  END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('LEAD_review', jsonb_build_object(
    'weight', 10, 'complete', plan_to_lead_exists, 'progress', CASE WHEN plan_to_lead_exists THEN 10 ELSE 0 END,
    'source', 'hardcoded'
  ));

  IF retrospective_exists THEN
    total_progress := total_progress + 10;
  END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('RETROSPECTIVE', jsonb_build_object(
    'weight', 10, 'complete', retrospective_exists, 'progress', CASE WHEN retrospective_exists THEN 10 ELSE 0 END,
    'required', COALESCE(sd_type_profile.requires_retrospective, true),
    'retrospective_exists', retrospective_exists,
    'retrospective_required', COALESCE(sd_type_profile.requires_retrospective, true),
    'source', 'hardcoded'
  ));

  IF lead_final_exists THEN
    total_progress := total_progress + 10;
  END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('LEAD_final_approval', jsonb_build_object(
    'weight', 10, 'complete', lead_final_exists, 'progress', CASE WHEN lead_final_exists THEN 10 ELSE 0 END,
    'min_handoffs', 0,
    'handoffs_count', (SELECT COUNT(*) FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND status = 'accepted'),
    'retrospective_exists', retrospective_exists,
    'retrospective_required', COALESCE(sd_type_profile.requires_retrospective, true),
    'source', 'hardcoded'
  ));

  result := jsonb_build_object(
    'sd_id', sd_id_param,
    'sd_type', COALESCE(sd.sd_type, 'feature'),
    'is_orchestrator', false,
    'total_progress', total_progress,
    'requires_prd', COALESCE(sd_type_profile.requires_prd, true),
    'requires_e2e_tests', COALESCE(sd_type_profile.requires_e2e_tests, true),
    'requires_user_stories', COALESCE(sd_type_profile.requires_user_stories, true),
    'requires_deliverables', COALESCE(sd_type_profile.requires_deliverables, true),
    'requires_retrospective', COALESCE(sd_type_profile.requires_retrospective, true),
    'phase_breakdown', phase_breakdown
  );

  RETURN result;
END;
$func$;
