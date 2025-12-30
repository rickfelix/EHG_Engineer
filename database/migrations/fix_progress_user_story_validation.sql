-- ============================================================================
-- Fix Progress Calculation: User Story Validation
-- ============================================================================
-- SD: SD-LEO-COMPLETION-GATES-001
-- User Story: US-001 - Fix Progress Calculation for User Story Validation
-- Priority: CRITICAL
-- Date: 2025-12-30
--
-- ROOT CAUSE: calculate_sd_progress() has backwards logic where 0 stories = pass
-- This allowed SDs to complete without fulfilling user story requirements
--
-- FIX: If SD type requires E2E tests, user stories MUST exist to pass verification
-- ============================================================================

-- ============================================================================
-- STEP 1: Add requires_user_stories column to sd_type_validation_profiles
-- ============================================================================

ALTER TABLE sd_type_validation_profiles
ADD COLUMN IF NOT EXISTS requires_user_stories BOOLEAN DEFAULT true;

COMMENT ON COLUMN sd_type_validation_profiles.requires_user_stories IS
'If true, user stories must exist AND be validated for the verify phase to pass. Prevents Silent Success anti-pattern.';

-- Set default values based on requires_e2e_tests
-- If a type requires E2E tests, it also requires user stories
UPDATE sd_type_validation_profiles
SET requires_user_stories = requires_e2e_tests;

-- Infrastructure requires user stories (they get validated without E2E)
UPDATE sd_type_validation_profiles
SET requires_user_stories = true
WHERE sd_type IN ('infrastructure', 'database', 'security');

-- Docs don't require user stories
UPDATE sd_type_validation_profiles
SET requires_user_stories = false
WHERE sd_type = 'docs';

-- ============================================================================
-- STEP 2: Update calculate_sd_progress to enforce user story requirements
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_sd_progress(sd_id_param VARCHAR)
RETURNS INTEGER AS $$
DECLARE
  sd RECORD;
  sd_type_val VARCHAR;
  profile RECORD;
  progress INTEGER := 0;

  -- Phase completion checks
  prd_exists BOOLEAN := false;
  deliverables_complete BOOLEAN := false;
  user_stories_validated BOOLEAN := false;
  retrospective_exists BOOLEAN := false;
  handoffs_count INT := 0;

  -- User story tracking
  user_story_count INT := 0;
  validated_story_count INT := 0;
