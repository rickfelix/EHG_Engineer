-- Migration: Fix calculate_sd_progress PRD Column Reference
-- Date: 2026-01-19
-- Root Cause Analysis (5 Whys):
--   1. Progress at 75% → PLAN_prd.prd_exists = false
--   2. prd_exists false → Query returns 0 rows
--   3. 0 rows → Query uses directive_id = UUID
--   4. Wrong column → Function uses directive_id instead of sd_id
--   5. Why directive_id? → Fix 634bb52da focused on STATUS, not join column
--   ROOT CAUSE: Dual-ID schema (directive_id=legacy, sd_id=UUID) caused confusion
--
-- Fix: Change FROM directive_id TO sd_id in PRD lookups
--
-- product_requirements_v2 columns:
--   - directive_id: Legacy string key (e.g., "SD-LEARN-010") - DO NOT USE for UUID joins
--   - sd_id: UUID foreign key to strategic_directives_v2.id - USE THIS
-- ============================================================================

-- ============================================================================
-- STEP 1: Fix calculate_sd_progress function
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_sd_progress(sd_id_param TEXT)
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

  -- Component states
  prd_exists BOOLEAN := false;
  deliverables_complete BOOLEAN := false;
  user_stories_validated BOOLEAN := false;
  retrospective_exists BOOLEAN := false;
  handoffs_count INT := 0;
  subagent_check JSONB;
  subagent_ok BOOLEAN := false;

  -- Orchestrator variables
  is_orchestrator_flag BOOLEAN := false;
  total_children INT := 0;
  completed_children INT := 0;
  child_progress INT := 0;
BEGIN
  -- Get SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Check if this is an orchestrator SD (has children)
  is_orchestrator_flag := is_orchestrator_sd(sd_id_param);

  IF is_orchestrator_flag THEN
    -- Orchestrator SD: Progress = weighted average of children
    SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE status = 'completed')
    INTO total_children, completed_children
    FROM strategic_directives_v2
    WHERE parent_sd_id = sd_id_param;

    IF total_children > 0 THEN
      -- Calculate based on child progress
      SELECT COALESCE(AVG(calculate_sd_progress(id)), 0)::INT
      INTO child_progress
      FROM strategic_directives_v2
      WHERE parent_sd_id = sd_id_param;

      -- Add 10% bonus if LEAD approval received
      IF sd.status IN ('active', 'in_progress', 'pending_approval', 'completed') THEN
        progress := LEAST(child_progress + 10, 100);
      ELSE
        progress := child_progress;
      END IF;
    END IF;

    RETURN progress;
  END IF;

  -- Standard SD: Calculate phase-by-phase progress
  sd_type_val := COALESCE(sd.sd_type, 'feature');

  -- Get validation profile
  SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = sd_type_val;

  IF NOT FOUND THEN
    -- Fallback to 'feature' profile
    SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = 'feature';
  END IF;

  -- Phase 1: LEAD Approval (lead_weight)
  IF sd.status IN ('active', 'in_progress', 'pending_approval', 'completed') THEN
    progress := progress + profile.lead_weight;
  END IF;

  -- Phase 2: PLAN / PRD (plan_weight)
  -- FIX 2026-01-19: Use sd_id column (UUID), NOT directive_id (legacy string key)
  -- directive_id contains "SD-XXX-001" format, sd_id contains UUID
  IF NOT profile.requires_prd THEN
    progress := progress + profile.plan_weight;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM product_requirements_v2
      WHERE sd_id = sd_id_param  -- FIXED: was directive_id
      AND status IN (
        'planning',
        'in_progress',
        'testing',
        'verification',
        'approved',
        'completed'
      )
    ) INTO prd_exists;

    IF prd_exists THEN
      progress := progress + profile.plan_weight;
    END IF;
  END IF;

  -- Phase 3: EXEC / Implementation (exec_weight)
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

  -- Phase 4: Verification (verify_weight)
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
        subagent_check := check_required_sub_agents(sd_id_param);
        subagent_ok := COALESCE((subagent_check->>'all_verified')::boolean, false);
      EXCEPTION WHEN OTHERS THEN
        subagent_ok := true;
      END;

      IF user_stories_validated AND subagent_ok THEN
        progress := progress + profile.verify_weight;
      END IF;
    ELSE
      IF user_stories_validated THEN
        progress := progress + profile.verify_weight;
      END IF;
    END IF;
  ELSE
    progress := progress + profile.verify_weight;
  END IF;

  -- Phase 5: Final Approval (final_weight)
  SELECT EXISTS (SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param) INTO retrospective_exists;
  SELECT COUNT(DISTINCT handoff_type) INTO handoffs_count
  FROM sd_phase_handoffs
  WHERE sd_id = sd_id_param AND status = 'accepted';

  IF (NOT profile.requires_retrospective OR retrospective_exists) AND handoffs_count >= profile.min_handoffs THEN
    progress := progress + profile.final_weight;
  END IF;

  RETURN LEAST(progress, 100);
END;
$$;

-- ============================================================================
-- STEP 2: Fix get_progress_breakdown function
-- ============================================================================

