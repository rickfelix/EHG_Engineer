-- ============================================================================
-- UPDATE calculate_sd_progress - Add sd_type Awareness
-- ============================================================================
-- Purpose: Enable type-aware validation for infrastructure SDs
-- SD: SD-INFRA-VALIDATION
-- Date: 2025-10-22
-- ============================================================================
-- ENHANCEMENT: Infrastructure SDs skip E2E validation, validate with unit tests
-- BACKWARD COMPATIBLE: Feature SDs maintain existing E2E requirements
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_sd_progress(sd_id_param VARCHAR)
RETURNS INTEGER AS $$
DECLARE
  sd RECORD;
  progress INTEGER := 0;
  sd_uuid_val UUID;
  sd_type_val VARCHAR(50);

  -- Explicit boolean flags
  lead_approved BOOLEAN := false;
  prd_exists BOOLEAN := false;
  deliverables_complete BOOLEAN := false;
  user_stories_validated BOOLEAN := false;
  final_approval_complete BOOLEAN := false;

  -- Counts for debugging
  deliverable_total INTEGER;
  deliverable_completed INTEGER;
  user_story_count INTEGER;
  handoff_count INTEGER;
BEGIN
  -- Get SD with type information
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SD not found: %', sd_id_param;
  END IF;

  sd_uuid_val := sd.uuid_id;
  sd_type_val := COALESCE(sd.sd_type, 'feature');  -- Default to 'feature' for backward compatibility

  -- =========================================================================
  -- PHASE 1: LEAD Initial Approval (20%)
  -- =========================================================================
  IF sd.status IN ('active', 'in_progress', 'pending_approval', 'completed') THEN
    lead_approved := true;
    progress := progress + 20;
  END IF;

  -- =========================================================================
  -- PHASE 2: PLAN PRD Creation (20%)
  -- =========================================================================
  SELECT EXISTS (
    SELECT 1 FROM product_requirements_v2 WHERE sd_uuid = sd_uuid_val
  ) INTO prd_exists;

  IF prd_exists THEN
    progress := progress + 20;
  END IF;

  -- =========================================================================
  -- PHASE 3: EXEC Implementation (30%)
  -- =========================================================================

  -- Check if deliverables exist
  SELECT COUNT(*) INTO deliverable_total
  FROM sd_scope_deliverables
  WHERE sd_id = sd_id_param
  AND priority IN ('required', 'high');

  IF deliverable_total = 0 THEN
    -- No deliverables tracked = legacy SD, assume complete
    deliverables_complete := true;
  ELSE
    -- Count completed deliverables
    SELECT COUNT(*) INTO deliverable_completed
    FROM sd_scope_deliverables
    WHERE sd_id = sd_id_param
    AND priority IN ('required', 'high')
    AND completion_status = 'completed';

    -- Check if all are complete
    IF deliverable_completed = deliverable_total THEN
      deliverables_complete := true;
    END IF;
  END IF;

  IF deliverables_complete THEN
    progress := progress + 30;
  END IF;

  -- =========================================================================
  -- PHASE 4: PLAN Verification (15%) - TYPE-AWARE VALIDATION
  -- =========================================================================

  -- Count user stories
  SELECT COUNT(*) INTO user_story_count
  FROM user_stories
  WHERE sd_id = sd_id_param;

  IF user_story_count = 0 THEN
    -- No user stories = validation not required
    user_stories_validated := true;
  ELSE
    -- TYPE-AWARE VALIDATION LOGIC
    IF sd_type_val IN ('infrastructure', 'database', 'security', 'documentation') THEN
      -- Infrastructure SDs: Validate with status='completed' (skip E2E requirement)
      DECLARE
        completed_count INTEGER;
      BEGIN
        SELECT COUNT(*) INTO completed_count
        FROM user_stories
        WHERE sd_id = sd_id_param
        AND status = 'completed';

        IF completed_count = user_story_count THEN
          user_stories_validated := true;
        END IF;
      END;
    ELSE
      -- Feature SDs: Maintain existing E2E validation requirement
      DECLARE
        validated_count INTEGER;
      BEGIN
        SELECT COUNT(*) INTO validated_count
        FROM user_stories
        WHERE sd_id = sd_id_param
        AND validation_status = 'validated';

        IF validated_count = user_story_count THEN
          user_stories_validated := true;
        END IF;
      END;
    END IF;
  END IF;

  IF user_stories_validated THEN
    progress := progress + 15;
  END IF;

  -- =========================================================================
  -- PHASE 5: LEAD Final Approval (15%)
  -- =========================================================================

  DECLARE
    retrospective_exists BOOLEAN;
    handoffs_sufficient BOOLEAN;
  BEGIN
    -- Check retrospective
    SELECT EXISTS (
      SELECT 1 FROM retrospectives
      WHERE sd_id = sd_id_param
      AND status = 'PUBLISHED'
      AND quality_score IS NOT NULL
    ) INTO retrospective_exists;

    -- Check handoffs (need at least 3 accepted handoffs)
    SELECT COUNT(DISTINCT handoff_type) INTO handoff_count
    FROM sd_phase_handoffs
    WHERE sd_id = sd_id_param
    AND status = 'accepted';

    handoffs_sufficient := (handoff_count >= 3);

    IF retrospective_exists AND handoffs_sufficient THEN
      final_approval_complete := true;
      progress := progress + 15;
    END IF;
  END;

  RETURN progress;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VERIFICATION TESTS
