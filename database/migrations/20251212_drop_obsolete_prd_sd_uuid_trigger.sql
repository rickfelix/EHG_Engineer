-- ============================================================================
-- Migration: Drop Obsolete PRD sd_uuid Auto-Population Trigger
-- Date: 2025-12-12
-- Related: SD-VISION-TRANSITION-001
-- ============================================================================
--
-- ROOT CAUSE: Trigger references NEW.sd_uuid column which no longer exists
-- Context: Migration 20251212_standardize_prd_sd_reference.sql renamed
--          sd_uuid → sd_id and changed type from UUID to VARCHAR
--
-- WHY DROP (not update):
-- 1. Validator now REQUIRES sd_id (lib/prd-schema-validator.js line 36)
-- 2. Auto-population was for when sd_uuid was optional - no longer needed
-- 3. Application code validates sd_id presence before INSERT
-- 4. Trigger would fail anyway (column doesn't exist)
--
-- SAFETY: This is a safe operation - trigger is already non-functional
-- ============================================================================

-- ============================================================================
-- Step 1: Drop the trigger
-- ============================================================================
DROP TRIGGER IF EXISTS trigger_auto_populate_prd_sd_uuid ON product_requirements_v2;

-- ============================================================================
-- Step 2: Drop the function
-- ============================================================================
DROP FUNCTION IF EXISTS auto_populate_prd_sd_uuid();

-- ============================================================================
-- Step 3: Verification and Summary
-- ============================================================================
DO $$
DECLARE
  trigger_count INTEGER;
  function_count INTEGER;
BEGIN
  -- Check triggers
  SELECT COUNT(*) INTO trigger_count
  FROM information_schema.triggers
  WHERE event_object_table = 'product_requirements_v2'
  AND trigger_name = 'trigger_auto_populate_prd_sd_uuid';

  -- Check functions
  SELECT COUNT(*) INTO function_count
  FROM pg_proc
  WHERE proname = 'auto_populate_prd_sd_uuid';

  IF trigger_count = 0 AND function_count = 0 THEN
    RAISE NOTICE '✅ Verification passed: Trigger and function successfully removed';
  ELSE
    RAISE EXCEPTION '❌ Verification failed: trigger_count=%, function_count=%',
      trigger_count, function_count;
  END IF;

  -- Summary
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Obsolete Trigger Cleanup Complete';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Removed:';
  RAISE NOTICE '  - trigger_auto_populate_prd_sd_uuid (INSERT/UPDATE)';
  RAISE NOTICE '  - auto_populate_prd_sd_uuid() function';
  RAISE NOTICE '';
  RAISE NOTICE 'Reason:';
  RAISE NOTICE '  - Column sd_uuid no longer exists (renamed to sd_id)';
  RAISE NOTICE '  - Validator now requires sd_id (not optional)';
  RAISE NOTICE '  - Auto-population no longer needed';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  - Validator enforces sd_id presence at application layer';
  RAISE NOTICE '  - FK constraint ensures referential integrity';
  RAISE NOTICE '============================================================';
END $$;
