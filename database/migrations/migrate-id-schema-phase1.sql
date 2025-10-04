-- ================================================================
-- ID Schema Standardization - Phase 1: Add UUID Columns
-- ================================================================
-- Purpose: Fix inconsistent ID schema where some SDs use sd_key
--          as id, others use UUID. Standardize on UUID for all.
--
-- Impact:
--   - 159 SDs: 123 get new UUIDs, 36 keep existing
--   - 108 PRDs: 73 get properly linked via new sd_uuid column
--
-- Safety: Additive only - no data loss, backward compatible
-- ================================================================

BEGIN;

-- ===============================================================
-- STEP 1: Add uuid_id column to strategic_directives_v2
-- ===============================================================
ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid() NOT NULL;

-- Create unique index for performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_sd_uuid_id
ON strategic_directives_v2(uuid_id);

COMMENT ON COLUMN strategic_directives_v2.uuid_id IS
  'Standardized UUID primary key. Use this for all new FK relationships.';

-- ===============================================================
-- STEP 2: Populate uuid_id for existing records
-- ===============================================================

-- For SDs that already use UUID format in id column, preserve it
UPDATE strategic_directives_v2
SET uuid_id = id::uuid
WHERE id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND uuid_id != id::uuid;  -- Only update if different

-- For SDs using sd_key format in id column, generate new UUID
-- (uuid_id already has default value from column definition)

-- ===============================================================
-- STEP 3: Add sd_uuid column to product_requirements_v2
-- ===============================================================
ALTER TABLE product_requirements_v2
ADD COLUMN IF NOT EXISTS sd_uuid UUID;

-- Create index for JOIN performance
CREATE INDEX IF NOT EXISTS idx_prd_sd_uuid
ON product_requirements_v2(sd_uuid);

COMMENT ON COLUMN product_requirements_v2.sd_uuid IS
  'Foreign key to strategic_directives_v2.uuid_id. Use this for all queries.';

-- ===============================================================
-- STEP 4: Link PRDs to SDs via sd_key lookup
-- ===============================================================

-- Link PRDs that use sd_key in directive_id
UPDATE product_requirements_v2 prd
SET sd_uuid = sd.uuid_id
FROM strategic_directives_v2 sd
WHERE prd.directive_id = sd.sd_key
  AND prd.sd_uuid IS NULL  -- Only update if not already set
  AND prd.directive_id IS NOT NULL;

-- Link PRDs that use UUID in directive_id
UPDATE product_requirements_v2 prd
SET sd_uuid = sd.uuid_id
FROM strategic_directives_v2 sd
WHERE prd.directive_id = sd.id
  AND prd.sd_uuid IS NULL
  AND prd.directive_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- ===============================================================
-- STEP 5: Mark old columns as deprecated
-- ===============================================================
COMMENT ON COLUMN product_requirements_v2.directive_id IS
  'DEPRECATED: Use sd_uuid instead. Kept for backward compatibility during migration.';

-- ===============================================================
-- VERIFICATION QUERIES (commented out - run manually after migration)
-- ===============================================================

-- Verify all SDs have uuid_id
-- SELECT COUNT(*) as total_sds,
--        COUNT(uuid_id) as sds_with_uuid
-- FROM strategic_directives_v2;

-- Verify PRD linkage
-- SELECT COUNT(*) as total_prds,
--        COUNT(sd_uuid) as prds_with_uuid_link,
--        COUNT(directive_id) as prds_with_old_link
-- FROM product_requirements_v2;

-- Find orphaned PRDs (directive_id set but no sd_uuid)
-- SELECT id, title, directive_id
-- FROM product_requirements_v2
-- WHERE directive_id IS NOT NULL
--   AND sd_uuid IS NULL;

COMMIT;

-- ===============================================================
-- ROLLBACK INSTRUCTIONS
-- ===============================================================
-- If migration fails:
-- 1. Transaction will auto-rollback
-- 2. No data loss (all changes are additive)
-- 3. Can safely re-run this script

-- If need to manually rollback after commit:
-- ALTER TABLE strategic_directives_v2 DROP COLUMN uuid_id;
-- ALTER TABLE product_requirements_v2 DROP COLUMN sd_uuid;