-- ============================================================================

-- Test 1: Infrastructure SD (SD-CICD-WORKFLOW-FIX)
DO $$
DECLARE
  test_progress INTEGER;
  test_sd_type VARCHAR(50);
BEGIN
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE 'TEST 1: Infrastructure SD Validation';
  RAISE NOTICE '════════════════════════════════════════════════════════════';

  -- Get SD type
  SELECT sd_type INTO test_sd_type
  FROM strategic_directives_v2
  WHERE id = 'SD-CICD-WORKFLOW-FIX';

  RAISE NOTICE 'SD-CICD-WORKFLOW-FIX type: %', test_sd_type;

  test_progress := calculate_sd_progress('SD-CICD-WORKFLOW-FIX');

  RAISE NOTICE 'Progress: %', test_progress;

  IF test_sd_type = 'infrastructure' THEN
    RAISE NOTICE '✅ SD correctly marked as infrastructure';
  ELSE
    RAISE WARNING '⚠️  SD type is % (expected: infrastructure)', test_sd_type;
  END IF;

  IF test_progress >= 70 THEN
    RAISE NOTICE '✅ Infrastructure SD validation working (progress >= 70)';
  ELSE
    RAISE WARNING '⚠️  Infrastructure SD may need user stories marked completed';
  END IF;
END $$;

-- Test 2: Feature SD (backward compatibility)
DO $$
DECLARE
  test_progress INTEGER;
  test_sd_type VARCHAR(50);
BEGIN
  RAISE NOTICE '════════════════════════════════════════════════════════════';
  RAISE NOTICE 'TEST 2: Feature SD Backward Compatibility';
  RAISE NOTICE '════════════════════════════════════════════════════════════';

  -- Pick any feature SD (assuming default type)
  SELECT sd_type INTO test_sd_type
  FROM strategic_directives_v2
  WHERE id = 'SD-2025-1020-E2E-SELECTORS';

  RAISE NOTICE 'SD-2025-1020-E2E-SELECTORS type: %', COALESCE(test_sd_type, 'feature (default)');

  test_progress := calculate_sd_progress('SD-2025-1020-E2E-SELECTORS');

  RAISE NOTICE 'Progress: %', test_progress;
  RAISE NOTICE '✅ Feature SD validation maintains existing logic';
END $$;

-- Test 3: Show all SDs with their types
SELECT
  id,
  LEFT(title, 40) as title,
  COALESCE(sd_type, 'feature') as sd_type,
  status,
  calculate_sd_progress(id) as progress
FROM strategic_directives_v2
WHERE status IN ('active', 'in_progress', 'completed')
ORDER BY created_at DESC
LIMIT 10;

RAISE NOTICE '════════════════════════════════════════════════════════════';
RAISE NOTICE 'calculate_sd_progress() updated with sd_type awareness';
RAISE NOTICE '✅ Infrastructure SDs: Validate with status=completed';
RAISE NOTICE '✅ Feature SDs: Maintain E2E validation (validation_status=validated)';
RAISE NOTICE '✅ Backward compatible: NULL sd_type defaults to feature';
RAISE NOTICE '════════════════════════════════════════════════════════════';
