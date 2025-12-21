-- File: database/migrations/20251220_lock_chairman_vision_phase2_cleanup.sql
-- SD: IDEATION-GENESIS-AUDIT - Priority 2: Lock the Vision
-- Date: 2025-12-20
-- Purpose: Populate problem_statement for ventures that lack it
-- Phase: 2 of 3 (Data cleanup before constraint)

DO $$
DECLARE
  null_count INTEGER;
  empty_count INTEGER;
  updated_count INTEGER;
  total_count INTEGER;
  r RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '===============================================================';
  RAISE NOTICE 'Phase 2: Clean NULL/empty problem_statement values';
  RAISE NOTICE '===============================================================';
  RAISE NOTICE '';

  -- Count current state
  SELECT COUNT(*) INTO total_count FROM public.ventures;
  SELECT COUNT(*) INTO null_count FROM public.ventures WHERE problem_statement IS NULL;
  SELECT COUNT(*) INTO empty_count FROM public.ventures WHERE problem_statement = '' OR problem_statement IS NULL;

  RAISE NOTICE 'Current State:';
  RAISE NOTICE '  Total ventures: %', total_count;
  RAISE NOTICE '  NULL problem_statement: %', null_count;
  RAISE NOTICE '  Empty/NULL problem_statement: %', empty_count;
  RAISE NOTICE '';

  IF empty_count = 0 THEN
    RAISE NOTICE '[OK] No cleanup needed - all ventures have problem_statement';
  ELSE
    RAISE NOTICE 'Cleanup Strategy:';
    RAISE NOTICE '  1. Use description if available';
    RAISE NOTICE '  2. Use value_proposition if description is empty';
    RAISE NOTICE '  3. Use placeholder if no fallback available';
    RAISE NOTICE '';

    -- Strategy: Use description or value_proposition as fallback
    -- Also copy to raw_chairman_intent to preserve the original
    UPDATE public.ventures
    SET
      problem_statement = COALESCE(
        NULLIF(TRIM(problem_statement), ''),
        NULLIF(TRIM(description), ''),
        NULLIF(TRIM(value_proposition), ''),
        '[Problem statement pending Chairman review - venture created before vision lock]'
      ),
      raw_chairman_intent = COALESCE(
        raw_chairman_intent,
        NULLIF(TRIM(problem_statement), ''),
        NULLIF(TRIM(description), ''),
        NULLIF(TRIM(value_proposition), ''),
        '[Original intent not captured - pre-migration venture]'
      ),
      problem_statement_locked_at = COALESCE(
        problem_statement_locked_at,
        created_at  -- Use creation date as lock date for legacy ventures
      )
    WHERE problem_statement IS NULL OR TRIM(problem_statement) = '';

    GET DIAGNOSTICS updated_count = ROW_COUNT;

    RAISE NOTICE '[+] Updated % ventures with fallback values', updated_count;
    RAISE NOTICE '';
  END IF;

  -- Verify results
  SELECT COUNT(*) INTO null_count FROM public.ventures WHERE problem_statement IS NULL;
  SELECT COUNT(*) INTO empty_count FROM public.ventures WHERE TRIM(problem_statement) = '';

  RAISE NOTICE '---------------------------------------------------------------';
  RAISE NOTICE 'Post-Cleanup Verification';
  RAISE NOTICE '---------------------------------------------------------------';
  RAISE NOTICE '  NULL problem_statement remaining: %', null_count;
  RAISE NOTICE '  Empty problem_statement remaining: %', empty_count;
  RAISE NOTICE '';

  IF null_count > 0 OR empty_count > 0 THEN
    RAISE WARNING 'WARNING: % ventures still need problem_statement cleanup', null_count + empty_count;
    RAISE NOTICE '';
    RAISE NOTICE 'These ventures may need manual review:';

    -- Log problematic ventures for review
    FOR r IN (
      SELECT id, name, created_at
      FROM public.ventures
      WHERE problem_statement IS NULL OR TRIM(problem_statement) = ''
      LIMIT 10
    ) LOOP
      RAISE NOTICE '  - % (ID: %)', r.name, r.id;
    END LOOP;

    RAISE NOTICE '';
  ELSE
    RAISE NOTICE '[OK] All ventures have populated problem_statement';
    RAISE NOTICE '';
    RAISE NOTICE 'Ready for Phase 3: Add NOT NULL constraint';
  END IF;

  RAISE NOTICE '===============================================================';
  RAISE NOTICE '';

END $$;
