-- ============================================================================
-- Migration: Standardize PRD → SD Reference on id (not uuid_id)
-- Date: 2025-12-12
-- ============================================================================
--
-- ROOT CAUSE ANALYSIS (5 Whys - Systemic SD ID Confusion):
--
-- Why #1: Handoff executors use `sd.uuid_id || sd.id` fallback pattern
-- Why #2: PRD.sd_uuid contains values from SD.uuid_id column
-- Why #3: The uuid_id column contains DIFFERENT UUIDs than id for 91% of SDs
-- Why #4: Legacy migration populated uuid_id with new UUIDs instead of copying id
-- Why #5: No single canonical identifier - code inconsistently uses both columns
--
-- FIX: Standardize on strategic_directives_v2.id as THE canonical identifier
--      Migrate PRD.sd_uuid to contain SD.id values instead of SD.uuid_id values
--
-- APPROACH: Since sd_uuid is UUID type but SD.id contains VARCHAR values like
--           "SD-050", we must change the column type via add→populate→drop→rename
--
-- ============================================================================

BEGIN;

-- ============================================================================
-- Step 1: Add new VARCHAR column to hold SD.id references
-- ============================================================================
ALTER TABLE product_requirements_v2
ADD COLUMN IF NOT EXISTS sd_ref VARCHAR(50);

RAISE NOTICE 'Step 1: Added sd_ref column (VARCHAR)';

-- ============================================================================
-- Step 2: Populate sd_ref with SD.id values (translated from uuid_id)
-- ============================================================================
UPDATE product_requirements_v2 prd
SET sd_ref = sd.id
FROM strategic_directives_v2 sd
WHERE prd.sd_uuid = sd.uuid_id;

RAISE NOTICE 'Step 2: Populated sd_ref from uuid_id → id translation';

-- ============================================================================
-- Step 3: Also handle PRDs where sd_uuid might already contain SD.id
-- (For any records that were created correctly)
-- ============================================================================
UPDATE product_requirements_v2 prd
SET sd_ref = sd.id
FROM strategic_directives_v2 sd
WHERE prd.sd_ref IS NULL
  AND prd.sd_uuid::text = sd.id;

RAISE NOTICE 'Step 3: Handled PRDs with sd_uuid already containing SD.id';

-- ============================================================================
-- Step 4: For any remaining PRDs, try directive_id fallback
-- ============================================================================
UPDATE product_requirements_v2 prd
SET sd_ref = sd.id
FROM strategic_directives_v2 sd
WHERE prd.sd_ref IS NULL
  AND prd.directive_id = sd.id;

RAISE NOTICE 'Step 4: Handled PRDs via directive_id fallback';

-- ============================================================================
-- Step 5: Also try directive_id matching legacy_id
-- ============================================================================
UPDATE product_requirements_v2 prd
SET sd_ref = sd.id
FROM strategic_directives_v2 sd
WHERE prd.sd_ref IS NULL
  AND prd.directive_id = sd.legacy_id;

RAISE NOTICE 'Step 5: Handled PRDs via directive_id → legacy_id fallback';

-- ============================================================================
-- Step 6: Verify all PRDs with sd_uuid have sd_ref populated
-- ============================================================================
DO $$
DECLARE
  orphan_count INTEGER;
  total_prds INTEGER;
  migrated_prds INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_prds FROM product_requirements_v2;

  SELECT COUNT(*) INTO migrated_prds
  FROM product_requirements_v2
  WHERE sd_ref IS NOT NULL;

  SELECT COUNT(*) INTO orphan_count
  FROM product_requirements_v2
  WHERE sd_uuid IS NOT NULL AND sd_ref IS NULL;

  RAISE NOTICE 'Migration Stats: % total PRDs, % migrated, % orphans',
    total_prds, migrated_prds, orphan_count;

  IF orphan_count > 0 THEN
    -- Log the orphan PRDs for debugging
    RAISE WARNING 'Orphan PRDs (sd_uuid set but no matching SD):';
    FOR rec IN
      SELECT id, sd_uuid, directive_id
      FROM product_requirements_v2
      WHERE sd_uuid IS NOT NULL AND sd_ref IS NULL
      LIMIT 10
    LOOP
      RAISE WARNING '  PRD: %, sd_uuid: %, directive_id: %',
        rec.id, rec.sd_uuid, rec.directive_id;
    END LOOP;

    -- Don't fail - just warn (we may have orphan PRDs from deleted SDs)
    RAISE WARNING 'Found % PRDs with sd_uuid but no matching SD - these may be orphaned', orphan_count;
  END IF;
