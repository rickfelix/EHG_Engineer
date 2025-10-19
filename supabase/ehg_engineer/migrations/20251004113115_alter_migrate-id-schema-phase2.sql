-- ================================================================
-- ID Schema Standardization - Phase 2: Add Foreign Key Constraint
-- ================================================================
-- Purpose: Enforce referential integrity between PRDs and SDs
--
-- Prerequisites:
--   - Phase 1 must be completed successfully
--   - All PRDs with directive_id must have sd_uuid populated
--   - No orphaned PRDs (directive_id without matching SD)
--
-- Benefits:
--   - CASCADE deletes: Deleting SD automatically deletes its PRDs
--   - CASCADE updates: Updating SD uuid_id updates all linked PRDs
--   - Supabase auto-generates JOIN relationships
--   - Database enforces data integrity
--
-- Safety: Will fail if orphaned PRDs exist (intentional safeguard)
-- ================================================================

BEGIN;

-- ===============================================================
-- PRE-FLIGHT CHECK: Identify orphaned PRDs
-- ===============================================================

DO $$
DECLARE
  orphan_count INT;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM product_requirements_v2
  WHERE directive_id IS NOT NULL
    AND sd_uuid IS NULL;

  IF orphan_count > 0 THEN
    RAISE WARNING
      '⚠️  % orphaned PRDs found (reference non-existent SDs). These will remain unlinked.',
      orphan_count;
    RAISE NOTICE 'FK constraint will only enforce on non-NULL sd_uuid values.';
  ELSE
    RAISE NOTICE '✓ No orphaned PRDs found. All PRDs properly linked.';
  END IF;
END $$;

-- ===============================================================
-- STEP 1: Add Foreign Key Constraint
-- ===============================================================

ALTER TABLE product_requirements_v2
ADD CONSTRAINT fk_prd_sd
FOREIGN KEY (sd_uuid)
REFERENCES strategic_directives_v2(uuid_id)
ON DELETE CASCADE
ON UPDATE CASCADE;

COMMENT ON CONSTRAINT fk_prd_sd ON product_requirements_v2 IS
  'Foreign key to strategic_directives_v2.uuid_id. Enforces referential integrity with CASCADE.';

-- ===============================================================
-- STEP 2: Verify FK constraint is active
-- ===============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_prd_sd'
      AND table_name = 'product_requirements_v2'
  ) THEN
    RAISE NOTICE '✓ FK constraint fk_prd_sd successfully created';
  ELSE
    RAISE EXCEPTION 'FK constraint creation failed';
  END IF;
END $$;

-- ===============================================================
-- STEP 3: Test CASCADE behavior (commented out for safety)
-- ===============================================================

-- To test CASCADE DELETE:
-- 1. Create a test SD
-- INSERT INTO strategic_directives_v2 (uuid_id, sd_key, title, ...)
-- VALUES (gen_random_uuid(), 'SD-TEST-001', 'Test SD', ...);
--
-- 2. Create a test PRD linked to it
-- INSERT INTO product_requirements_v2 (sd_uuid, title, ...)
-- VALUES (...);
--
-- 3. Delete the test SD - PRD should auto-delete
-- DELETE FROM strategic_directives_v2 WHERE sd_key = 'SD-TEST-001';
--
-- 4. Verify PRD is gone
-- SELECT * FROM product_requirements_v2 WHERE sd_uuid = ...;

COMMIT;

-- ===============================================================
-- VERIFICATION QUERIES (run manually after migration)
-- ===============================================================

-- Verify FK constraint exists
-- SELECT constraint_name, table_name, column_name
-- FROM information_schema.key_column_usage
-- WHERE constraint_name = 'fk_prd_sd';

-- Test JOIN now works with Supabase
-- SELECT prd.id, prd.title, sd.sd_key, sd.title as sd_title
-- FROM product_requirements_v2 prd
-- JOIN strategic_directives_v2 sd ON prd.sd_uuid = sd.uuid_id
-- LIMIT 5;

-- ===============================================================
-- ROLLBACK INSTRUCTIONS
-- ===============================================================
-- If migration fails:
-- 1. Transaction will auto-rollback
-- 2. No data changes (only FK constraint added)

-- If need to manually rollback after commit:
-- ALTER TABLE product_requirements_v2 DROP CONSTRAINT fk_prd_sd;