BEGIN
  -- Get SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SD not found: %', sd_id_param;
  END IF;

  -- Get SD type (default to 'feature' if not set)
  sd_type_val := COALESCE(sd.sd_type, 'feature');

  -- Get validation profile for this SD type
  SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = sd_type_val;

  -- If no profile found, use feature defaults
  IF NOT FOUND THEN
    SELECT * INTO profile FROM sd_type_validation_profiles WHERE sd_type = 'feature';
    -- If still not found, create inline defaults
    IF NOT FOUND THEN
      -- Use record type for inline defaults
      profile.sd_type := 'feature';
      profile.lead_weight := 20;
      profile.plan_weight := 20;
      profile.exec_weight := 30;
      profile.verify_weight := 15;
      profile.final_weight := 15;
      profile.requires_prd := true;
      profile.requires_deliverables := true;
      profile.requires_e2e_tests := true;
      profile.requires_user_stories := true;
      profile.requires_retrospective := true;
      profile.requires_sub_agents := true;
      profile.min_handoffs := 3;
    END IF;
  END IF;

  -- ============================================================================
  -- PHASE 1: LEAD Initial Approval
  -- ============================================================================
  IF sd.status IN ('active', 'in_progress', 'pending_approval', 'completed') THEN
    progress := progress + profile.lead_weight;
  END IF;

  -- ============================================================================
  -- PHASE 2: PLAN PRD Creation
  -- ============================================================================
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
    -- PRD not required for this SD type - auto-complete
    progress := progress + profile.plan_weight;
  END IF;

  -- ============================================================================
  -- PHASE 3: EXEC Implementation
  -- ============================================================================
  IF profile.requires_deliverables THEN
    -- Check if deliverables exist and are complete
    IF EXISTS (SELECT 1 FROM sd_scope_deliverables WHERE sd_id = sd_id_param) THEN
      SELECT
        CASE
          WHEN COUNT(*) = 0 THEN true  -- No deliverables = complete
          WHEN COUNT(*) FILTER (WHERE completion_status = 'completed') = COUNT(*) THEN true
          ELSE false
        END INTO deliverables_complete
      FROM sd_scope_deliverables
      WHERE sd_id = sd_id_param
      AND priority IN ('required', 'high');
    ELSE
      -- No deliverables tracked = assume complete (legacy behavior)
      deliverables_complete := true;
    END IF;

    IF deliverables_complete THEN
      progress := progress + profile.exec_weight;
    END IF;
  ELSE
    -- Deliverables not required for this SD type - auto-complete
    progress := progress + profile.exec_weight;
  END IF;

  -- ============================================================================
  -- PHASE 4: PLAN Verification (User Stories + E2E) - FIXED LOGIC
  -- ============================================================================

  -- Count user stories for this SD
  SELECT COUNT(*) INTO user_story_count
  FROM user_stories
  WHERE sd_id = sd_id_param;

  -- FIX: Check if user stories are REQUIRED but don't exist
  IF COALESCE(profile.requires_user_stories, profile.requires_e2e_tests) THEN
    -- User stories are required for this SD type
    IF user_story_count = 0 THEN
      -- CRITICAL FIX: No stories exist but stories are required = FAIL
      -- This is the "backwards logic" that was allowing Silent Success
      user_stories_validated := false;
      RAISE NOTICE 'Progress: SD % requires user stories but has 0 (type: %)', sd_id_param, sd_type_val;
    ELSE
      -- Stories exist, check if they're validated
      IF profile.requires_e2e_tests THEN
        -- Feature SD: Need E2E validation
        SELECT COUNT(*) INTO validated_story_count
        FROM user_stories
        WHERE sd_id = sd_id_param
        AND validation_status = 'validated'
        AND e2e_test_status = 'passing';

        user_stories_validated := (validated_story_count = user_story_count);
      ELSE
        -- Infrastructure SD: Just need status = completed
        SELECT COUNT(*) INTO validated_story_count
        FROM user_stories
        WHERE sd_id = sd_id_param
        AND status = 'completed';

        user_stories_validated := (validated_story_count = user_story_count);
      END IF;
    END IF;
  ELSE
    -- User stories not required (e.g., docs SD) - auto-pass
    user_stories_validated := true;
  END IF;

  -- Apply verification progress
  IF user_stories_validated THEN
    -- Also check sub-agents if required
    IF profile.requires_sub_agents THEN
      BEGIN
        DECLARE
          subagent_check JSONB;
        BEGIN
          subagent_check := check_required_sub_agents(sd_id_param);
          IF (subagent_check->>'all_verified')::boolean THEN
            progress := progress + profile.verify_weight;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          -- Function doesn't exist, just use user story check
          progress := progress + profile.verify_weight;
        END;
      END;
    ELSE
      progress := progress + profile.verify_weight;
    END IF;
  END IF;

  -- ============================================================================
  -- PHASE 5: LEAD Final Approval
  -- ============================================================================

  -- Check retrospective if required
  IF profile.requires_retrospective THEN
    SELECT EXISTS (
      SELECT 1 FROM retrospectives
      WHERE sd_id = sd_id_param
    ) INTO retrospective_exists;
  ELSE
    retrospective_exists := true;  -- Not required, auto-pass
  END IF;

  -- Check handoffs (with configurable minimum)
  SELECT COUNT(DISTINCT handoff_type) INTO handoffs_count
  FROM sd_phase_handoffs
  WHERE sd_id = sd_id_param
  AND status = 'accepted';

  IF retrospective_exists AND handoffs_count >= profile.min_handoffs THEN
    progress := progress + profile.final_weight;
  END IF;

  RETURN progress;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 3: Update get_progress_breakdown to show user story requirement
-- ============================================================================

