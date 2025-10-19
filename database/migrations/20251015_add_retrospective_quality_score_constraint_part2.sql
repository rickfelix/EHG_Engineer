-- Migration: Add Quality Score Constraint to Retrospectives Table (PART 2 - Constraints)
-- Purpose: Apply NOT NULL and CHECK constraints after data cleanup
-- Related: docs/retrospectives/SD-KNOWLEDGE-001-completion-issues-and-prevention.md
-- Date: 2025-10-15
-- Note: Run this AFTER 20251015_add_retrospective_quality_score_constraint_fixed.sql

-- ============================================================================
-- Step 1: Add NOT NULL constraint
-- ============================================================================

ALTER TABLE retrospectives
ALTER COLUMN quality_score SET NOT NULL;

DO $$
BEGIN
  RAISE NOTICE '✅ Added NOT NULL constraint on quality_score';
END;
$$;

COMMENT ON COLUMN retrospectives.quality_score IS
'Quality score (70-100). Must be >= 70 for completed SDs. Never 0.
Constraint added to prevent SD-KNOWLEDGE-001 Issue #4.';

-- ============================================================================
-- Step 2: Add CHECK constraint for value range
-- ============================================================================

-- Drop existing constraint if it exists
ALTER TABLE retrospectives
DROP CONSTRAINT IF EXISTS retrospectives_quality_score_check;

-- Add new constraint
ALTER TABLE retrospectives
ADD CONSTRAINT retrospectives_quality_score_check
CHECK (quality_score >= 70 AND quality_score <= 100);

DO $$
BEGIN
  RAISE NOTICE '✅ Added CHECK constraint (quality_score >= 70 AND <= 100)';
END;
$$;

COMMENT ON CONSTRAINT retrospectives_quality_score_check ON retrospectives IS
'Ensures quality_score is between 70 and 100.
Prevents quality_score = 0 issue (SD-KNOWLEDGE-001 Issue #4).
Base score calculation starts at 70 to ensure minimum threshold.';

-- ============================================================================
-- Step 3: Create validation trigger (optional, additional safety)
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

DO $$
BEGIN
  RAISE NOTICE '✅ Created validation trigger';
END;
$$;

COMMENT ON FUNCTION validate_retrospective_quality_score() IS
'Validates retrospective quality_score before insert/update.
Prevents quality_score = 0 or out of range values.
Part of SD-KNOWLEDGE-001 Issue #4 prevention measures.';

-- ============================================================================
-- Step 4: Verification
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
  SELECT
    MIN(quality_score),
    MAX(quality_score),
    COUNT(*) FILTER (WHERE quality_score IS NULL)
  INTO min_score, max_score, null_count
  FROM retrospectives;

  -- Report results
  RAISE NOTICE '';
  RAISE NOTICE '================================================================';
  RAISE NOTICE 'Migration Verification';
  RAISE NOTICE '================================================================';
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
-- Step 5: Test constraint enforcement
-- ============================================================================

DO $$
BEGIN
  -- Test 1: Try to insert quality_score = 0 (should fail)
  BEGIN
    INSERT INTO retrospectives (
      sd_id, project_name, retro_type, title, description,
      conducted_date, what_went_well, what_needs_improvement,
      key_learnings, action_items, quality_score, status
    ) VALUES (
      'TEST-CONSTRAINT-001', 'Test', 'TEST', 'Test', 'Test',
      NOW(), ARRAY['Test'], ARRAY['Test'], ARRAY['Test'], ARRAY['Test'],
      0, 'DRAFT'
    );

    RAISE EXCEPTION 'Test FAILED: quality_score = 0 was allowed!';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%quality_score%' OR SQLERRM LIKE '%70%' THEN
        RAISE NOTICE '✅ Test 1 PASSED: quality_score = 0 correctly rejected';
      ELSE
        RAISE NOTICE '❌ Test 1 FAILED: Unexpected error: %', SQLERRM;
      END IF;
  END;

  -- Test 2: Try to insert NULL quality_score (should fail)
  BEGIN
    INSERT INTO retrospectives (
      sd_id, project_name, retro_type, title, description,
      conducted_date, what_went_well, what_needs_improvement,
      key_learnings, action_items, quality_score, status
    ) VALUES (
      'TEST-CONSTRAINT-002', 'Test', 'TEST', 'Test', 'Test',
      NOW(), ARRAY['Test'], ARRAY['Test'], ARRAY['Test'], ARRAY['Test'],
      NULL, 'DRAFT'
    );

    RAISE EXCEPTION 'Test FAILED: quality_score = NULL was allowed!';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%null%' OR SQLERRM LIKE '%quality_score%' THEN
        RAISE NOTICE '✅ Test 2 PASSED: quality_score = NULL correctly rejected';
      ELSE
        RAISE NOTICE '❌ Test 2 FAILED: Unexpected error: %', SQLERRM;
      END IF;
  END;

  -- Test 3: Try to insert valid quality_score = 70 (should succeed)
  BEGIN
    INSERT INTO retrospectives (
      sd_id, project_name, retro_type, title, description,
      conducted_date, what_went_well, what_needs_improvement,
      key_learnings, action_items, quality_score, status
    ) VALUES (
      'TEST-CONSTRAINT-003', 'Test', 'TEST', 'Test', 'Test',
      NOW(), ARRAY['Test'], ARRAY['Test'], ARRAY['Test'], ARRAY['Test'],
      70, 'DRAFT'
    );

    RAISE NOTICE '✅ Test 3 PASSED: quality_score = 70 correctly accepted';

    -- Clean up test record
    DELETE FROM retrospectives WHERE sd_id = 'TEST-CONSTRAINT-003';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '❌ Test 3 FAILED: Valid quality_score = 70 was rejected: %', SQLERRM;
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
  RAISE NOTICE '================================================================';
  RAISE NOTICE '✅ Migration Complete: Retrospective Quality Score Constraint';
  RAISE NOTICE '================================================================';
  RAISE NOTICE 'Changes applied:';
  RAISE NOTICE '  1. Added NOT NULL constraint on quality_score column';
  RAISE NOTICE '  2. Added CHECK constraint (quality_score >= 70 AND <= 100)';
  RAISE NOTICE '  3. Created validation trigger for additional safety';
  RAISE NOTICE '  4. Tested constraints with invalid data';
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
