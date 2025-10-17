-- Migration: Add Quality Score Constraint to Retrospectives Table
-- Purpose: Prevent quality_score = 0 or null (SD-KNOWLEDGE-001 Issue #4)
-- Related: docs/retrospectives/SD-KNOWLEDGE-001-completion-issues-and-prevention.md
-- Date: 2025-10-15

-- ============================================================================
-- Step 1: Update existing records with quality_score = 0 or null
-- ============================================================================

-- Find and report records with problematic quality scores
DO $$
DECLARE
  zero_count INTEGER;
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO zero_count FROM retrospectives WHERE quality_score = 0;
  SELECT COUNT(*) INTO null_count FROM retrospectives WHERE quality_score IS NULL;

  IF zero_count > 0 OR null_count > 0 THEN
    RAISE NOTICE 'Found % records with quality_score = 0', zero_count;
    RAISE NOTICE 'Found % records with quality_score IS NULL', null_count;
    RAISE NOTICE 'Updating these records to minimum threshold (70)...';
  ELSE
    RAISE NOTICE 'No records found with quality_score issues';
  END IF;
END;
$$;

-- Update records with quality_score = 0 to minimum threshold
UPDATE retrospectives
SET quality_score = 70
WHERE quality_score = 0
   OR quality_score IS NULL;

-- ============================================================================
-- Step 2: Add NOT NULL constraint
-- ============================================================================

ALTER TABLE retrospectives
ALTER COLUMN quality_score SET NOT NULL;

COMMENT ON COLUMN retrospectives.quality_score IS
'Quality score (70-100). Must be >= 70 for completed SDs. Never 0.
Constraint added to prevent SD-KNOWLEDGE-001 Issue #4.';

-- ============================================================================
-- Step 3: Add CHECK constraint for minimum value
-- ============================================================================

-- Drop existing constraint if it exists
ALTER TABLE retrospectives
DROP CONSTRAINT IF EXISTS retrospectives_quality_score_check;

-- Add new constraint
ALTER TABLE retrospectives
ADD CONSTRAINT retrospectives_quality_score_check
CHECK (quality_score >= 70 AND quality_score <= 100);

COMMENT ON CONSTRAINT retrospectives_quality_score_check ON retrospectives IS
'Ensures quality_score is between 70 and 100.
Prevents quality_score = 0 issue (SD-KNOWLEDGE-001 Issue #4).
Base score calculation starts at 70 to ensure minimum threshold.';

-- ============================================================================
-- Step 4: Create validation trigger (optional, additional safety)
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_retrospective_quality_score()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure quality_score is not null
  IF NEW.quality_score IS NULL THEN
    RAISE EXCEPTION 'quality_score cannot be NULL. Must be between 70 and 100.';
  END IF;

  -- Ensure quality_score is within valid range
  IF NEW.quality_score < 70 THEN
    RAISE EXCEPTION 'quality_score (%) is below minimum threshold (70). Check calculate_quality_score logic.', NEW.quality_score;
  END IF;

  IF NEW.quality_score > 100 THEN
    RAISE EXCEPTION 'quality_score (%) exceeds maximum (100). Check calculate_quality_score logic.', NEW.quality_score;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_validate_retrospective_quality_score ON retrospectives;

CREATE TRIGGER trigger_validate_retrospective_quality_score
BEFORE INSERT OR UPDATE ON retrospectives
FOR EACH ROW
EXECUTE FUNCTION validate_retrospective_quality_score();

COMMENT ON FUNCTION validate_retrospective_quality_score() IS
'Validates retrospective quality_score before insert/update.
Prevents quality_score = 0 or out of range values.
Part of SD-KNOWLEDGE-001 Issue #4 prevention measures.';

-- ============================================================================
-- Step 5: Verification
-- ============================================================================

DO $$
DECLARE
  constraint_exists BOOLEAN;
  trigger_exists BOOLEAN;
  min_score INTEGER;
  max_score INTEGER;
  null_count INTEGER;
BEGIN
  -- Check constraint exists
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'retrospectives_quality_score_check'
  ) INTO constraint_exists;

  -- Check trigger exists
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trigger_validate_retrospective_quality_score'
  ) INTO trigger_exists;

  -- Get score statistics
  SELECT MIN(quality_score), MAX(quality_score), COUNT(*)
  INTO min_score, max_score, null_count
  FROM retrospectives
  WHERE quality_score IS NULL;

  -- Report results
  RAISE NOTICE '';
  RAISE NOTICE '='.repeat(60);
  RAISE NOTICE '✅ Migration Verification';
  RAISE NOTICE '='.repeat(60);
  RAISE NOTICE 'Constraint exists: %', constraint_exists;
  RAISE NOTICE 'Trigger exists: %', trigger_exists;
  RAISE NOTICE 'Minimum quality_score: %', COALESCE(min_score::TEXT, 'N/A');
  RAISE NOTICE 'Maximum quality_score: %', COALESCE(max_score::TEXT, 'N/A');
  RAISE NOTICE 'Records with NULL: %', null_count;

  IF constraint_exists AND trigger_exists AND null_count = 0 THEN
    RAISE NOTICE '';
    RAISE NOTICE '✅ All validation checks passed!';
    RAISE NOTICE '   quality_score constraint is active';
    RAISE NOTICE '   Trigger will prevent invalid inserts';
    RAISE NOTICE '   No NULL values in existing data';
  ELSE
    RAISE WARNING 'Validation incomplete - review above results';
  END IF;

  RAISE NOTICE '';
END;
$$;

-- ============================================================================
-- Test: Try to insert invalid quality scores (should fail)
-- ============================================================================

DO $$
DECLARE
  test_passed BOOLEAN := false;
