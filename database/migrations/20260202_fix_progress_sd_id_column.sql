-- Migration: Fix get_progress_breakdown PRD column name and handoff checks
-- Date: 2026-02-02
-- Root Cause: Function uses 'directive_id' but actual column is 'sd_id'
--             EXEC/PLAN phases don't check accepted handoffs
-- Fix: Use correct column name and check handoffs for phase completion

CREATE OR REPLACE FUNCTION get_progress_breakdown(sd_id_param text)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sd RECORD;
  sd_type_val text;
  profile RECORD;
  breakdown JSONB;
  total_progress INTEGER;
  is_orchestrator_flag BOOLEAN;
  total_children INT;
  completed_children INT;

  -- Component states
  prd_exists BOOLEAN;
  deliverables_complete BOOLEAN;
  user_stories_validated BOOLEAN;
  retrospective_exists BOOLEAN;
  handoffs_count INT;
  lead_to_plan_handoff_exists BOOLEAN;
  final_handoff_exists BOOLEAN;

  -- NEW: Handoff-based phase completion
  plan_to_exec_accepted BOOLEAN;
  exec_to_plan_accepted BOOLEAN;
BEGIN
  -- Get SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'SD not found');
  END IF;

  -- ============================================================================
  -- ORCHESTRATOR PATH (CRITICAL: Check this FIRST)
  -- ============================================================================
  -- Check if orchestrator (has children OR sd_type='orchestrator')
  is_orchestrator_flag := is_orchestrator_sd(sd_id_param) OR sd.sd_type = 'orchestrator';

  IF is_orchestrator_flag THEN
    -- Get child completion stats
    SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE status = 'completed')
    INTO total_children, completed_children
    FROM strategic_directives_v2
    WHERE parent_sd_id = sd_id_param;

    -- Check retrospective
    SELECT EXISTS (
      SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param
    ) INTO retrospective_exists;

    -- Check LEAD-TO-PLAN handoff (initial orchestrator approval)
    SELECT EXISTS (
      SELECT 1 FROM sd_phase_handoffs
      WHERE sd_id = sd_id_param
      AND handoff_type = 'LEAD-TO-PLAN'
      AND status = 'accepted'
    ) INTO lead_to_plan_handoff_exists;

    -- Check final handoff (PLAN-TO-LEAD or PLAN-TO-EXEC both valid)
    SELECT EXISTS (
      SELECT 1 FROM sd_phase_handoffs
      WHERE sd_id = sd_id_param
      AND handoff_type IN ('PLAN-TO-LEAD', 'PLAN-TO-EXEC')
      AND status = 'accepted'
    ) INTO final_handoff_exists;

    -- Calculate orchestrator progress
    total_progress := calculate_orchestrator_progress(sd_id_param);

    -- Return orchestrator-specific breakdown
    RETURN jsonb_build_object(
      'sd_id', sd_id_param,
      'sd_type', COALESCE(sd.sd_type, 'feature'),
      'is_orchestrator', true,
      'status', sd.status,
      'profile', jsonb_build_object(
        'name', 'orchestrator',
        'description', 'Parent SD that coordinates child SDs. Progress based on child completion.',
        'requires_prd', false,
        'requires_deliverables', false,
        'requires_e2e_tests', false,
        'requires_retrospective', true,
        'min_handoffs', 1
      ),
      'phases', jsonb_build_object(
        'LEAD_initial', jsonb_build_object(
          'weight', 20,
          'complete', lead_to_plan_handoff_exists,
          'progress', CASE WHEN lead_to_plan_handoff_exists THEN 20 ELSE 0 END,
          'note', 'LEAD-TO-PLAN handoff indicates orchestrator approved and active'
        ),
        'CHILDREN_completion', jsonb_build_object(
          'weight', 60,
          'complete', completed_children = total_children AND total_children > 0,
          'progress', CASE WHEN total_children > 0 THEN (60 * completed_children / total_children) ELSE 0 END,
          'total_children', total_children,
          'completed_children', completed_children,
          'note', format('%s of %s children completed', completed_children, total_children)
        ),
        'RETROSPECTIVE', jsonb_build_object(
          'weight', 15,
          'complete', retrospective_exists,
          'progress', CASE WHEN retrospective_exists THEN 15 ELSE 0 END,
          'required', true
        ),
        'FINAL_handoff', jsonb_build_object(
          'weight', 5,
          'complete', final_handoff_exists,
          'progress', CASE WHEN final_handoff_exists THEN 5 ELSE 0 END,
          'required', true,
          'note', 'PLAN-TO-LEAD or PLAN-TO-EXEC indicating orchestrator work complete'
        )
      ),
      'total_progress', total_progress,
      'can_complete', total_progress = 100
    );
  END IF;

  -- ============================================================================
  -- STANDARD SD BREAKDOWN (FIXED logic)
  -- ============================================================================
  sd_type_val := COALESCE(sd.sd_type, 'feature');
  SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = sd_type_val;

  IF NOT FOUND THEN
    SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = 'feature';
  END IF;

  -- Check each component
  -- FIX: Use 'sd_id' column instead of 'directive_id'
  SELECT EXISTS (
    SELECT 1 FROM product_requirements_v2 WHERE sd_id = sd_id_param
  ) INTO prd_exists;

  SELECT EXISTS (
    SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param
  ) INTO retrospective_exists;

  SELECT COUNT(DISTINCT handoff_type) INTO handoffs_count
  FROM sd_phase_handoffs
  WHERE sd_id = sd_id_param AND status = 'accepted';

  -- NEW: Check for accepted handoffs that indicate phase completion
  SELECT EXISTS (
    SELECT 1 FROM sd_phase_handoffs
    WHERE sd_id = sd_id_param
    AND handoff_type = 'PLAN-TO-EXEC'
    AND status = 'accepted'
  ) INTO plan_to_exec_accepted;

  SELECT EXISTS (
    SELECT 1 FROM sd_phase_handoffs
    WHERE sd_id = sd_id_param
    AND handoff_type = 'EXEC-TO-PLAN'
    AND status = 'accepted'
  ) INTO exec_to_plan_accepted;

  -- Calculate total
  total_progress := calculate_sd_progress(sd_id_param);

  -- Build standard breakdown
  -- FIX: Phase completion now based on accepted handoffs
  breakdown := jsonb_build_object(
    'sd_id', sd_id_param,
    'sd_type', sd_type_val,
    'is_orchestrator', false,
    'current_phase', sd.current_phase,
    'status', sd.status,
    'profile', jsonb_build_object(
      'name', profile.sd_type,
      'description', profile.description,
      'requires_prd', profile.requires_prd,
      'requires_deliverables', profile.requires_deliverables,
      'requires_e2e_tests', profile.requires_e2e_tests,
      'requires_sub_agents', profile.requires_sub_agents,
      'requires_retrospective', profile.requires_retrospective,
      'min_handoffs', profile.min_handoffs
    ),
    'phases', jsonb_build_object(
      'LEAD_approval', jsonb_build_object(
        'weight', profile.lead_weight,
        'complete', sd.status IN ('active', 'in_progress', 'pending_approval', 'completed'),
        'progress', CASE WHEN sd.status IN ('active', 'in_progress', 'pending_approval', 'completed')
                        THEN profile.lead_weight ELSE 0 END,
        'required', true
      ),
      'PLAN_prd', jsonb_build_object(
        'weight', profile.plan_weight,
        'complete', NOT profile.requires_prd OR prd_exists,
        'progress', CASE WHEN NOT profile.requires_prd OR prd_exists
                        THEN profile.plan_weight ELSE 0 END,
        'required', profile.requires_prd,
        'prd_exists', prd_exists
      ),
      'PLAN_verification', jsonb_build_object(
        'weight', profile.verify_weight,
        -- FIX: Complete if e2e not required OR PLAN-TO-EXEC handoff accepted
        'complete', NOT profile.requires_e2e_tests OR plan_to_exec_accepted,
        'progress', CASE WHEN NOT profile.requires_e2e_tests OR plan_to_exec_accepted
                        THEN profile.verify_weight ELSE 0 END,
        'required', profile.requires_e2e_tests,
        'plan_to_exec_accepted', plan_to_exec_accepted,
        'note', CASE
          WHEN NOT profile.requires_e2e_tests THEN 'Auto-complete: E2E tests not required for ' || sd_type_val
          WHEN plan_to_exec_accepted THEN 'Complete: PLAN-TO-EXEC handoff accepted'
          ELSE NULL
        END
      ),
      'EXEC_implementation', jsonb_build_object(
        'weight', profile.exec_weight,
        -- FIX: Complete if deliverables not required OR EXEC-TO-PLAN handoff accepted
        'complete', NOT profile.requires_deliverables OR exec_to_plan_accepted,
        'progress', CASE WHEN NOT profile.requires_deliverables OR exec_to_plan_accepted
                        THEN profile.exec_weight ELSE 0 END,
        'required', profile.requires_deliverables,
        'exec_to_plan_accepted', exec_to_plan_accepted,
        'note', CASE
          WHEN NOT profile.requires_deliverables THEN 'Auto-complete: deliverables not required for ' || sd_type_val
          WHEN exec_to_plan_accepted THEN 'Complete: EXEC-TO-PLAN handoff accepted'
          ELSE NULL
        END
      ),
      'LEAD_final_approval', jsonb_build_object(
        'weight', profile.final_weight,
        'complete', retrospective_exists AND handoffs_count >= profile.min_handoffs,
        'progress', CASE WHEN retrospective_exists AND handoffs_count >= profile.min_handoffs
                        THEN profile.final_weight ELSE 0 END,
        'retrospective_required', profile.requires_retrospective,
        'retrospective_exists', retrospective_exists,
        'min_handoffs', profile.min_handoffs,
        'handoffs_count', handoffs_count
      )
    ),
    'total_progress', total_progress,
    'can_complete', total_progress = 100
  );

  RETURN breakdown;