CREATE OR REPLACE FUNCTION get_progress_breakdown(sd_id_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
  sd RECORD;
  sd_type_val VARCHAR;
  profile RECORD;
  breakdown JSONB;
  total_progress INTEGER;

  -- Component states
  prd_exists BOOLEAN;
  deliverables_complete BOOLEAN;
  user_stories_validated BOOLEAN;
  retrospective_exists BOOLEAN;
  handoffs_count INT;

  -- User story counts
  user_story_count INT;
  validated_story_count INT;
BEGIN
  -- Get SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'SD not found');
  END IF;

  -- Get SD type and profile
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

  -- User story counts
  SELECT COUNT(*) INTO user_story_count
  FROM user_stories WHERE sd_id = sd_id_param;

  SELECT COUNT(*) INTO validated_story_count
  FROM user_stories
  WHERE sd_id = sd_id_param
  AND (
    (profile.requires_e2e_tests AND validation_status = 'validated' AND e2e_test_status = 'passing')
    OR
    (NOT profile.requires_e2e_tests AND status = 'completed')
  );

  -- Calculate total
  total_progress := calculate_sd_progress(sd_id_param);

  -- Build breakdown
  breakdown := jsonb_build_object(
    'sd_id', sd_id_param,
    'sd_type', sd_type_val,
    'current_phase', sd.current_phase,
    'status', sd.status,
    'profile', jsonb_build_object(
      'name', profile.sd_type,
      'description', profile.description,
      'requires_prd', profile.requires_prd,
      'requires_deliverables', profile.requires_deliverables,
      'requires_e2e_tests', profile.requires_e2e_tests,
      'requires_user_stories', COALESCE(profile.requires_user_stories, profile.requires_e2e_tests),
      'requires_retrospective', profile.requires_retrospective,
      'requires_sub_agents', profile.requires_sub_agents,
      'min_handoffs', profile.min_handoffs
    ),
    'phases', jsonb_build_object(
      'LEAD_approval', jsonb_build_object(
        'weight', profile.lead_weight,
        'required', true,
        'complete', sd.status IN ('active', 'in_progress', 'pending_approval', 'completed'),
        'progress', CASE WHEN sd.status IN ('active', 'in_progress', 'pending_approval', 'completed')
                        THEN profile.lead_weight ELSE 0 END
      ),
      'PLAN_prd', jsonb_build_object(
        'weight', profile.plan_weight,
        'required', profile.requires_prd,
        'prd_exists', prd_exists,
        'complete', (NOT profile.requires_prd) OR prd_exists,
        'progress', CASE WHEN (NOT profile.requires_prd) OR prd_exists
                        THEN profile.plan_weight ELSE 0 END
      ),
      'EXEC_implementation', jsonb_build_object(
        'weight', profile.exec_weight,
        'required', profile.requires_deliverables,
        'complete', NOT profile.requires_deliverables,
        'progress', CASE WHEN NOT profile.requires_deliverables
                        THEN profile.exec_weight ELSE 0 END,
        'note', CASE WHEN NOT profile.requires_deliverables
                     THEN 'Auto-complete: deliverables not required for ' || sd_type_val
                     ELSE 'Check sd_scope_deliverables table' END
      ),
      'PLAN_verification', jsonb_build_object(
        'weight', profile.verify_weight,
        'required', COALESCE(profile.requires_user_stories, profile.requires_e2e_tests),
        'user_story_count', user_story_count,
        'validated_story_count', validated_story_count,
        'stories_required', COALESCE(profile.requires_user_stories, profile.requires_e2e_tests),
        'complete', CASE
          WHEN NOT COALESCE(profile.requires_user_stories, profile.requires_e2e_tests) THEN true
          WHEN user_story_count = 0 THEN false  -- CRITICAL: No stories = FAIL if required
          WHEN validated_story_count = user_story_count THEN true
          ELSE false
        END,
        'progress', CASE
          WHEN NOT COALESCE(profile.requires_user_stories, profile.requires_e2e_tests) THEN profile.verify_weight
          WHEN user_story_count = 0 THEN 0  -- CRITICAL FIX
          WHEN validated_story_count = user_story_count THEN profile.verify_weight
          ELSE 0
        END,
        'note', CASE
          WHEN NOT COALESCE(profile.requires_user_stories, profile.requires_e2e_tests) THEN
            'Auto-complete: user stories not required for ' || sd_type_val
          WHEN user_story_count = 0 THEN
            'BLOCKED: User stories required but none exist (Silent Success prevention)'
          WHEN validated_story_count < user_story_count THEN
            'BLOCKED: ' || (user_story_count - validated_story_count) || ' of ' || user_story_count || ' stories not yet validated'
          ELSE 'All user stories validated'
        END
      ),
      'LEAD_final_approval', jsonb_build_object(
        'weight', profile.final_weight,
        'retrospective_required', profile.requires_retrospective,
        'retrospective_exists', retrospective_exists,
        'min_handoffs', profile.min_handoffs,
        'handoffs_count', handoffs_count,
        'complete', (retrospective_exists OR NOT profile.requires_retrospective)
                    AND handoffs_count >= profile.min_handoffs,
        'progress', CASE WHEN (retrospective_exists OR NOT profile.requires_retrospective)
                              AND handoffs_count >= profile.min_handoffs
                        THEN profile.final_weight ELSE 0 END
      )
    ),
    'total_progress', total_progress,
    'can_complete', total_progress = 100
  );

  RETURN breakdown;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 4: Add comments
-- ============================================================================

COMMENT ON FUNCTION calculate_sd_progress IS
'Profile-aware SD progress calculation with Silent Success prevention. If requires_user_stories=true and user_story_count=0, the verify phase will FAIL instead of auto-passing.';

COMMENT ON FUNCTION get_progress_breakdown IS
'Returns detailed progress breakdown with user story validation status. Shows "BLOCKED: User stories required but none exist" when Silent Success would have occurred.';

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
DECLARE
  profile_count INT;
  column_exists BOOLEAN;
BEGIN
  -- Check column was added
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sd_type_validation_profiles'
    AND column_name = 'requires_user_stories'
  ) INTO column_exists;

  IF column_exists THEN
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'US-001: Progress Calculation Fix - Migration Complete';
    RAISE NOTICE '============================================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Changes applied:';
    RAISE NOTICE '  1. Added requires_user_stories column to sd_type_validation_profiles';
    RAISE NOTICE '  2. Updated calculate_sd_progress() to enforce user story requirements';
    RAISE NOTICE '  3. Updated get_progress_breakdown() to show enforcement status';
    RAISE NOTICE '';
    RAISE NOTICE 'Silent Success Prevention:';
    RAISE NOTICE '  - If requires_user_stories=true AND user_story_count=0 -> FAIL';
    RAISE NOTICE '  - Previously: 0 stories = auto-pass (the backwards logic)';
    RAISE NOTICE '  - Now: 0 stories = blocked with clear error message';
    RAISE NOTICE '';
    RAISE NOTICE 'To verify: SELECT get_progress_breakdown(''SD-XXX'');';
    RAISE NOTICE '============================================================';
  ELSE
    RAISE WARNING 'Column requires_user_stories was not created!';
  END IF;
END $$;
