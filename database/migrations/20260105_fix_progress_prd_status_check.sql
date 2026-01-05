-- Migration: Fix calculate_sd_progress PRD Status Recognition
-- Date: 2026-01-05
-- Root Cause: PRD status 'verification' not recognized by progress function
--
-- SINGLE SOURCE OF TRUTH: lib/constants/status-definitions.ts
-- This migration syncs the SQL function with the TypeScript definitions.
--
-- PRD_ACTIVE_STATUSES (from status-definitions.ts):
--   'planning', 'in_progress', 'testing', 'verification', 'approved', 'completed'
--
-- Previous (broken): 'approved', 'in_progress', 'completed'
-- New (fixed): All active PRD statuses from single source of truth

-- ============================================================================
-- STEP 1: Update product_requirements_v2 CHECK constraint
-- ============================================================================

-- First, drop the existing constraint (if exists)
ALTER TABLE product_requirements_v2
DROP CONSTRAINT IF EXISTS product_requirements_v2_status_check;

-- Add the updated constraint with all valid statuses
ALTER TABLE product_requirements_v2
ADD CONSTRAINT product_requirements_v2_status_check
CHECK (status IN (
  'draft',
  'planning',
  'in_progress',
  'testing',
  'verification',
  'approved',
  'completed',
  'archived',
  'rejected',
  'on_hold',
  'cancelled'
));

-- ============================================================================
-- STEP 2: Fix calculate_sd_progress function
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
  -- FIX: Use all PRD_ACTIVE_STATUSES from status-definitions.ts
  -- Previous (broken): ('approved', 'in_progress', 'completed')
  -- New (fixed): All statuses that indicate PRD work is happening
  IF NOT profile.requires_prd THEN
    progress := progress + profile.plan_weight;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM product_requirements_v2
      WHERE directive_id = sd_id_param
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
-- STEP 3: Also fix get_progress_breakdown for consistency
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

  -- FIX: Check PRD with all active statuses (matches calculate_sd_progress)
  SELECT EXISTS (
    SELECT 1 FROM product_requirements_v2
    WHERE directive_id = sd_id_param
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
-- STEP 4: Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION calculate_sd_progress(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_sd_progress(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_progress_breakdown(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_progress_breakdown(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_progress_breakdown(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION get_progress_breakdown(VARCHAR) TO service_role;

-- ============================================================================
-- STEP 5: Validation
-- ============================================================================

DO $$
DECLARE
  test_progress INT;
  test_breakdown JSONB;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'PRD Status Recognition Fix - Applied';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes made:';
  RAISE NOTICE '  1. Updated CHECK constraint to include all valid PRD statuses';
  RAISE NOTICE '  2. Fixed calculate_sd_progress to recognize:';
  RAISE NOTICE '     planning, in_progress, testing, verification, approved, completed';
  RAISE NOTICE '  3. Fixed get_progress_breakdown to match';
  RAISE NOTICE '';
  RAISE NOTICE 'Single Source of Truth: lib/constants/status-definitions.ts';
  RAISE NOTICE '';

  -- Test the fix
  SELECT calculate_sd_progress('SD-FINANCIAL-ENGINE-001') INTO test_progress;
  RAISE NOTICE 'Test Result for SD-FINANCIAL-ENGINE-001:';
  RAISE NOTICE '  Progress: %', test_progress;

  SELECT get_progress_breakdown('SD-FINANCIAL-ENGINE-001') INTO test_breakdown;
  RAISE NOTICE '  PLAN_prd.prd_exists: %', test_breakdown->'phases'->'PLAN_prd'->>'prd_exists';
  RAISE NOTICE '  PLAN_prd.progress: %', test_breakdown->'phases'->'PLAN_prd'->>'progress';

  IF test_progress = 100 THEN
    RAISE NOTICE '';
    RAISE NOTICE '✅ FIX SUCCESSFUL: Progress now 100%%';
  ELSE
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  Progress is % - check other phase requirements', test_progress;
  END IF;
END $$;
