-- ============================================================================
-- Migration: Fix Template-Based Progress for Optional Retrospectives
-- Issue: SD-LEO-FIX-REMEDIATE-LEARNING-PIPELINE-001 blocked at 90%
-- Root Cause: Template system checks retrospective_exists without respecting
--             requires_retrospective flag from sd_type_validation_profiles
-- Date: 2026-02-11
-- ============================================================================

-- ANALYSIS:
-- The get_progress_breakdown() function uses templates (sd_workflow_templates)
-- but doesn't check sd_type_validation_profiles.requires_retrospective.
-- For bugfix SDs, requires_retrospective = false, so the 10% retrospective
-- weight should be auto-granted even if no retrospective record exists.

-- FIX:
-- Update the template evaluation logic for 'artifact:retrospective' to check
-- requires_retrospective flag. If false, auto-complete the step.

CREATE OR REPLACE FUNCTION get_progress_breakdown(sd_id_param text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  SELECT EXISTS (SELECT 1 FROM sd_phase_handoffs WHERE sd_id = sd_id_param AND handoff_type = 'LEAD-FINAL-APPROVAL' AND status = 'accepted') INTO lead_final_exists;
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
          -- Orchestrators: also complete if children exist
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
          -- FIX: Check if retrospective is required for this SD type
          IF COALESCE(sd_type_profile.requires_retrospective, true) THEN
            -- Retrospective is required, check if it exists
            step_complete := retrospective_exists;
          ELSE
            -- Retrospective is optional, auto-complete this step
            step_complete := true;
          END IF;

        WHEN step.completion_signal = 'handoff:PLAN-TO-LEAD|handoff:PLAN-TO-EXEC' THEN
          step_complete := plan_to_lead_exists OR plan_to_exec_exists;

        WHEN step.completion_signal = 'children:all_complete' THEN
          -- Partial credit for children
          IF total_children > 0 THEN
            step_progress := step.weight * completed_children / total_children;
            step_complete := (completed_children = total_children);
          ELSE
            step_complete := false;
          END IF;

        ELSE
          -- Unknown signal: treat as incomplete, log warning
          step_complete := false;
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
    -- Phase 1: LEAD approval (20%)
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

    -- Phase 2: Final handoff (5%)
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

    -- Phase 3: Retrospective (15%)
    -- FIX: Check requires_retrospective flag
    IF COALESCE(sd_type_profile.requires_retrospective, true) THEN
      IF retrospective_exists THEN
        total_progress := total_progress + 15;
      END IF;
      phase_breakdown := phase_breakdown || jsonb_build_object('RETROSPECTIVE', jsonb_build_object(
        'weight', 15, 'complete', retrospective_exists, 'progress', CASE WHEN retrospective_exists THEN 15 ELSE 0 END,
        'required', true,
        'source', 'hardcoded'
      ));
    ELSE
      -- Auto-complete retrospective for SDs that don't require it
      total_progress := total_progress + 15;
      phase_breakdown := phase_breakdown || jsonb_build_object('RETROSPECTIVE', jsonb_build_object(
        'weight', 15, 'complete', true, 'progress', 15,
        'required', false,
        'note', 'Auto-granted: retrospective not required for ' || COALESCE(sd.sd_type, 'feature'),
        'source', 'hardcoded'
      ));
    END IF;

    -- Phase 4: Children completion (60%)
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
  -- Phase 1: LEAD approval (10%)
  IF lead_to_plan_exists THEN
    total_progress := total_progress + 10;
  END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('LEAD_approval', jsonb_build_object(
    'weight', 10, 'complete', lead_to_plan_exists, 'progress', CASE WHEN lead_to_plan_exists THEN 10 ELSE 0 END,
    'plan_to_exec_accepted', plan_to_exec_exists,
    'source', 'hardcoded'
  ));

  -- Phase 2: PLAN verification (10%)
  IF plan_to_exec_exists THEN
    total_progress := total_progress + 10;
  END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('PLAN_verification', jsonb_build_object(
    'weight', 10, 'complete', plan_to_exec_exists, 'progress', CASE WHEN plan_to_exec_exists THEN 10 ELSE 0 END,
    'plan_to_exec_accepted', plan_to_exec_exists,
    'source', 'hardcoded'
  ));

  -- Phase 3: EXEC implementation (50%)
  IF exec_to_plan_exists THEN
    total_progress := total_progress + 50;
  END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('EXEC_implementation', jsonb_build_object(
    'weight', 50, 'complete', exec_to_plan_exists, 'progress', CASE WHEN exec_to_plan_exists THEN 50 ELSE 0 END,
    'required', COALESCE(sd_type_profile.requires_deliverables, true),
    'note', CASE WHEN NOT COALESCE(sd_type_profile.requires_deliverables, true)
      THEN 'Auto-complete: deliverables not required for ' || COALESCE(sd.sd_type, 'feature')
      ELSE NULL END,
    'exec_to_plan_accepted', exec_to_plan_exists,
    'source', 'hardcoded'
  ));

  -- Phase 4: LEAD review (10%)
  IF plan_to_lead_exists THEN
    total_progress := total_progress + 10;
  END IF;
  phase_breakdown := phase_breakdown || jsonb_build_object('LEAD_review', jsonb_build_object(
    'weight', 10, 'complete', plan_to_lead_exists, 'progress', CASE WHEN plan_to_lead_exists THEN 10 ELSE 0 END,
    'source', 'hardcoded'
  ));

  -- Phase 5: Retrospective (10%)
  -- FIX: Check requires_retrospective flag
  IF COALESCE(sd_type_profile.requires_retrospective, true) THEN
    IF retrospective_exists THEN
      total_progress := total_progress + 10;
    END IF;
    phase_breakdown := phase_breakdown || jsonb_build_object('RETROSPECTIVE', jsonb_build_object(
      'weight', 10, 'complete', retrospective_exists, 'progress', CASE WHEN retrospective_exists THEN 10 ELSE 0 END,
      'required', true,
      'retrospective_exists', retrospective_exists,
      'retrospective_required', true,
      'source', 'hardcoded'
    ));
  ELSE
    -- Auto-complete retrospective for SDs that don't require it
    total_progress := total_progress + 10;
    phase_breakdown := phase_breakdown || jsonb_build_object('RETROSPECTIVE', jsonb_build_object(
      'weight', 10, 'complete', true, 'progress', 10,
      'required', false,
      'retrospective_exists', retrospective_exists,
      'retrospective_required', false,
      'note', 'Auto-granted: retrospective not required for ' || COALESCE(sd.sd_type, 'feature'),
      'source', 'hardcoded'
    ));
  END IF;

  -- Phase 6: LEAD final approval (10%)
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
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
  progress_result jsonb;
BEGIN
  -- Test on SD-LEO-FIX-REMEDIATE-LEARNING-PIPELINE-001
  SELECT get_progress_breakdown('f657aa24-1b7a-4af6-98ca-993e21322695') INTO progress_result;

  RAISE NOTICE '=== Migration Verification ===';
  RAISE NOTICE 'SD: SD-LEO-FIX-REMEDIATE-LEARNING-PIPELINE-001';
  RAISE NOTICE 'Total Progress: %', progress_result->>'total_progress';
  RAISE NOTICE 'RETROSPECTIVE complete: %', progress_result->'phase_breakdown'->'RETROSPECTIVE'->>'complete';
  RAISE NOTICE 'RETROSPECTIVE progress: %', progress_result->'phase_breakdown'->'RETROSPECTIVE'->>'progress';

  IF (progress_result->>'total_progress')::INT = 100 THEN
    RAISE NOTICE '✓ Migration successful - SD can now be marked as completed';
  ELSE
    RAISE WARNING '⚠ Progress is still %%, expected 100%%', progress_result->>'total_progress';
  END IF;
END $$;

COMMENT ON FUNCTION get_progress_breakdown IS
'Calculates SD progress breakdown using templates when available, with fallback to hardcoded logic.
FIXED: Respects requires_retrospective flag from sd_type_validation_profiles - auto-completes retrospective step for SD types that do not require it (e.g., bugfix with requires_retrospective=false).';
