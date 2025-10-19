-- ============================================================================
-- Add NOT NULL Constraint to product_requirements_v2.sd_uuid
-- Issue: Enforce sd_uuid requirement to prevent future NULL values
-- Prerequisites: All existing PRDs must have sd_uuid populated
-- Date: 2025-10-19
-- Related: SD-PRE-EXEC-ANALYSIS-001 Issue #1 (final step)
-- ============================================================================

DO $$
DECLARE
  null_count INTEGER;
  total_count INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🔒 ADDING NOT NULL CONSTRAINT TO sd_uuid';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE '';

  -- ========================================================================
  -- STEP 1: Pre-flight verification
  -- ========================================================================

  RAISE NOTICE 'Step 1: Verifying no NULL sd_uuid values exist...';

  SELECT COUNT(*) INTO total_count
  FROM product_requirements_v2;

  SELECT COUNT(*) INTO null_count
  FROM product_requirements_v2
  WHERE sd_uuid IS NULL;

  RAISE NOTICE '  Total PRDs in database: %', total_count;
  RAISE NOTICE '  PRDs with NULL sd_uuid: %', null_count;
  RAISE NOTICE '';

  IF null_count > 0 THEN
    RAISE EXCEPTION 'ABORT: Cannot add NOT NULL constraint. % PRDs still have NULL sd_uuid. Run cleanup migrations first.', null_count;
  END IF;

  -- ========================================================================
  -- STEP 2: Add NOT NULL constraint
  -- ========================================================================

  RAISE NOTICE 'Step 2: Adding NOT NULL constraint...';

  ALTER TABLE product_requirements_v2
    ALTER COLUMN sd_uuid SET NOT NULL;

  RAISE NOTICE '✅ NOT NULL constraint added successfully';
  RAISE NOTICE '';

  -- ========================================================================
  -- STEP 3: Verify constraint
  -- ========================================================================

  RAISE NOTICE 'Step 3: Verifying constraint...';

  -- Test inserting a PRD without sd_uuid (should fail)
  BEGIN
    INSERT INTO product_requirements_v2 (
      id,
      title,
      status
      -- sd_uuid intentionally omitted
    ) VALUES (
      'PRD-TEST-NULL-CONSTRAINT-001',
      'Test NULL Constraint',
      'draft'
    );

    -- If we reach here, constraint didn't work
    RAISE EXCEPTION 'CONSTRAINT FAILED: PRD inserted with NULL sd_uuid!';

  EXCEPTION
    WHEN not_null_violation THEN
      RAISE NOTICE '✅ NOT NULL constraint working correctly (prevented NULL insert)';
    WHEN OTHERS THEN
      RAISE;
  END;

  RAISE NOTICE '';

  -- ========================================================================
  -- STEP 4: Summary
  -- ========================================================================

  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE '🎉 NOT NULL CONSTRAINT SUCCESSFULLY ADDED';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '  - Total PRDs: %', total_count;
  RAISE NOTICE '  - PRDs with sd_uuid: % (100%%)', total_count;
  RAISE NOTICE '  - Constraint: ENFORCED ✓';
  RAISE NOTICE '';
  RAISE NOTICE 'Impact:';
  RAISE NOTICE '  ✅ All future PRD inserts MUST include sd_uuid';
  RAISE NOTICE '  ✅ Trigger auto-populates sd_uuid for PRD-SD-* pattern';
  RAISE NOTICE '  ✅ Manual sd_uuid required for other PRD patterns';
  RAISE NOTICE '  ✅ EXEC→PLAN handoffs no longer blocked by NULL sd_uuid';
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE '';

END $$;

-- ============================================================================
-- VERIFICATION QUERIES (run manually to check constraint)
-- ============================================================================

-- Check constraint exists
-- SELECT
--   conname as constraint_name,
--   contype as constraint_type,
--   pg_get_constraintdef(oid) as definition
-- FROM pg_constraint
-- WHERE conrelid = 'product_requirements_v2'::regclass
--   AND conname LIKE '%sd_uuid%';

-- Test constraint enforcement (should fail with not_null_violation)
-- INSERT INTO product_requirements_v2 (id, title, status)
-- VALUES ('PRD-TEST-NULL-001', 'Should Fail', 'draft');
-- Expected error: null value in column "sd_uuid" violates not-null constraint

-- ============================================================================
-- ROLLBACK INSTRUCTIONS (if needed)
-- ============================================================================

-- To remove the NOT NULL constraint:
-- ALTER TABLE product_requirements_v2 ALTER COLUMN sd_uuid DROP NOT NULL;
