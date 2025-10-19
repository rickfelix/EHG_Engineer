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
DECLARE
  sd_id TEXT;
  base_sd_id TEXT;
BEGIN
  -- Only auto-populate if sd_uuid is NULL and ID follows convention
  IF NEW.sd_uuid IS NULL AND NEW.id LIKE 'PRD-SD-%' THEN
    -- Extract SD ID from PRD ID (PRD-SD-XXX-YYY-ZZZ → SD-XXX-YYY-ZZZ)
    sd_id := REPLACE(NEW.id, 'PRD-', '');

    -- Try exact match first
    SELECT uuid_id INTO NEW.sd_uuid
    FROM strategic_directives_v2
    WHERE id = sd_id;

    -- If not found, try stripping timestamp suffix (e.g., SD-023-1758985645577 → SD-023)
    IF NEW.sd_uuid IS NULL THEN
      -- Extract base ID by removing trailing -TIMESTAMP pattern (13 digits)
      base_sd_id := REGEXP_REPLACE(sd_id, '-\d{13}$', '');

      -- Only try base lookup if we actually stripped something
      IF base_sd_id != sd_id THEN
        SELECT uuid_id INTO NEW.sd_uuid
        FROM strategic_directives_v2
        WHERE id = base_sd_id;

        IF NEW.sd_uuid IS NOT NULL THEN
          RAISE NOTICE 'Auto-populated sd_uuid for PRD % from base SD % (original: %)',
            NEW.id, base_sd_id, sd_id;
        END IF;
      END IF;
    ELSE
      RAISE NOTICE 'Auto-populated sd_uuid for PRD % from SD %', NEW.id, sd_id;
    END IF;

    -- If SD still not found, raise error (prevents orphaned PRDs)
    IF NEW.sd_uuid IS NULL THEN
      RAISE EXCEPTION 'Cannot create PRD: Strategic Directive % (or base ID %) not found in database. Create SD first.',
        sd_id, base_sd_id;
    END IF;
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
-- STEP 3: Add NOT NULL constraint (DEFERRED - see note below)
-- ============================================================================

-- NOTE: NOT NULL constraint is NOT added by this migration because:
-- 1. There are 24 PRDs with NULL sd_uuid across different naming patterns
-- 2. This trigger only auto-populates PRD-SD-* pattern (17 fixed by cleanup)
-- 3. Other patterns (PRD-RECONNECT-*, PRD-BOARD-*, UUIDs) require manual sd_uuid
-- 4. Cleanup of non-PRD-SD-* PRDs is deferred to future migration
--
-- To add constraint after cleanup:
-- ALTER TABLE product_requirements_v2 ALTER COLUMN sd_uuid SET NOT NULL;

-- Report current status
DO $$
DECLARE
  null_count_sd_pattern INTEGER;
  null_count_total INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count_sd_pattern
  FROM product_requirements_v2
  WHERE sd_uuid IS NULL AND id LIKE 'PRD-SD-%';

  SELECT COUNT(*) INTO null_count_total
  FROM product_requirements_v2
  WHERE sd_uuid IS NULL;

  RAISE NOTICE '📊 PRD sd_uuid Status Report:';
  RAISE NOTICE '   - PRD-SD-* pattern with NULL sd_uuid: %', null_count_sd_pattern;
  RAISE NOTICE '   - Total PRDs with NULL sd_uuid: %', null_count_total;
  RAISE NOTICE '   - Other patterns with NULL: %', (null_count_total - null_count_sd_pattern);
  RAISE NOTICE '';

  IF null_count_total > 0 THEN
    RAISE WARNING '⚠️  NOT NULL constraint NOT added (% PRDs with NULL sd_uuid)', null_count_total;
    RAISE WARNING '   Auto-population only works for PRD-SD-* pattern.';
    RAISE WARNING '   Other PRD patterns require manual sd_uuid assignment.';
  ELSE
    RAISE NOTICE '✅ All PRDs have sd_uuid! Safe to add NOT NULL constraint.';
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
    rationale,
    scope,
    sd_key,
    sequence_rank,
    progress_percentage,
    current_phase
  ) VALUES (
    test_sd_id,
    'Test Auto UUID Population',
    'Validation test for auto-population trigger',
    'testing',
    'low',
    'draft',
    'Testing auto-population of PRD sd_uuid field',
    'Test scope for validation',
    test_sd_id,
    9999,
    0,
    'LEAD'
  ) RETURNING uuid_id INTO test_sd_uuid;

  RAISE NOTICE '1. Created test SD: % (UUID: %)', test_sd_id, test_sd_uuid;

  -- Create test PRD WITHOUT sd_uuid (should auto-populate)
  INSERT INTO product_requirements_v2 (
    id,
    title,
    executive_summary,
    status
    -- sd_uuid intentionally omitted
  ) VALUES (
    test_prd_id,
    'Test PRD',
    'Should auto-populate sd_uuid',
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
      id, title, executive_summary, status
    ) VALUES (
      'PRD-SD-NONEXISTENT-001',
      'Should Fail',
      'SD does not exist',
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
