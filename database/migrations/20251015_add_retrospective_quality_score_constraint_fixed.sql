-- Migration: Add Quality Score Constraint to Retrospectives Table (FIXED VERSION)
-- Purpose: Prevent quality_score = 0 or null (SD-KNOWLEDGE-001 Issue #4)
-- Related: docs/retrospectives/SD-KNOWLEDGE-001-completion-issues-and-prevention.md
-- Date: 2025-10-15
-- Note: This version separates data updates from constraint application

-- ============================================================================
-- Step 1: Update existing records with quality_score = 0 or null
-- ============================================================================

-- Find and report records with problematic quality scores
DO $$
DECLARE
  zero_count INTEGER;
  null_count INTEGER;
  below_threshold_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO zero_count FROM retrospectives WHERE quality_score = 0;
  SELECT COUNT(*) INTO null_count FROM retrospectives WHERE quality_score IS NULL;
  SELECT COUNT(*) INTO below_threshold_count FROM retrospectives WHERE quality_score > 0 AND quality_score < 70;

  RAISE NOTICE 'Found % records with quality_score = 0', zero_count;
  RAISE NOTICE 'Found % records with quality_score IS NULL', null_count;
  RAISE NOTICE 'Found % records with quality_score between 1-69', below_threshold_count;

  IF zero_count > 0 OR null_count > 0 OR below_threshold_count > 0 THEN
    RAISE NOTICE 'Updating these records to minimum threshold (70)...';
  ELSE
    RAISE NOTICE 'No records found with quality_score issues';
  END IF;
END;
$$;

-- Update records with quality_score = 0, NULL, or < 70 to minimum threshold
UPDATE retrospectives
SET quality_score = 70
WHERE quality_score IS NULL
   OR quality_score = 0
   OR quality_score < 70;

-- Report results
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % records to quality_score = 70', updated_count;
END;
$$;

-- Verify no invalid scores remain
DO $$
DECLARE
  invalid_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM retrospectives
  WHERE quality_score IS NULL OR quality_score < 70 OR quality_score > 100;

  IF invalid_count > 0 THEN
    RAISE WARNING 'Still have % records with invalid quality_score!', invalid_count;
  ELSE
    RAISE NOTICE '✅ All quality_score values are now valid (70-100)';
  END IF;
END;
$$;
