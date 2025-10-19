-- ============================================================================
-- Fix PRD sd_uuid Auto-Population
-- Issue: PRDs created with sd_uuid = NULL, blocking EXEC→PLAN handoffs
-- Root Cause: No automatic population of sd_uuid when PRD created
-- Fix: Add trigger + backfill + constraint
-- Date: 2025-10-19
-- Related: SD-PRE-EXEC-ANALYSIS-001 Issue #1
-- ============================================================================

-- ============================================================================
-- STEP 1: Create auto-population trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_populate_prd_sd_uuid()
RETURNS TRIGGER AS $$
BEGIN
  -- Only auto-populate if sd_uuid is NULL and ID follows convention
  IF NEW.sd_uuid IS NULL AND NEW.id LIKE 'PRD-SD-%' THEN
    -- Extract SD ID from PRD ID (PRD-SD-XXX-YYY-ZZZ → SD-XXX-YYY-ZZZ)
    DECLARE
      sd_id TEXT;
    BEGIN
      sd_id := REPLACE(NEW.id, 'PRD-', '');

      -- Look up SD UUID
      SELECT uuid_id INTO NEW.sd_uuid
      FROM strategic_directives_v2
      WHERE id = sd_id;

      -- If SD not found, raise error (prevents orphaned PRDs)
      IF NEW.sd_uuid IS NULL THEN
        RAISE EXCEPTION 'Cannot create PRD: Strategic Directive % not found in database. Create SD first.', sd_id;
      END IF;

      RAISE NOTICE 'Auto-populated sd_uuid for PRD % from SD %', NEW.id, sd_id;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on INSERT and UPDATE
DROP TRIGGER IF EXISTS trigger_auto_populate_prd_sd_uuid ON product_requirements_v2;
CREATE TRIGGER trigger_auto_populate_prd_sd_uuid
  BEFORE INSERT OR UPDATE ON product_requirements_v2
  FOR EACH ROW
  EXECUTE FUNCTION auto_populate_prd_sd_uuid();

COMMENT ON FUNCTION auto_populate_prd_sd_uuid IS
  'Auto-populates sd_uuid from SD ID when PRD created. Prevents NULL sd_uuid blocking handoffs.';

-- ============================================================================
-- STEP 2: Backfill existing NULL values
-- ============================================================================

DO $$
DECLARE
  updated_count INTEGER;
  orphaned_count INTEGER;
  prd_record RECORD;
BEGIN
  RAISE NOTICE 'Backfilling NULL sd_uuid values...';

  -- Update PRDs that follow naming convention and have matching SD
  UPDATE product_requirements_v2 prd
  SET sd_uuid = sd.uuid_id
  FROM strategic_directives_v2 sd
  WHERE prd.sd_uuid IS NULL
    AND prd.id LIKE 'PRD-SD-%'
    AND prd.id = 'PRD-' || sd.id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE '✅ Backfilled % PRDs with sd_uuid', updated_count;

  -- Check for orphaned PRDs (no matching SD)
  SELECT COUNT(*) INTO orphaned_count
  FROM product_requirements_v2
  WHERE sd_uuid IS NULL
    AND id LIKE 'PRD-SD-%';

  IF orphaned_count > 0 THEN
    RAISE WARNING '⚠️  Found % orphaned PRDs (no matching SD). These need manual review:', orphaned_count;

    -- Log orphaned PRDs
    FOR prd_record IN
      SELECT id FROM product_requirements_v2
      WHERE sd_uuid IS NULL AND id LIKE 'PRD-SD-%'
      LIMIT 10
    LOOP
      RAISE WARNING '   - %', prd_record.id;
    END LOOP;
  END IF;
END $$;

-- ============================================================================
-- STEP 3: Add NOT NULL constraint (with grace period)
-- ============================================================================

-- Check if any NULL sd_uuid remain (excluding non-convention PRDs)
DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM product_requirements_v2
  WHERE sd_uuid IS NULL
    AND id LIKE 'PRD-SD-%';

  IF null_count = 0 THEN
    -- Safe to add constraint
    ALTER TABLE product_requirements_v2
      ALTER COLUMN sd_uuid SET NOT NULL;

    RAISE NOTICE '✅ Added NOT NULL constraint to sd_uuid (0 violations)';
  ELSE
    RAISE WARNING '⚠️  Cannot add NOT NULL constraint: % PRDs still have NULL sd_uuid', null_count;
    RAISE WARNING '   Fix orphaned PRDs manually, then run:';
    RAISE WARNING '   ALTER TABLE product_requirements_v2 ALTER COLUMN sd_uuid SET NOT NULL;';
  END IF;
