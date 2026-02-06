-- Migration: Restore Orchestrator Progress Calculation Logic (Final)
-- Date: 2026-02-02
-- Root Cause: leo_protocol_enforcement_007_progress_enforcement.sql overwrote
--             orchestrator-specific logic from 20251212_orchestrator_sd_completion.sql
-- Issue: Orchestrator SDs stuck at 75% - missing final handoff check
-- Fix: Check for EITHER PLAN-TO-LEAD OR PLAN-TO-EXEC for orchestrator completion

-- ============================================================================
-- FUNCTION: Calculate Orchestrator Progress - Fixed Handoff Check
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_orchestrator_progress(sd_id_param text)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sd RECORD;
  total_children INT;
  completed_children INT;
  retrospective_exists BOOLEAN;
  lead_to_plan_exists BOOLEAN;
  final_handoff_exists BOOLEAN;
BEGIN
  -- Get SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Count children
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO total_children, completed_children
  FROM strategic_directives_v2
  WHERE parent_sd_id = sd_id_param;

  -- Not an orchestrator (no children)
  IF total_children = 0 AND sd.sd_type != 'orchestrator' THEN
    RETURN NULL;  -- Use standard calculation
  END IF;

  -- Orchestrator progress is based on:
  -- 1. LEAD initial approval (20%) - LEAD-TO-PLAN handoff exists
  -- 2. Child completion (60%) - weighted by completed children
  -- 3. Retrospective (15%) - orchestrator needs its own retrospective
  -- 4. Final handoff (5%) - PLAN-TO-LEAD OR PLAN-TO-EXEC (indicates orchestrator complete)

  DECLARE
    progress INTEGER := 0;
  BEGIN
    -- Phase 1: LEAD approval (20%) - LEAD-TO-PLAN handoff
    SELECT EXISTS (
      SELECT 1 FROM sd_phase_handoffs
      WHERE sd_id = sd_id_param
      AND handoff_type = 'LEAD-TO-PLAN'
      AND status = 'accepted'
    ) INTO lead_to_plan_exists;

    IF lead_to_plan_exists THEN
      progress := progress + 20;
    END IF;

    -- Phase 2: Child completion (60%)
    -- Pro-rate based on children completed
    IF total_children > 0 THEN
      progress := progress + (60 * completed_children / total_children);
    ELSE
      -- No children tracked yet, but marked as orchestrator type
      progress := progress + 0;
    END IF;

    -- Phase 3: Retrospective (15%)
    SELECT EXISTS (
      SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param
    ) INTO retrospective_exists;

    IF retrospective_exists THEN
      progress := progress + 15;
    END IF;

    -- Phase 4: Final handoff (5%) - Accept PLAN-TO-LEAD OR PLAN-TO-EXEC
    -- PLAN-TO-EXEC is valid for orchestrators that follow PLAN phase completion
    SELECT EXISTS (
      SELECT 1 FROM sd_phase_handoffs
      WHERE sd_id = sd_id_param
      AND handoff_type IN ('PLAN-TO-LEAD', 'PLAN-TO-EXEC')
      AND status = 'accepted'
    ) INTO final_handoff_exists;

    IF final_handoff_exists THEN
      progress := progress + 5;
    END IF;

    RETURN progress;
  END;
END;
$$;

-- ============================================================================
-- FUNCTION: Get Progress Breakdown - Fixed Handoff Check
-- ============================================================================

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
  -- STANDARD SD BREAKDOWN (existing logic)
  -- ============================================================================
  sd_type_val := COALESCE(sd.sd_type, 'feature');
  SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = sd_type_val;

  IF NOT FOUND THEN
    SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = 'feature';
  END IF;

  -- Check each component
  SELECT EXISTS (
    SELECT 1 FROM product_requirements_v2 WHERE directive_id = sd_id_param
  ) INTO prd_exists;

  SELECT EXISTS (
    SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param
  ) INTO retrospective_exists;

  SELECT COUNT(DISTINCT handoff_type) INTO handoffs_count
  FROM sd_phase_handoffs
  WHERE sd_id = sd_id_param AND status = 'accepted';

  -- Calculate total
  total_progress := calculate_sd_progress(sd_id_param);

  -- Build standard breakdown
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
      'EXEC_implementation', jsonb_build_object(
        'weight', profile.exec_weight,
        'complete', NOT profile.requires_deliverables,
        'progress', CASE WHEN NOT profile.requires_deliverables
                        THEN profile.exec_weight ELSE 0 END,
        'required', profile.requires_deliverables,
        'note', CASE WHEN NOT profile.requires_deliverables
                     THEN 'Auto-complete: deliverables not required for ' || sd_type_val ELSE NULL END
      ),
      'PLAN_verification', jsonb_build_object(
        'weight', profile.verify_weight,
        'complete', NOT profile.requires_e2e_tests,
        'progress', CASE WHEN NOT profile.requires_e2e_tests
                        THEN profile.verify_weight ELSE 0 END,
        'required', profile.requires_e2e_tests,
        'note', CASE WHEN NOT profile.requires_e2e_tests
                     THEN 'Auto-complete: E2E tests not required for ' || sd_type_val ELSE NULL END
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

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION calculate_orchestrator_progress IS
'Calculates progress for orchestrator SDs. Checks for PLAN-TO-LEAD OR PLAN-TO-EXEC as valid final handoffs (both indicate orchestrator work complete).';

COMMENT ON FUNCTION get_progress_breakdown IS
'Returns detailed progress breakdown. FIRST checks if orchestrator (has children OR sd_type=orchestrator), then returns orchestrator-specific breakdown with PLAN-TO-LEAD or PLAN-TO-EXEC as valid final handoffs.';
