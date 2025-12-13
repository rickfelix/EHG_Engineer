-- Migration: Add Orchestrator SD Support to Progress Calculation
-- Date: 2025-12-12
-- Issue: Parent orchestrator SDs can't complete because they don't have their own
--        EXEC-TO-PLAN handoffs - children do the work instead.
-- Solution: Detect orchestrator SDs and calculate progress based on child completion.
--
-- Orchestrator SDs:
-- - Have children (parent_sd_id points to them)
-- - Don't produce code directly (children do)
-- - Don't have PRDs (children have PRDs)
-- - Complete when ALL children complete
-- - Need retrospective but not EXEC-TO-PLAN handoffs

-- ============================================================================
-- FUNCTION: Check if SD is an Orchestrator (has children)
-- ============================================================================

CREATE OR REPLACE FUNCTION is_orchestrator_sd(sd_id_param VARCHAR)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM strategic_directives_v2
    WHERE parent_sd_id = sd_id_param
  );
END;
$$;

-- ============================================================================
-- FUNCTION: Check if All Children of Orchestrator are Complete
-- ============================================================================

CREATE OR REPLACE FUNCTION orchestrator_children_complete(sd_id_param VARCHAR)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_children INT;
  completed_children INT;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed')
  INTO total_children, completed_children
  FROM strategic_directives_v2
  WHERE parent_sd_id = sd_id_param;

  -- No children = not an orchestrator
  IF total_children = 0 THEN
    RETURN FALSE;
  END IF;

  RETURN completed_children = total_children;
END;
$$;

-- ============================================================================
-- FUNCTION: Calculate Orchestrator SD Progress
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_orchestrator_progress(sd_id_param VARCHAR)
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
  handoffs_count INT;
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

  -- Not an orchestrator
  IF total_children = 0 THEN
    RETURN NULL;  -- Use standard calculation
  END IF;

  -- Orchestrator progress is based on:
  -- 1. LEAD initial approval (20%) - if status is active or beyond
  -- 2. Child completion (60%) - weighted by completed children
  -- 3. Retrospective (15%) - orchestrator needs its own retrospective
  -- 4. PLAN-TO-LEAD handoff (5%) - final handoff

  DECLARE
    progress INTEGER := 0;
  BEGIN
    -- Phase 1: LEAD approval (20%)
    IF sd.status IN ('active', 'in_progress', 'pending_approval', 'completed') THEN
      progress := progress + 20;
    END IF;

    -- Phase 2: Child completion (60%)
    -- Pro-rate based on children completed
    progress := progress + (60 * completed_children / total_children);

    -- Phase 3: Retrospective (15%)
    SELECT EXISTS (
      SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param
    ) INTO retrospective_exists;

    IF retrospective_exists THEN
      progress := progress + 15;
    END IF;

    -- Phase 4: PLAN-TO-LEAD handoff (5%)
    SELECT COUNT(*) INTO handoffs_count
    FROM sd_phase_handoffs
    WHERE sd_id = sd_id_param
    AND handoff_type = 'PLAN-TO-LEAD'
    AND status = 'accepted';

    IF handoffs_count > 0 THEN
      progress := progress + 5;
    END IF;

    RETURN progress;
  END;
END;
$$;

-- ============================================================================
-- UPDATE: Calculate SD Progress to Handle Orchestrators
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_sd_progress(sd_id_param VARCHAR)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sd RECORD;
  sd_type_val VARCHAR;
  profile RECORD;
  progress INTEGER := 0;
  orchestrator_progress INTEGER;

  -- Phase completion checks
  prd_exists BOOLEAN := false;
  deliverables_complete BOOLEAN := false;
  user_stories_validated BOOLEAN := false;
  retrospective_exists BOOLEAN := false;
  handoffs_count INT := 0;
