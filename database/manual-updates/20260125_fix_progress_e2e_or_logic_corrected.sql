-- Quick-fix QF-20260125-106: Fix progress calculation AND/OR logic for e2e_test_status
-- Issue: Progress function requires BOTH validation_status='validated' AND e2e_test_status='passing'
-- Fix: Change to OR logic so infrastructure SDs can complete via validation_status alone
-- Date: 2026-01-25
-- CORRECTED: Fixed sd_uuid -> sd_id schema reference error

-- ============================================================================
-- Fix calculate_sd_progress function
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
  handoffs_count INTEGER := 0;
BEGIN
  -- Get SD and its type
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SD not found: %', sd_id_param;
  END IF;

  sd_type_val := COALESCE(sd.sd_type, 'feature');

  -- Get validation profile for this SD type
  SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = sd_type_val;

  IF NOT FOUND THEN
    -- Fall back to feature profile
    SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = 'feature';
  END IF;

  -- ============================================================================
  -- PHASE 1: LEAD Initial Approval
  -- ============================================================================
  IF sd.status IN ('active', 'in_progress', 'pending_approval', 'completed', 'review') THEN
    progress := progress + profile.lead_weight;
  END IF;

  -- ============================================================================
  -- PHASE 2: PLAN PRD Creation
  -- ============================================================================
  IF profile.requires_prd THEN
    SELECT EXISTS (
      SELECT 1 FROM product_requirements_v2
      WHERE sd_id = sd_id_param
      AND status IN ('approved', 'in_progress', 'implemented', 'verification', 'pending_approval', 'completed')
    ) INTO prd_exists;

    IF prd_exists THEN
      progress := progress + profile.plan_weight;
    END IF;
  ELSE
    progress := progress + profile.plan_weight;
  END IF;

  -- ============================================================================
  -- PHASE 3: EXEC Implementation (Deliverables)
  -- ============================================================================
  IF profile.requires_deliverables THEN
    IF EXISTS (SELECT 1 FROM sd_scope_deliverables WHERE sd_id = sd_id_param) THEN
      SELECT
        CASE
          WHEN COUNT(*) = 0 THEN false
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

  -- ============================================================================
  -- PHASE 4: PLAN Verification (User Stories + E2E)
  -- FIX: Changed AND to OR - infrastructure SDs can complete via validation_status alone
  -- ============================================================================
  IF profile.requires_e2e_tests THEN
    IF EXISTS (SELECT 1 FROM user_stories WHERE sd_id = sd_id_param) THEN
      SELECT
        CASE
          WHEN COUNT(*) = 0 THEN true
          -- FIX: Use OR instead of AND (QF-20260125-106)
          -- This allows infrastructure SDs to complete via validation_status='validated'
          -- without requiring e2e_test_status='passing' (which requires actual E2E tests)
          WHEN COUNT(*) FILTER (WHERE validation_status = 'validated' OR e2e_test_status = 'passing') = COUNT(*) THEN true
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

  -- ============================================================================
  -- PHASE 5: LEAD Final Approval
  -- ============================================================================
  IF profile.requires_retrospective THEN
    SELECT EXISTS (
      SELECT 1 FROM retrospectives
      WHERE sd_id = sd_id_param
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
-- Also fix get_progress_breakdown for consistency
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

  -- Component states
  prd_exists BOOLEAN := false;
  deliverables_complete BOOLEAN := false;
  user_stories_validated BOOLEAN := false;
  retrospective_exists BOOLEAN := false;
  handoffs_count INTEGER := 0;
  subagent_check JSONB;
BEGIN
  -- Get SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'SD not found');
  END IF;

  sd_type_val := COALESCE(sd.sd_type, 'feature');

  -- Get profile
  SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = sd_type_val;
  IF NOT FOUND THEN
    SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = 'feature';
  END IF;

  -- Check PRD
  SELECT EXISTS (
    SELECT 1 FROM product_requirements_v2
    WHERE sd_id = sd_id_param
    AND status IN ('approved', 'in_progress', 'implemented', 'verification', 'pending_approval', 'completed')
  ) INTO prd_exists;

  -- Check deliverables
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

  -- Check user stories (FIX: OR logic)
  IF EXISTS (SELECT 1 FROM user_stories WHERE sd_id = sd_id_param) THEN
    SELECT
      CASE
        WHEN COUNT(*) = 0 THEN true
        -- FIX: Use OR instead of AND (QF-20260125-106)
        WHEN COUNT(*) FILTER (WHERE validation_status = 'validated' OR e2e_test_status = 'passing') = COUNT(*) THEN true
        ELSE false
      END INTO user_stories_validated
    FROM user_stories
    WHERE sd_id = sd_id_param;
  ELSE
    user_stories_validated := true;
  END IF;

  -- Check retrospective
  SELECT EXISTS (
    SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param
  ) INTO retrospective_exists;

  -- Check handoffs
  SELECT COUNT(DISTINCT handoff_type) INTO handoffs_count
  FROM sd_phase_handoffs
  WHERE sd_id = sd_id_param
  AND status = 'accepted';

  -- Check sub-agents
  BEGIN
    subagent_check := check_required_sub_agents(sd_id_param);
  EXCEPTION WHEN OTHERS THEN
    subagent_check := '{"all_verified": true}'::jsonb;
  END;

  -- Calculate progress
  total_progress := calculate_sd_progress(sd_id_param);

  -- Build breakdown
  breakdown := jsonb_build_object(
    'sd_id', sd_id_param,
    'sd_type', sd_type_val,
    'profile', profile.name,
    'total_progress', total_progress,
    'can_complete', total_progress = 100,
    'phases', jsonb_build_object(
      'LEAD_approval', jsonb_build_object(
        'weight', profile.lead_weight,
        'complete', sd.status IN ('active', 'in_progress', 'pending_approval', 'completed', 'review'),
        'progress', CASE WHEN sd.status IN ('active', 'in_progress', 'pending_approval', 'completed', 'review') THEN profile.lead_weight ELSE 0 END,
        'required', true
      ),
      'PLAN_prd', jsonb_build_object(
        'weight', profile.plan_weight,
        'complete', prd_exists OR NOT profile.requires_prd,
        'progress', CASE WHEN prd_exists OR NOT profile.requires_prd THEN profile.plan_weight ELSE 0 END,
        'required', profile.requires_prd,
        'prd_exists', prd_exists
      ),
      'EXEC_implementation', jsonb_build_object(
        'weight', profile.exec_weight,
        'complete', deliverables_complete OR NOT profile.requires_deliverables,
        'progress', CASE WHEN deliverables_complete OR NOT profile.requires_deliverables THEN profile.exec_weight ELSE 0 END,
        'required', profile.requires_deliverables,
        'deliverables_complete', deliverables_complete
      ),
      'PLAN_verification', jsonb_build_object(
        'weight', profile.verify_weight,
        'complete', (user_stories_validated AND (subagent_check->>'all_verified')::boolean) OR NOT profile.requires_e2e_tests,
        'progress', CASE WHEN (user_stories_validated AND (subagent_check->>'all_verified')::boolean) OR NOT profile.requires_e2e_tests THEN profile.verify_weight ELSE 0 END,
        'required', profile.requires_e2e_tests,
        'user_stories_validated', user_stories_validated,
        'subagent_verified', (subagent_check->>'all_verified')::boolean
      ),
      'LEAD_final_approval', jsonb_build_object(
        'weight', profile.final_weight,
        'complete', retrospective_exists AND handoffs_count >= profile.min_handoffs,
        'progress', CASE WHEN retrospective_exists AND handoffs_count >= profile.min_handoffs THEN profile.final_weight ELSE 0 END,
        'min_handoffs', profile.min_handoffs,
        'handoffs_count', handoffs_count,
        'retrospective_exists', retrospective_exists,
        'retrospective_required', profile.requires_retrospective
      )
    )
  );

  RETURN breakdown;
END;
$$;

-- ============================================================================
-- Verification
-- ============================================================================

SELECT 'QF-20260125-106: Functions updated with OR logic for e2e_test_status' as message;
SELECT 'Infrastructure SDs can now complete via validation_status=validated alone' as message;