END $$;

-- ============================================================================
-- Step 7: Drop old sd_uuid column
-- ============================================================================
ALTER TABLE product_requirements_v2 DROP COLUMN IF EXISTS sd_uuid;

RAISE NOTICE 'Step 7: Dropped old sd_uuid column';

-- ============================================================================
-- Step 8: Rename sd_ref to sd_id
-- ============================================================================
-- First check if sd_id column already exists (from previous run or schema)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_requirements_v2'
    AND column_name = 'sd_id'
  ) THEN
    -- sd_id already exists, drop it first (it has wrong data)
    ALTER TABLE product_requirements_v2 DROP COLUMN sd_id;
    RAISE NOTICE 'Dropped existing sd_id column (had wrong data)';
  END IF;
END $$;

ALTER TABLE product_requirements_v2 RENAME COLUMN sd_ref TO sd_id;

RAISE NOTICE 'Step 8: Renamed sd_ref → sd_id';

-- ============================================================================
-- Step 9: Create index for performance
-- ============================================================================
DROP INDEX IF EXISTS idx_prd_sd_id;
CREATE INDEX idx_prd_sd_id ON product_requirements_v2(sd_id);

RAISE NOTICE 'Step 9: Created index on sd_id';

-- ============================================================================
-- Step 10: Add FK constraint (validates referential integrity)
-- Note: Using ON DELETE SET NULL since PRDs may outlive their SDs
-- ============================================================================
-- First drop if exists (from previous run)
ALTER TABLE product_requirements_v2
DROP CONSTRAINT IF EXISTS fk_prd_sd_id;

ALTER TABLE product_requirements_v2
ADD CONSTRAINT fk_prd_sd_id
FOREIGN KEY (sd_id) REFERENCES strategic_directives_v2(id)
ON DELETE SET NULL ON UPDATE CASCADE;

RAISE NOTICE 'Step 10: Added FK constraint fk_prd_sd_id';

-- ============================================================================
-- Step 11: Update column comment
-- ============================================================================
COMMENT ON COLUMN product_requirements_v2.sd_id IS
'Foreign key to strategic_directives_v2.id. Canonical SD reference.
Migrated from sd_uuid (2025-12-12) - now uses SD.id instead of SD.uuid_id.
Part of systemic cleanup to standardize on id as canonical SD identifier.';

RAISE NOTICE 'Step 11: Added column documentation';

COMMIT;

-- ============================================================================
-- VALIDATION QUERIES (run after migration)
-- ============================================================================
-- Verify migration success:
-- SELECT COUNT(*) as total_prds FROM product_requirements_v2;
-- SELECT COUNT(*) as prds_with_sd_id FROM product_requirements_v2 WHERE sd_id IS NOT NULL;
--
-- Verify FK constraint works:
-- SELECT prd.id, prd.sd_id, sd.title
-- FROM product_requirements_v2 prd
-- JOIN strategic_directives_v2 sd ON prd.sd_id = sd.id
-- LIMIT 5;
--
-- Check for orphaned PRDs:
-- SELECT id, directive_id FROM product_requirements_v2 WHERE sd_id IS NULL;
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'PRD SD Reference Migration Complete';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes made:';
  RAISE NOTICE '  - sd_uuid (UUID) column DROPPED';
  RAISE NOTICE '  - sd_id (VARCHAR) column ADDED with SD.id values';
  RAISE NOTICE '  - FK constraint fk_prd_sd_id ADDED';
  RAISE NOTICE '  - Index idx_prd_sd_id CREATED';
  RAISE NOTICE '';
  RAISE NOTICE 'Code updates required:';
  RAISE NOTICE '  - PRDRepository.js: Query sd_id instead of sd_uuid';
  RAISE NOTICE '  - All executors: Use sd.id instead of sd.uuid_id || sd.id';
  RAISE NOTICE '============================================================';
END $$;
