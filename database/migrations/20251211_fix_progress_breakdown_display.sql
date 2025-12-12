-- ============================================================================
-- Migration: Fix get_progress_breakdown Display Logic
-- Purpose: Make the display match actual calculation logic
--
-- ROOT CAUSE ANALYSIS:
-- The get_progress_breakdown function uses "simplified" display logic that
-- shows complete=false and progress=0 for ANY SD that requires deliverables
-- or E2E tests, even when those requirements ARE actually met.
--
-- The actual calculate_sd_progress function correctly checks the real state,
-- but the error message (which uses get_progress_breakdown) shows misleading
-- phase status, causing confusion about what's actually wrong.
--
-- BUG LOCATION: Lines 358-377 of 20251207_sd_type_validation_profiles.sql
--
-- FIX: Update get_progress_breakdown to calculate the same values as
-- calculate_sd_progress for display purposes.
--
-- Date: 2025-12-11
-- ============================================================================

CREATE OR REPLACE FUNCTION get_progress_breakdown(sd_id_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
  sd RECORD;
  sd_type_val VARCHAR;
  profile RECORD;
  breakdown JSONB;
  total_progress INTEGER;

  -- Component states (matching calculate_sd_progress logic)
  prd_exists BOOLEAN;
  deliverables_complete BOOLEAN := false;
  user_stories_validated BOOLEAN := false;
  retrospective_exists BOOLEAN;
  handoffs_count INT;

  -- For display
  exec_complete BOOLEAN := false;
  exec_progress INT := 0;
  verify_complete BOOLEAN := false;
  verify_progress INT := 0;
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

  -- ============================================================================
  -- PHASE 2: PRD Check (same as before)
  -- ============================================================================
  SELECT EXISTS (
    SELECT 1 FROM product_requirements_v2
    WHERE directive_id = sd_id_param
    AND status IN ('approved', 'in_progress', 'completed')
  ) INTO prd_exists;

  -- ============================================================================
  -- PHASE 3: EXEC Implementation Check (FIXED - now matches calculate_sd_progress)
  -- ============================================================================
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
      -- No deliverables tracked = assume complete (legacy behavior)
      deliverables_complete := true;
    END IF;

    exec_complete := deliverables_complete;
    exec_progress := CASE WHEN deliverables_complete THEN profile.exec_weight ELSE 0 END;
  ELSE
    -- Deliverables not required
    exec_complete := true;
    exec_progress := profile.exec_weight;
  END IF;

  -- ============================================================================
  -- PHASE 4: PLAN Verification Check (FIXED - now matches calculate_sd_progress)
  -- ============================================================================
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
      -- No user stories = validation not required
      user_stories_validated := true;
    END IF;

    verify_complete := user_stories_validated;
    verify_progress := CASE WHEN user_stories_validated THEN profile.verify_weight ELSE 0 END;
  ELSE
    -- E2E tests not required
    verify_complete := true;
    verify_progress := profile.verify_weight;
  END IF;

  -- ============================================================================
  -- PHASE 5: Final Approval Check (same as before)
  -- ============================================================================
  SELECT EXISTS (
    SELECT 1 FROM retrospectives WHERE sd_id = sd_id_param
  ) INTO retrospective_exists;

  SELECT COUNT(DISTINCT handoff_type) INTO handoffs_count
  FROM sd_phase_handoffs
  WHERE sd_id = sd_id_param AND status = 'accepted';

  -- Calculate total
  total_progress := calculate_sd_progress(sd_id_param);

  -- Build breakdown with ACCURATE display values
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
        'deliverables_complete', deliverables_complete,
        'complete', exec_complete,
        'progress', exec_progress,
        'note', CASE
          WHEN NOT profile.requires_deliverables THEN 'Auto-complete: deliverables not required for ' || sd_type_val
          WHEN deliverables_complete THEN 'All required/high priority deliverables completed'
          ELSE 'Incomplete: Check sd_scope_deliverables table'
        END
      ),
      'PLAN_verification', jsonb_build_object(
        'weight', profile.verify_weight,
        'required', profile.requires_e2e_tests,
        'user_stories_validated', user_stories_validated,
        'complete', verify_complete,
        'progress', verify_progress,
        'note', CASE
          WHEN NOT profile.requires_e2e_tests THEN 'Auto-complete: E2E tests not required for ' || sd_type_val
          WHEN user_stories_validated THEN 'All user stories validated with passing E2E tests'
          ELSE 'Incomplete: Check user_stories.validation_status and e2e_test_status'
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
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION get_progress_breakdown IS
'Returns detailed progress breakdown with ACCURATE phase status.
Fixed 2025-12-11: Now correctly calculates EXEC_implementation and
PLAN_verification status matching calculate_sd_progress logic.';

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'get_progress_breakdown Display Fix Complete';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'BEFORE: Display showed complete=false for any SD requiring';
  RAISE NOTICE '        deliverables/E2E, even when requirements were met.';
  RAISE NOTICE '';
  RAISE NOTICE 'AFTER: Display accurately reflects actual completion state';
  RAISE NOTICE '       by using the same logic as calculate_sd_progress.';
  RAISE NOTICE '';
  RAISE NOTICE 'This eliminates misleading error messages during SD completion.';
  RAISE NOTICE '============================================================';
END $$;