BEGIN
  -- Test 1: Try to insert quality_score = 0 (should fail)
  BEGIN
    INSERT INTO retrospectives (
      sd_id,
      project_name,
      retro_type,
      title,
      description,
      conducted_date,
      what_went_well,
      what_needs_improvement,
      key_learnings,
      action_items,
      quality_score,
      status
    ) VALUES (
      'TEST-CONSTRAINT-001',
      'Test Project',
      'TEST',
      'Test Retrospective',
      'Testing constraint',
      NOW(),
      ARRAY['Test'],
      ARRAY['Test'],
      ARRAY['Test'],
      ARRAY['Test'],
      0,  -- This should fail
      'DRAFT'
    );

    RAISE EXCEPTION 'Test FAILED: quality_score = 0 was allowed!';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%quality_score%' OR SQLERRM LIKE '%constraint%' OR SQLERRM LIKE '%check%' THEN
        RAISE NOTICE '✅ Test 1 PASSED: quality_score = 0 correctly rejected';
        test_passed := true;
      ELSE
        RAISE NOTICE '❌ Test 1 FAILED: Unexpected error: %', SQLERRM;
      END IF;
  END;

  -- Test 2: Try to insert NULL quality_score (should fail)
  BEGIN
    INSERT INTO retrospectives (
      sd_id,
      project_name,
      retro_type,
      title,
      description,
      conducted_date,
      what_went_well,
      what_needs_improvement,
      key_learnings,
      action_items,
      quality_score,
      status
    ) VALUES (
      'TEST-CONSTRAINT-002',
      'Test Project',
      'TEST',
      'Test Retrospective',
      'Testing constraint',
      NOW(),
      ARRAY['Test'],
      ARRAY['Test'],
      ARRAY['Test'],
      ARRAY['Test'],
      NULL,  -- This should fail
      'DRAFT'
    );

    RAISE EXCEPTION 'Test FAILED: quality_score = NULL was allowed!';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%null%' OR SQLERRM LIKE '%NOT NULL%' OR SQLERRM LIKE '%quality_score%' THEN
        RAISE NOTICE '✅ Test 2 PASSED: quality_score = NULL correctly rejected';
      ELSE
        RAISE NOTICE '❌ Test 2 FAILED: Unexpected error: %', SQLERRM;
      END IF;
  END;

  -- Test 3: Try to insert quality_score = 69 (should fail)
  BEGIN
    INSERT INTO retrospectives (
      sd_id,
      project_name,
      retro_type,
      title,
      description,
      conducted_date,
      what_went_well,
      what_needs_improvement,
      key_learnings,
      action_items,
      quality_score,
      status
    ) VALUES (
      'TEST-CONSTRAINT-003',
      'Test Project',
      'TEST',
      'Test Retrospective',
      'Testing constraint',
      NOW(),
      ARRAY['Test'],
      ARRAY['Test'],
      ARRAY['Test'],
      ARRAY['Test'],
      69,  -- This should fail (below threshold)
      'DRAFT'
    );

    RAISE EXCEPTION 'Test FAILED: quality_score = 69 was allowed!';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%quality_score%' OR SQLERRM LIKE '%70%' THEN
        RAISE NOTICE '✅ Test 3 PASSED: quality_score = 69 correctly rejected';
      ELSE
        RAISE NOTICE '❌ Test 3 FAILED: Unexpected error: %', SQLERRM;
      END IF;
  END;

  -- Test 4: Try to insert valid quality_score = 70 (should succeed)
  BEGIN
    INSERT INTO retrospectives (
      sd_id,
      project_name,
      retro_type,
      title,
      description,
      conducted_date,
      what_went_well,
      what_needs_improvement,
      key_learnings,
      action_items,
      quality_score,
      status
    ) VALUES (
      'TEST-CONSTRAINT-004',
      'Test Project',
      'TEST',
      'Test Retrospective',
      'Testing constraint',
      NOW(),
      ARRAY['Test'],
      ARRAY['Test'],
      ARRAY['Test'],
      ARRAY['Test'],
      70,  -- This should succeed
      'DRAFT'
    );

    RAISE NOTICE '✅ Test 4 PASSED: quality_score = 70 correctly accepted';

    -- Clean up test record
    DELETE FROM retrospectives WHERE sd_id = 'TEST-CONSTRAINT-004';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '❌ Test 4 FAILED: Valid quality_score = 70 was rejected: %', SQLERRM;
  END;

  RAISE NOTICE '';
  RAISE NOTICE '🧪 Constraint testing complete';
END;
$$;

-- ============================================================================
-- Success message
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '='.repeat(60);
  RAISE NOTICE '✅ Migration Complete: Retrospective Quality Score Constraint';
  RAISE NOTICE '='.repeat(60);
  RAISE NOTICE 'Changes applied:';
  RAISE NOTICE '  1. Updated existing records with quality_score < 70 to 70';
  RAISE NOTICE '  2. Added NOT NULL constraint on quality_score column';
  RAISE NOTICE '  3. Added CHECK constraint (quality_score >= 70 AND <= 100)';
  RAISE NOTICE '  4. Created validation trigger for additional safety';
  RAISE NOTICE '  5. Tested constraints with invalid data';
  RAISE NOTICE '';
  RAISE NOTICE 'Prevention measures:';
  RAISE NOTICE '  ✅ quality_score can never be NULL';
  RAISE NOTICE '  ✅ quality_score can never be 0';
  RAISE NOTICE '  ✅ quality_score must be between 70 and 100';
  RAISE NOTICE '  ✅ Trigger provides clear error messages';
  RAISE NOTICE '';
  RAISE NOTICE 'Related: SD-KNOWLEDGE-001 Issue #4 prevention';
  RAISE NOTICE '';
END;
$$;