END $$;

-- ============================================================================
-- STEP 4: Add helpful index for sd_uuid lookups
-- ============================================================================

-- Check if index already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'product_requirements_v2'
    AND indexname = 'idx_product_requirements_sd_uuid'
  ) THEN
    CREATE INDEX idx_product_requirements_sd_uuid
      ON product_requirements_v2(sd_uuid);

    RAISE NOTICE '✅ Created index on sd_uuid for faster lookups';
  ELSE
    RAISE NOTICE 'ℹ️  Index idx_product_requirements_sd_uuid already exists';
  END IF;
END $$;

-- ============================================================================
-- STEP 5: Validation test
-- ============================================================================

DO $$
DECLARE
  test_sd_id TEXT := 'SD-TEST-AUTO-UUID-001';
  test_prd_id TEXT := 'PRD-SD-TEST-AUTO-UUID-001';
  test_sd_uuid UUID;
  test_prd RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🧪 VALIDATION TEST';
  RAISE NOTICE '══════════════════════════════════════════════════════════';

  -- Clean up any previous test data
  DELETE FROM product_requirements_v2 WHERE id = test_prd_id;
  DELETE FROM strategic_directives_v2 WHERE id = test_sd_id;

  -- Create test SD
  INSERT INTO strategic_directives_v2 (
    id,
    title,
    description,
    category,
    priority,
    status,
    rationale
  ) VALUES (
    test_sd_id,
    'Test Auto UUID Population',
    'Validation test for auto-population trigger',
    'testing',
    'low',
    'draft',
    'Testing auto-population of PRD sd_uuid field'
  ) RETURNING uuid_id INTO test_sd_uuid;

  RAISE NOTICE '1. Created test SD: % (UUID: %)', test_sd_id, test_sd_uuid;

  -- Create test PRD WITHOUT sd_uuid (should auto-populate)
  INSERT INTO product_requirements_v2 (
    id,
    title,
    description,
    category,
    status
    -- sd_uuid intentionally omitted
  ) VALUES (
    test_prd_id,
    'Test PRD',
    'Should auto-populate sd_uuid',
    'feature',
    'draft'
  ) RETURNING * INTO test_prd;

  RAISE NOTICE '2. Created test PRD: %', test_prd_id;

  -- Verify auto-population worked
  IF test_prd.sd_uuid = test_sd_uuid THEN
    RAISE NOTICE '✅ SUCCESS: sd_uuid auto-populated correctly';
    RAISE NOTICE '   Expected: %', test_sd_uuid;
    RAISE NOTICE '   Actual:   %', test_prd.sd_uuid;
  ELSE
    RAISE EXCEPTION '❌ FAILED: sd_uuid not populated. Expected %, got %',
      test_sd_uuid, test_prd.sd_uuid;
  END IF;

  -- Test error handling (PRD for non-existent SD)
  BEGIN
    INSERT INTO product_requirements_v2 (
      id, title, description, category, status
    ) VALUES (
      'PRD-SD-NONEXISTENT-001',
      'Should Fail',
      'SD does not exist',
      'feature',
      'draft'
    );

    RAISE EXCEPTION '❌ FAILED: Should have thrown error for non-existent SD';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%Strategic Directive%not found%' THEN
        RAISE NOTICE '✅ SUCCESS: Correctly rejected PRD for non-existent SD';
      ELSE
        RAISE;
      END IF;
  END;

  -- Clean up test data
  DELETE FROM product_requirements_v2 WHERE id = test_prd_id;
  DELETE FROM strategic_directives_v2 WHERE id = test_sd_id;

  RAISE NOTICE '';
  RAISE NOTICE '🎉 ALL VALIDATION TESTS PASSED';
  RAISE NOTICE '══════════════════════════════════════════════════════════';
  RAISE NOTICE '';

EXCEPTION
  WHEN OTHERS THEN
    -- Clean up on error
    DELETE FROM product_requirements_v2 WHERE id = test_prd_id;
    DELETE FROM strategic_directives_v2 WHERE id = test_sd_id;
    RAISE;
END $$;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS (if needed)
-- ============================================================================

-- To rollback this migration:
-- DROP TRIGGER IF EXISTS trigger_auto_populate_prd_sd_uuid ON product_requirements_v2;
-- DROP FUNCTION IF EXISTS auto_populate_prd_sd_uuid();
-- ALTER TABLE product_requirements_v2 ALTER COLUMN sd_uuid DROP NOT NULL;
-- DROP INDEX IF EXISTS idx_product_requirements_sd_uuid;