BEGIN
  -- Get SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SD not found: %', sd_id_param;
  END IF;

  -- ============================================================================
  -- ORCHESTRATOR FAST-PATH
  -- ============================================================================
  -- Check if this is an orchestrator SD (has children)
  -- Orchestrators use different progress calculation based on child completion
  orchestrator_progress := calculate_orchestrator_progress(sd_id_param);

  IF orchestrator_progress IS NOT NULL THEN
    -- This is an orchestrator - use orchestrator-specific calculation
    RETURN orchestrator_progress;
  END IF;

  -- ============================================================================
  -- STANDARD SD PROGRESS CALCULATION
  -- ============================================================================

  -- Get SD type (default to 'feature' if not set)
  sd_type_val := COALESCE(sd.sd_type, 'feature');

  -- Get validation profile for this SD type
  SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = sd_type_val;

  -- If no profile found, use feature defaults
  IF NOT FOUND THEN
    SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = 'feature';
    IF NOT FOUND THEN
      profile := ROW('feature', 20, 20, 30, 15, 15, true, true, true, true, true, 3, 'Default', NOW(), NOW());
    END IF;
  END IF;

  -- Phase 1: LEAD Initial Approval
  IF sd.status IN ('active', 'in_progress', 'pending_approval', 'completed') THEN
    progress := progress + profile.lead_weight;
  END IF;

  -- Phase 2: PLAN PRD Creation
  IF profile.requires_prd THEN
    SELECT EXISTS (
      SELECT 1 FROM product_requirements_v2
      WHERE directive_id = sd_id_param
      AND status IN ('approved', 'in_progress', 'completed')
    ) INTO prd_exists;

    IF prd_exists THEN
      progress := progress + profile.plan_weight;
    END IF;
  ELSE
    progress := progress + profile.plan_weight;
  END IF;

  -- Phase 3: EXEC Implementation
  IF profile.requires_deliverables THEN
    IF EXISTS (SELECT 1 FROM sd_scope_deliverables WHERE sd_id = sd_id_param) THEN
      SELECT
        CASE
          WHEN COUNT(*) = 0 THEN true
          WHEN COUNT(*) FILTER (WHERE completion_status = 'completed') = COUNT(*) THEN true
          ELSE false
        END INTO deliverables_complete
      FROM sd_scope_deliverables
      WHERE sd_id = sd_id_param
      AND priority IN ('required', 'high');
    ELSE
      deliverables_complete := true;
    END IF;

    IF deliverables_complete THEN
      progress := progress + profile.exec_weight;
    END IF;
  ELSE
    progress := progress + profile.exec_weight;
  END IF;

  -- Phase 4: PLAN Verification
  IF profile.requires_e2e_tests THEN
    IF EXISTS (SELECT 1 FROM user_stories WHERE sd_id = sd_id_param) THEN
      SELECT
        CASE
          WHEN COUNT(*) = 0 THEN true
          WHEN COUNT(*) FILTER (WHERE validation_status = 'validated' AND e2e_test_status = 'passing') = COUNT(*) THEN true
          ELSE false
        END INTO user_stories_validated
      FROM user_stories
      WHERE sd_id = sd_id_param;
    ELSE
      user_stories_validated := true;
    END IF;

    IF profile.requires_sub_agents THEN
      BEGIN
        DECLARE
          subagent_check JSONB;
        BEGIN
          subagent_check := check_required_sub_agents(sd_id_param);
          IF user_stories_validated AND (subagent_check->>'all_verified')::boolean THEN
            progress := progress + profile.verify_weight;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          IF user_stories_validated THEN
            progress := progress + profile.verify_weight;
          END IF;
        END;
      END;
    ELSE
      IF user_stories_validated THEN
        progress := progress + profile.verify_weight;
      END IF;
    END IF;
  ELSE
    progress := progress + profile.verify_weight;
  END IF;

  -- Phase 5: LEAD Final Approval
  IF profile.requires_retrospective THEN
    SELECT EXISTS (
      SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param
    ) INTO retrospective_exists;
  ELSE
    retrospective_exists := true;
  END IF;

  SELECT COUNT(DISTINCT handoff_type) INTO handoffs_count
  FROM sd_phase_handoffs
  WHERE sd_id = sd_id_param
  AND status = 'accepted';

  IF retrospective_exists AND handoffs_count >= profile.min_handoffs THEN
    progress := progress + profile.final_weight;
  END IF;

  RETURN progress;