CREATE OR REPLACE FUNCTION get_progress_breakdown(sd_id_param TEXT)
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

  prd_exists BOOLEAN;
  deliverables_complete BOOLEAN := false;
  user_stories_validated BOOLEAN := false;
  subagent_verified BOOLEAN := false;
  retrospective_exists BOOLEAN;
  handoffs_count INT;
BEGIN
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'SD not found');
  END IF;

  is_orchestrator_flag := is_orchestrator_sd(sd_id_param);

  IF is_orchestrator_flag THEN
    SELECT
      COUNT(*),
      COUNT(*) FILTER (WHERE status = 'completed')
    INTO total_children, completed_children
    FROM strategic_directives_v2
    WHERE parent_sd_id = sd_id_param;

    SELECT EXISTS (
      SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param
    ) INTO retrospective_exists;

    SELECT COUNT(*) INTO handoffs_count
    FROM sd_phase_handoffs
    WHERE sd_id = sd_id_param
    AND handoff_type = 'PLAN-TO-LEAD'
    AND status = 'accepted';

    total_progress := calculate_sd_progress(sd_id_param);

    RETURN jsonb_build_object(
      'sd_id', sd_id_param,
      'sd_type', COALESCE(sd.sd_type, 'feature'),
      'is_orchestrator', true,
      'status', sd.status,
      'total_progress', total_progress,
      'can_complete', total_progress = 100
    );
  END IF;

  sd_type_val := COALESCE(sd.sd_type, 'feature');
  SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = sd_type_val;

  IF NOT FOUND THEN
    SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = 'feature';
  END IF;

  -- FIX 2026-01-19: Use sd_id column (UUID), NOT directive_id (legacy string key)
  SELECT EXISTS (
    SELECT 1 FROM product_requirements_v2
    WHERE sd_id = sd_id_param  -- FIXED: was directive_id
    AND status IN (
      'planning',
      'in_progress',
      'testing',
      'verification',
      'approved',
      'completed'
    )
  ) INTO prd_exists;

  SELECT EXISTS (
    SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param
  ) INTO retrospective_exists;

  SELECT COUNT(DISTINCT handoff_type) INTO handoffs_count
  FROM sd_phase_handoffs
  WHERE sd_id = sd_id_param AND status = 'accepted';

  -- Deliverables check
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
  ELSE
    deliverables_complete := true;
  END IF;

  -- User stories check
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
          subagent_verified := (subagent_check->>'all_verified')::boolean;
        EXCEPTION WHEN OTHERS THEN
          subagent_verified := true;
        END;
      END;
    ELSE
      subagent_verified := true;
    END IF;
  ELSE
    user_stories_validated := true;
    subagent_verified := true;
  END IF;

  total_progress := calculate_sd_progress(sd_id_param);

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
        'complete', deliverables_complete,
        'progress', CASE WHEN deliverables_complete
                        THEN profile.exec_weight ELSE 0 END,
        'required', profile.requires_deliverables,
        'deliverables_complete', deliverables_complete
      ),
      'PLAN_verification', jsonb_build_object(
        'weight', profile.verify_weight,
        'complete', user_stories_validated AND subagent_verified,
        'progress', CASE WHEN user_stories_validated AND subagent_verified
                        THEN profile.verify_weight ELSE 0 END,
        'required', profile.requires_e2e_tests,
        'user_stories_validated', user_stories_validated,
        'subagent_verified', subagent_verified
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

-- VARCHAR overload for backwards compatibility
CREATE OR REPLACE FUNCTION get_progress_breakdown(sd_id_param VARCHAR)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN get_progress_breakdown(sd_id_param::TEXT);
END;
$$;

-- ============================================================================
-- STEP 3: Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION calculate_sd_progress(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_sd_progress(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_progress_breakdown(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_progress_breakdown(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_progress_breakdown(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION get_progress_breakdown(VARCHAR) TO service_role;

-- ============================================================================
-- STEP 4: Validation - Test with SD-LEARN-010
-- ============================================================================

DO $$
DECLARE
  test_progress INT;
  test_breakdown JSONB;
  test_sd_id TEXT := '0aa31ded-244f-4044-8c37-5f2c7c0d4a64';
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'PRD Column Reference Fix - Applied';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Root Cause: Functions used directive_id (legacy key) instead of sd_id (UUID)';
  RAISE NOTICE 'Fix: Changed PRD lookup from directive_id to sd_id';
  RAISE NOTICE '';

  -- Test the fix
  SELECT calculate_sd_progress(test_sd_id) INTO test_progress;
  RAISE NOTICE 'Test Result for SD-LEARN-010 (%)', test_sd_id;
  RAISE NOTICE '  Progress: %', test_progress;

  SELECT get_progress_breakdown(test_sd_id) INTO test_breakdown;
  RAISE NOTICE '  PLAN_prd.prd_exists: %', test_breakdown->'phases'->'PLAN_prd'->>'prd_exists';
  RAISE NOTICE '  PLAN_prd.progress: %', test_breakdown->'phases'->'PLAN_prd'->>'progress';
  RAISE NOTICE '  can_complete: %', test_breakdown->>'can_complete';

  IF test_progress = 100 THEN
    RAISE NOTICE '';
    RAISE NOTICE '✅ FIX SUCCESSFUL: Progress now 100%%';
  ELSE
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  Progress is % - check other phase requirements', test_progress;
  END IF;
END $$;
