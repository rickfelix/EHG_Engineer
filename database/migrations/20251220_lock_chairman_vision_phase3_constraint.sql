-- File: database/migrations/20251220_lock_chairman_vision_phase3_constraint.sql
-- SD: IDEATION-GENESIS-AUDIT - Priority 2: Lock the Vision
-- Date: 2025-12-20
-- Purpose: Add NOT NULL constraint to problem_statement
-- Phase: 3 of 3 (Constraint enforcement)
-- PREREQUISITE: Phase 2 cleanup must be run first!

DO $$
DECLARE
  null_count INTEGER;
  empty_count INTEGER;
  total_count INTEGER;
  constraint_exists BOOLEAN;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '===============================================================';
  RAISE NOTICE 'Phase 3: Add NOT NULL constraint to problem_statement';
  RAISE NOTICE '===============================================================';
  RAISE NOTICE '';

  -- STEP 1: Pre-flight verification (CRITICAL)
  RAISE NOTICE 'Step 1: Pre-flight verification...';
  RAISE NOTICE '';

  SELECT COUNT(*) INTO total_count FROM public.ventures;
  SELECT COUNT(*) INTO null_count FROM public.ventures WHERE problem_statement IS NULL;
  SELECT COUNT(*) INTO empty_count FROM public.ventures WHERE TRIM(problem_statement) = '';

  RAISE NOTICE '  Total ventures: %', total_count;
  RAISE NOTICE '  NULL problem_statement: %', null_count;
  RAISE NOTICE '  Empty problem_statement: %', empty_count;
  RAISE NOTICE '';

  IF null_count > 0 THEN
    RAISE EXCEPTION 'ABORT: Cannot add NOT NULL constraint. % ventures still have NULL problem_statement. Run Phase 2 cleanup first.', null_count;
  END IF;

  RAISE NOTICE '  [OK] No NULL values found';
  RAISE NOTICE '';

  -- STEP 2: Check if constraint already exists
  RAISE NOTICE 'Step 2: Checking existing constraints...';

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'ventures'
    AND column_name = 'problem_statement'
    AND is_nullable = 'NO'
  ) INTO constraint_exists;

  IF constraint_exists THEN
    RAISE NOTICE '  [=] NOT NULL constraint already exists on problem_statement';
    RAISE NOTICE '';
    RAISE NOTICE '===============================================================';
    RAISE NOTICE 'Phase 3 skipped - constraint already in place';
    RAISE NOTICE '===============================================================';
    RETURN;
  END IF;

  RAISE NOTICE '  [.] Constraint does not exist yet, proceeding...';
  RAISE NOTICE '';

  -- STEP 3: Add NOT NULL constraint
  RAISE NOTICE 'Step 3: Adding NOT NULL constraint...';

  ALTER TABLE public.ventures
    ALTER COLUMN problem_statement SET NOT NULL;

  RAISE NOTICE '  [+] NOT NULL constraint added successfully';
  RAISE NOTICE '';

  -- STEP 4: Verify constraint works
  RAISE NOTICE 'Step 4: Verifying constraint enforcement...';

  BEGIN
    -- This should fail with not_null_violation
    INSERT INTO public.ventures (
      id,
      name,
      status
      -- problem_statement intentionally omitted
    ) VALUES (
      gen_random_uuid(),
      '__TEST_NULL_CONSTRAINT_VERIFICATION__',
      'active'
    );

    -- If we get here, constraint failed
    DELETE FROM public.ventures WHERE name = '__TEST_NULL_CONSTRAINT_VERIFICATION__';
    RAISE EXCEPTION 'CONSTRAINT VERIFICATION FAILED: Venture inserted with NULL problem_statement!';

  EXCEPTION
    WHEN not_null_violation THEN
      RAISE NOTICE '  [OK] NOT NULL constraint working correctly (prevented NULL insert)';
    WHEN OTHERS THEN
      -- Clean up test row if it exists
      DELETE FROM public.ventures WHERE name = '__TEST_NULL_CONSTRAINT_VERIFICATION__';
      RAISE;
  END;

  RAISE NOTICE '';
  RAISE NOTICE '---------------------------------------------------------------';
  RAISE NOTICE 'Phase 3 Complete - Vision Lock ACTIVE';
  RAISE NOTICE '---------------------------------------------------------------';
  RAISE NOTICE '';
  RAISE NOTICE 'Summary:';
  RAISE NOTICE '  Total ventures: %', total_count;
  RAISE NOTICE '  All have problem_statement: YES';
  RAISE NOTICE '  NOT NULL constraint: ENFORCED';
  RAISE NOTICE '';
  RAISE NOTICE 'Impact:';
  RAISE NOTICE '  - All future venture creations MUST include problem_statement';
  RAISE NOTICE '  - Stage 0 ideation now requires Chairman vision capture';
  RAISE NOTICE '  - raw_chairman_intent preserves immutable original';
  RAISE NOTICE '';
  RAISE NOTICE '===============================================================';
  RAISE NOTICE 'VISION LOCK COMPLETE';
  RAISE NOTICE '===============================================================';
  RAISE NOTICE '';

END $$;
