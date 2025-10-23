-- ============================================================================
-- FIX: calculate_sd_progress - Use explicit BOOLEAN variables
-- ============================================================================
-- Issue: Subquery in IF statement may not evaluate correctly
-- Solution: Use DECLARE + SELECT INTO pattern for clarity
-- SD: SD-2025-1020-E2E-SELECTORS
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_sd_progress(sd_id_param VARCHAR)
RETURNS INTEGER AS $$
DECLARE
  sd RECORD;
  progress INTEGER := 0;
  sd_uuid_val UUID;

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
  -- Get SD
  SELECT * INTO sd FROM strategic_directives_v2 WHERE id = sd_id_param;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SD not found: %', sd_id_param;
  END IF;

  sd_uuid_val := sd.uuid_id;

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
  -- PHASE 4: PLAN Verification (15%)
  -- =========================================================================

  -- Count user stories
  SELECT COUNT(*) INTO user_story_count
  FROM user_stories
  WHERE sd_id = sd_id_param;

  IF user_story_count = 0 THEN
    -- No user stories = validation not required
    user_stories_validated := true;
  ELSE
    -- Check if all user stories are validated
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
-- VERIFICATION TEST
-- ============================================================================

DO $$
DECLARE
  test_progress INTEGER;
BEGIN
  RAISE NOTICE 'Testing calculate_sd_progress with SD-2025-1020-E2E-SELECTORS...';

  test_progress := calculate_sd_progress('SD-2025-1020-E2E-SELECTORS');

  RAISE NOTICE 'Progress: %', test_progress;

  IF test_progress >= 70 THEN
    RAISE NOTICE '✅ EXEC phase is now counting (progress >= 70)';
  ELSIF test_progress = 40 THEN
    RAISE NOTICE '❌ EXEC phase still NOT counting (stuck at 40)';
  ELSE
    RAISE NOTICE '⚠️  Unexpected progress value';
  END IF;
END $$;

-- Test with original SD too
SELECT
  'SD-2025-1020-E2E-SELECTORS' as sd_id,
  calculate_sd_progress('SD-2025-1020-E2E-SELECTORS') as progress,
  'Expected: 70 (20+20+30), Got: ' || calculate_sd_progress('SD-2025-1020-E2E-SELECTORS') as result;