END;
$$;

-- ============================================================================
-- UPDATE: Get Progress Breakdown to Show Orchestrator Status
-- ============================================================================

CREATE OR REPLACE FUNCTION get_progress_breakdown(sd_id_param VARCHAR)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sd RECORD;
  sd_type_val VARCHAR;
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
BEGIN
  -- Get SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'SD not found');
  END IF;

  -- Check if orchestrator
  is_orchestrator_flag := is_orchestrator_sd(sd_id_param);

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

    -- Check PLAN-TO-LEAD handoff
    SELECT COUNT(*) INTO handoffs_count
    FROM sd_phase_handoffs
    WHERE sd_id = sd_id_param
    AND handoff_type = 'PLAN-TO-LEAD'
    AND status = 'accepted';

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
          'complete', sd.status IN ('active', 'in_progress', 'pending_approval', 'completed'),
          'progress', CASE WHEN sd.status IN ('active', 'in_progress', 'pending_approval', 'completed') THEN 20 ELSE 0 END
        ),
        'CHILDREN_completion', jsonb_build_object(
          'weight', 60,
          'complete', completed_children = total_children,
          'progress', (60 * completed_children / NULLIF(total_children, 0)),
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
        'PLAN_to_LEAD_handoff', jsonb_build_object(
          'weight', 5,
          'complete', handoffs_count > 0,
          'progress', CASE WHEN handoffs_count > 0 THEN 5 ELSE 0 END,
          'required', true
        )
      ),
      'total_progress', total_progress,
      'can_complete', total_progress = 100
    );
  END IF;

  -- Standard SD breakdown (existing logic)
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

COMMENT ON FUNCTION is_orchestrator_sd IS
'Returns true if SD has children (is a parent orchestrator SD).';

COMMENT ON FUNCTION orchestrator_children_complete IS
'Returns true if all children of an orchestrator SD are completed.';

COMMENT ON FUNCTION calculate_orchestrator_progress IS
'Calculates progress for orchestrator SDs based on child completion, not standard phases.';

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION is_orchestrator_sd TO authenticated;
GRANT EXECUTE ON FUNCTION is_orchestrator_sd TO service_role;
GRANT EXECUTE ON FUNCTION orchestrator_children_complete TO authenticated;
GRANT EXECUTE ON FUNCTION orchestrator_children_complete TO service_role;
GRANT EXECUTE ON FUNCTION calculate_orchestrator_progress TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_orchestrator_progress TO service_role;

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Orchestrator SD Completion Support - Complete';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'New functions:';
  RAISE NOTICE '  - is_orchestrator_sd(sd_id): Check if SD has children';
  RAISE NOTICE '  - orchestrator_children_complete(sd_id): Check all children complete';
  RAISE NOTICE '  - calculate_orchestrator_progress(sd_id): Orchestrator-specific progress';
  RAISE NOTICE '';
  RAISE NOTICE 'Updated functions:';
  RAISE NOTICE '  - calculate_sd_progress: Now detects orchestrators and uses child-based progress';
  RAISE NOTICE '  - get_progress_breakdown: Now shows orchestrator-specific breakdown';
  RAISE NOTICE '';
  RAISE NOTICE 'Orchestrator progress calculation:';
  RAISE NOTICE '  - LEAD initial approval: 20%';
  RAISE NOTICE '  - Child completion: 60% (pro-rated by completed children)';
  RAISE NOTICE '  - Retrospective: 15%';
  RAISE NOTICE '  - PLAN-TO-LEAD handoff: 5%';
  RAISE NOTICE '';
  RAISE NOTICE 'Test with: SELECT get_progress_breakdown(''SD-VISION-TRANSITION-001'');';
END $$;