END;
$$;

-- Also fix calculate_sd_progress to use correct column and handoff checks
CREATE OR REPLACE FUNCTION calculate_sd_progress(sd_id_param text)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sd RECORD;
  profile RECORD;
  sd_type_val text;
  progress INTEGER := 0;

  -- Component states
  prd_exists BOOLEAN;
  retrospective_exists BOOLEAN;
  handoffs_count INT;
  plan_to_exec_accepted BOOLEAN;
  exec_to_plan_accepted BOOLEAN;
BEGIN
  -- Get SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Check if orchestrator - use different calculation
  IF is_orchestrator_sd(sd_id_param) OR sd.sd_type = 'orchestrator' THEN
    RETURN calculate_orchestrator_progress(sd_id_param);
  END IF;

  -- Get profile
  sd_type_val := COALESCE(sd.sd_type, 'feature');
  SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = sd_type_val;
  IF NOT FOUND THEN
    SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = 'feature';
  END IF;

  -- Check components
  -- FIX: Use 'sd_id' column instead of 'directive_id'
  SELECT EXISTS (
    SELECT 1 FROM product_requirements_v2 WHERE sd_id = sd_id_param
  ) INTO prd_exists;

  SELECT EXISTS (
    SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param
  ) INTO retrospective_exists;

  SELECT COUNT(DISTINCT handoff_type) INTO handoffs_count
  FROM sd_phase_handoffs
  WHERE sd_id = sd_id_param AND status = 'accepted';

  -- NEW: Check handoffs
  SELECT EXISTS (
    SELECT 1 FROM sd_phase_handoffs
    WHERE sd_id = sd_id_param
    AND handoff_type = 'PLAN-TO-EXEC'
    AND status = 'accepted'
  ) INTO plan_to_exec_accepted;

  SELECT EXISTS (
    SELECT 1 FROM sd_phase_handoffs
    WHERE sd_id = sd_id_param
    AND handoff_type = 'EXEC-TO-PLAN'
    AND status = 'accepted'
  ) INTO exec_to_plan_accepted;

  -- Calculate progress
  -- LEAD approval
  IF sd.status IN ('active', 'in_progress', 'pending_approval', 'completed') THEN
    progress := progress + profile.lead_weight;
  END IF;

  -- PLAN PRD (FIX: Now correctly detects PRD)
  IF NOT profile.requires_prd OR prd_exists THEN
    progress := progress + profile.plan_weight;
  END IF;

  -- PLAN verification (FIX: Now checks PLAN-TO-EXEC handoff)
  IF NOT profile.requires_e2e_tests OR plan_to_exec_accepted THEN
    progress := progress + profile.verify_weight;
  END IF;

  -- EXEC implementation (FIX: Now checks EXEC-TO-PLAN handoff)
  IF NOT profile.requires_deliverables OR exec_to_plan_accepted THEN
    progress := progress + profile.exec_weight;
  END IF;

  -- LEAD final approval
  IF retrospective_exists AND handoffs_count >= profile.min_handoffs THEN
    progress := progress + profile.final_weight;
  END IF;

  RETURN progress;
END;
$$;

COMMENT ON FUNCTION get_progress_breakdown IS
'Returns detailed progress breakdown. Fixed 2026-02-02: Uses sd_id column (not directive_id), checks PLAN-TO-EXEC/EXEC-TO-PLAN handoffs for phase completion.';

COMMENT ON FUNCTION calculate_sd_progress IS
'Calculates SD progress percentage. Fixed 2026-02-02: Uses sd_id column, checks handoff acceptance for PLAN/EXEC phases.';
