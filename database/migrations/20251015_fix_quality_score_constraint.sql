-- Migration: Fix Quality Score Constraint
-- Purpose: The constraint exists but may have been created incorrectly
-- Date: 2025-10-15

-- Drop existing constraint and trigger
ALTER TABLE retrospectives DROP CONSTRAINT IF EXISTS retrospectives_quality_score_check CASCADE;
DROP TRIGGER IF EXISTS trigger_validate_retrospective_quality_score ON retrospectives CASCADE;
DROP FUNCTION IF EXISTS validate_retrospective_quality_score() CASCADE;

-- Verify current data is valid
DO $$
DECLARE
  invalid_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM retrospectives
  WHERE quality_score IS NULL OR quality_score < 70 OR quality_score > 100;

  IF invalid_count > 0 THEN
    RAISE NOTICE 'Found % records with invalid quality_score, fixing...', invalid_count;

    UPDATE retrospectives
    SET quality_score = 70
    WHERE quality_score IS NULL OR quality_score < 70;

    UPDATE retrospectives
    SET quality_score = 100
    WHERE quality_score > 100;
  ELSE
    RAISE NOTICE 'All existing records have valid quality_score values';
  END IF;
END;
$$;

-- Recreate the constraint with explicit data type casting
ALTER TABLE retrospectives
ADD CONSTRAINT retrospectives_quality_score_check
CHECK (
  quality_score IS NOT NULL
  AND CAST(quality_score AS INTEGER) >= 70
  AND CAST(quality_score AS INTEGER) <= 100
);

-- Test the constraint
DO $$
BEGIN
  RAISE NOTICE 'Testing constraint...';

  -- Test 1: Try quality_score = 70 (should succeed)
  BEGIN
    INSERT INTO retrospectives (
      sd_id, project_name, retro_type, title, description,
      conducted_date, what_went_well, what_needs_improvement,
      key_learnings, action_items, quality_score, status
    ) VALUES (
      'TEST-FIX-001', 'Test', 'TEST', 'Test', 'Test',
      NOW(), ARRAY['Test'], ARRAY['Test'], ARRAY['Test'], ARRAY['Test'],
      70, 'DRAFT'
    );

    DELETE FROM retrospectives WHERE sd_id = 'TEST-FIX-001';
    RAISE NOTICE '✅ Test passed: quality_score = 70 accepted';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '❌ Test failed: quality_score = 70 rejected - %', SQLERRM;
  END;

  -- Test 2: Try quality_score = 69 (should fail)
  BEGIN
    INSERT INTO retrospectives (
      sd_id, project_name, retro_type, title, description,
      conducted_date, what_went_well, what_needs_improvement,
      key_learnings, action_items, quality_score, status
    ) VALUES (
      'TEST-FIX-002', 'Test', 'TEST', 'Test', 'Test',
      NOW(), ARRAY['Test'], ARRAY['Test'], ARRAY['Test'], ARRAY['Test'],
      69, 'DRAFT'
    );

    RAISE NOTICE '❌ Test failed: quality_score = 69 was accepted (should be rejected)';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '✅ Test passed: quality_score = 69 rejected';
  END;
END;
$$;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ Constraint fixed and tested successfully';
  RAISE NOTICE '';
END;
$$;
