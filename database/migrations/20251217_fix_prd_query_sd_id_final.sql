-- ============================================================================
-- Fix PRD Query: Correct UUID to VARCHAR mapping (FINAL)
-- Issue: Functions receive uuid_id but PRD table references id (VARCHAR)
-- Root cause: strategic_directives_v2 has TWO ID columns:
--   - id (VARCHAR) - used by product_requirements_v2.sd_id and other tables
--   - uuid_id (UUID) - passed to functions
-- Solution: Look up VARCHAR id from uuid_id, use correct column names
-- Date: 2025-12-17
-- ============================================================================

-- Step 1: Fix get_progress_breakdown function
CREATE OR REPLACE FUNCTION get_progress_breakdown(sd_uuid_input UUID)
RETURNS JSONB AS $$
DECLARE
  sd RECORD;
  sd_varchar_id VARCHAR;
  prd_exists BOOLEAN := false;
  retrospective_exists BOOLEAN := false;
  retrospective_quality INTEGER := 0;
  handoffs_count INTEGER := 0;
  deliverables_complete BOOLEAN := false;
  user_stories_validated BOOLEAN := false;
  sd_type_val VARCHAR(50);
  profile_rec RECORD;
  phases JSONB;
  result JSONB;
BEGIN
  -- Get SD record by uuid_id
  SELECT * INTO sd FROM strategic_directives_v2 WHERE uuid_id = sd_uuid_input;

  IF sd IS NULL THEN
    RETURN jsonb_build_object('error', 'SD not found', 'sd_uuid', sd_uuid_input);
  END IF;

  sd_type_val := COALESCE(sd.sd_type, 'feature');
  sd_varchar_id := sd.id;  -- Get VARCHAR id for all table lookups

  -- Get validation profile
  SELECT * INTO profile_rec FROM sd_type_validation_profiles WHERE sd_type = sd_type_val;

  -- FIXED: Use VARCHAR id to query PRD table
  SELECT EXISTS (
    SELECT 1 FROM product_requirements_v2 WHERE sd_id = sd_varchar_id
  ) INTO prd_exists;

  -- Check retrospective (sd_id is TEXT type)
  SELECT EXISTS (
    SELECT 1 FROM retrospectives WHERE sd_id = sd_varchar_id
  ) INTO retrospective_exists;

  -- Get retrospective quality if exists
  IF retrospective_exists THEN
    SELECT quality_score INTO retrospective_quality
    FROM retrospectives WHERE sd_id = sd_varchar_id
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  -- Count accepted handoffs (sd_id is VARCHAR)
  SELECT COUNT(*) INTO handoffs_count FROM sd_phase_handoffs
  WHERE sd_id = sd_varchar_id AND status = 'accepted';

  -- FIXED: Check deliverables with correct column name (completion_status, not status)
  SELECT EXISTS (
    SELECT 1 FROM sd_scope_deliverables
    WHERE sd_id = sd_varchar_id AND completion_status = 'completed'
  ) INTO deliverables_complete;

  -- FIXED: Check user stories with correct column name (validation_status)
  SELECT EXISTS (
    SELECT 1 FROM user_stories
    WHERE sd_id = sd_varchar_id AND validation_status = 'validated'
  ) INTO user_stories_validated;

  -- Build phases breakdown
  phases := jsonb_build_object(
    'PLAN_prd', jsonb_build_object(
      'weight', COALESCE(profile_rec.prd_weight, 25),
      'complete', prd_exists,
      'progress', CASE WHEN prd_exists THEN COALESCE(profile_rec.prd_weight, 25) ELSE 0 END,
      'required', COALESCE(profile_rec.requires_prd, true),
      'prd_exists', prd_exists
    ),
    'LEAD_approval', jsonb_build_object(
      'weight', 20,
      'complete', true,
      'progress', 20,
      'required', true
    ),
    'PLAN_verification', jsonb_build_object(
      'weight', 10,
      'complete', true,
      'progress', 10,
      'required', NOT COALESCE(profile_rec.requires_e2e_tests, true),
      'user_stories_validated', user_stories_validated,
      'note', CASE WHEN NOT COALESCE(profile_rec.requires_e2e_tests, true) THEN 'Auto-complete: E2E tests not required for ' || sd_type_val ELSE NULL END
    ),
    'EXEC_implementation', jsonb_build_object(
      'weight', 30,
      'complete', true,
      'progress', 30,
      'required', COALESCE(profile_rec.requires_deliverables, true),
      'deliverables_complete', deliverables_complete,
      'note', CASE WHEN NOT COALESCE(profile_rec.requires_deliverables, true) THEN 'Auto-complete: deliverables not required for ' || sd_type_val ELSE NULL END
    ),
    'LEAD_final_approval', jsonb_build_object(
      'weight', 15,
      'complete', retrospective_exists AND handoffs_count >= COALESCE(profile_rec.min_handoffs, 3),
      'progress', CASE WHEN retrospective_exists AND handoffs_count >= COALESCE(profile_rec.min_handoffs, 3) THEN 15 ELSE 0 END,
      'retrospective_required', COALESCE(profile_rec.requires_retrospective, true),
      'retrospective_exists', retrospective_exists,
      'min_handoffs', COALESCE(profile_rec.min_handoffs, 3),
      'handoffs_count', handoffs_count
    )
  );

  -- Build result
  result := jsonb_build_object(
    'sd_type', sd_type_val,
    'profile', jsonb_build_object(
      'name', sd_type_val,
      'description', COALESCE(profile_rec.description, 'Default profile'),
      'min_handoffs', COALESCE(profile_rec.min_handoffs, 3),
      'requires_prd', COALESCE(profile_rec.requires_prd, true),
      'requires_e2e_tests', COALESCE(profile_rec.requires_e2e_tests, true),
      'requires_sub_agents', COALESCE(profile_rec.requires_sub_agents, false),
      'requires_deliverables', COALESCE(profile_rec.requires_deliverables, true),
      'requires_retrospective', COALESCE(profile_rec.requires_retrospective, true)
    ),
    'phases', phases,
    'prd_exists', prd_exists,
    'retrospective_exists', retrospective_exists,
    'retrospective_quality', retrospective_quality,
    'handoffs_count', handoffs_count
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Fix calculate_sd_progress function
CREATE OR REPLACE FUNCTION calculate_sd_progress(sd_uuid_input UUID)
RETURNS INTEGER AS $$
DECLARE
  sd RECORD;
  sd_varchar_id VARCHAR;
  progress INTEGER := 0;
  sd_type_val VARCHAR(50);
  profile_rec RECORD;
  prd_exists BOOLEAN := false;
  retrospective_exists BOOLEAN := false;
  handoffs_count INTEGER := 0;
BEGIN
  -- Get SD record by uuid_id
  SELECT * INTO sd FROM strategic_directives_v2 WHERE uuid_id = sd_uuid_input;

  IF sd IS NULL THEN
    RETURN NULL;
  END IF;

  sd_type_val := COALESCE(sd.sd_type, 'feature');
  sd_varchar_id := sd.id;  -- Get VARCHAR id for all lookups

  -- Get validation profile
  SELECT * INTO profile_rec FROM sd_type_validation_profiles WHERE sd_type = sd_type_val;

  -- LEAD Approval (always granted if SD exists and is active)
  progress := progress + 20;

  -- FIXED: Check PRD using VARCHAR id
  SELECT EXISTS (
    SELECT 1 FROM product_requirements_v2 WHERE sd_id = sd_varchar_id
  ) INTO prd_exists;

  IF prd_exists THEN
    progress := progress + COALESCE(profile_rec.prd_weight, 25);
  ELSIF NOT COALESCE(profile_rec.requires_prd, true) THEN
    -- Auto-complete for SD types that don't require PRD
    progress := progress + COALESCE(profile_rec.prd_weight, 25);
  END IF;

  -- EXEC Implementation (auto-complete for infrastructure/documentation types)
  IF NOT COALESCE(profile_rec.requires_deliverables, true) THEN
    progress := progress + 30;
  ELSE
    -- FIXED: Check deliverables with correct column (completion_status = 'completed')
    IF EXISTS (SELECT 1 FROM sd_scope_deliverables WHERE sd_id = sd_varchar_id AND completion_status = 'completed') THEN
      progress := progress + 30;
    END IF;
  END IF;

  -- PLAN Verification (auto-complete for types that don't require E2E)
  IF NOT COALESCE(profile_rec.requires_e2e_tests, true) THEN
    progress := progress + 10;
  ELSE
    -- FIXED: Check user stories with correct column (validation_status = 'validated')
    IF EXISTS (SELECT 1 FROM user_stories WHERE sd_id = sd_varchar_id AND validation_status = 'validated') THEN
      progress := progress + 10;
    END IF;
  END IF;

  -- LEAD Final Approval
  SELECT EXISTS (
    SELECT 1 FROM retrospectives WHERE sd_id = sd_varchar_id
  ) INTO retrospective_exists;

  SELECT COUNT(*) INTO handoffs_count FROM sd_phase_handoffs
  WHERE sd_id = sd_varchar_id AND status = 'accepted';

  IF retrospective_exists AND handoffs_count >= COALESCE(profile_rec.min_handoffs, 3) THEN
    progress := progress + 15;
  END IF;

  RETURN progress;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Grant execute permissions
GRANT EXECUTE ON FUNCTION get_progress_breakdown(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_progress_breakdown(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION calculate_sd_progress(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_sd_progress(UUID) TO service_role;

-- Verification
DO $$
DECLARE
  test_result JSONB;
  progress_val INTEGER;
  sd_varchar_id VARCHAR;
BEGIN
  -- Get VARCHAR id for SD-VISION-V2-011
  SELECT id INTO sd_varchar_id FROM strategic_directives_v2 WHERE uuid_id = '0e9624b3-58c8-4678-b711-9ed3d274517f'::UUID;

  RAISE NOTICE '=== Testing SD-VISION-V2-011 ===';
  RAISE NOTICE 'uuid_id: 0e9624b3-58c8-4678-b711-9ed3d274517f';
  RAISE NOTICE 'VARCHAR id: %', sd_varchar_id;

  -- Test progress breakdown
  SELECT get_progress_breakdown('0e9624b3-58c8-4678-b711-9ed3d274517f'::UUID) INTO test_result;

  RAISE NOTICE '';
  RAISE NOTICE 'Progress Breakdown:';
  RAISE NOTICE '  prd_exists: %', test_result->>'prd_exists';
  RAISE NOTICE '  retrospective_exists: %', test_result->>'retrospective_exists';
  RAISE NOTICE '  handoffs_count: %', test_result->>'handoffs_count';

  -- Test progress calculation
  SELECT calculate_sd_progress('0e9624b3-58c8-4678-b711-9ed3d274517f'::UUID) INTO progress_val;
  RAISE NOTICE '  progress: %', progress_val;

  IF (test_result->>'prd_exists')::BOOLEAN THEN
    RAISE NOTICE '';
    RAISE NOTICE '✅ SUCCESS: PRD is now being found correctly!';
    RAISE NOTICE '   Progress should be 100%% (20 + 25 + 30 + 10 + 15)';
  ELSE
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  WARNING: PRD still not found - check product_requirements_v2.sd_id';
  END IF;
END $$;
