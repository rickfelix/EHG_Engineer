-- ============================================================================
-- Migration: Remove uuid_id Column from strategic_directives_v2
-- Date: 2025-12-17
-- SD: SD-FOUNDATION-V3-001 (Data Integrity & Schema Remediation)
-- US: US-004 - Create uuid_id Removal Migration with Rollback
-- ============================================================================
--
-- BACKGROUND:
-- The uuid_id column was created during a legacy migration and contains UUIDs
-- that are DIFFERENT from the id primary key for 91% of records. This caused
-- systemic confusion in FK relationships. After extensive audit and cleanup:
--
-- - PRD template fixed (2025-12-17)
-- - SD creation scripts fixed (2025-12-17)
-- - Test files updated (2025-12-17)
-- - product_requirements_v2.sd_uuid column already DROPPED (2025-12-12)
-- - product_requirements_v2.sd_id is now the canonical FK
--
-- This migration removes the deprecated uuid_id column from strategic_directives_v2.
--
-- ============================================================================
-- PRE-REQUISITES (verify before running):
-- 1. All code references to uuid_id have been removed or updated
-- 2. No active database queries use uuid_id
-- 3. Database backup has been taken
-- ============================================================================

-- ============================================================================
-- SECTION 1: PRE-FLIGHT VALIDATION
-- ============================================================================

DO $$
DECLARE
  uuid_id_exists BOOLEAN;
  active_references INTEGER;
  sd_count INTEGER;
BEGIN
  -- Check if uuid_id column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'strategic_directives_v2'
    AND column_name = 'uuid_id'
  ) INTO uuid_id_exists;

  IF NOT uuid_id_exists THEN
    RAISE NOTICE 'uuid_id column does not exist. Migration already complete.';
    RETURN;
  END IF;

  -- Count SDs with uuid_id values
  SELECT COUNT(*) INTO sd_count
  FROM strategic_directives_v2 WHERE uuid_id IS NOT NULL;

  RAISE NOTICE '=== Pre-Flight Validation ===';
  RAISE NOTICE 'uuid_id column exists: %', uuid_id_exists;
  RAISE NOTICE 'SDs with uuid_id values: %', sd_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Proceeding with migration...';
END $$;

-- ============================================================================
-- SECTION 2: CREATE BACKUP TABLE FOR ROLLBACK
-- ============================================================================

-- Create backup table to preserve uuid_id values for potential rollback
DROP TABLE IF EXISTS _backup_strategic_directives_uuid_id;

CREATE TABLE _backup_strategic_directives_uuid_id AS
SELECT
  id,
  uuid_id,
  NOW() AS backup_timestamp
FROM strategic_directives_v2
WHERE uuid_id IS NOT NULL;

-- Index for fast lookup during rollback
CREATE INDEX idx_backup_sd_uuid_id ON _backup_strategic_directives_uuid_id(id);

DO $$
DECLARE
  backup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO backup_count FROM _backup_strategic_directives_uuid_id;
  RAISE NOTICE 'Backup created: % records preserved in _backup_strategic_directives_uuid_id';
END $$;

-- ============================================================================
-- SECTION 3: DROP uuid_id COLUMN
-- ============================================================================

-- Drop any indexes on uuid_id first
DROP INDEX IF EXISTS idx_strategic_directives_v2_uuid_id;
DROP INDEX IF EXISTS strategic_directives_v2_uuid_id_idx;

-- Drop the column
ALTER TABLE strategic_directives_v2 DROP COLUMN IF EXISTS uuid_id;

DO $$
BEGIN
  RAISE NOTICE 'uuid_id column has been DROPPED from strategic_directives_v2';
END $$;

-- ============================================================================
-- SECTION 4: POST-MIGRATION VALIDATION
-- ============================================================================

DO $$
DECLARE
  column_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'strategic_directives_v2'
    AND column_name = 'uuid_id'
  ) INTO column_exists;

  IF column_exists THEN
    RAISE EXCEPTION 'Migration FAILED: uuid_id column still exists!';
  ELSE
    RAISE NOTICE '';
    RAISE NOTICE '=== Migration Complete ===';
    RAISE NOTICE 'uuid_id column successfully removed from strategic_directives_v2';
    RAISE NOTICE '';
    RAISE NOTICE 'Rollback available via: _backup_strategic_directives_uuid_id table';
    RAISE NOTICE 'To restore: Run the rollback section below';
  END IF;
END $$;

-- ============================================================================
-- SECTION 5: UPDATE COLUMN COMMENTS
-- ============================================================================

COMMENT ON TABLE strategic_directives_v2 IS
'Strategic Directives for EHG ecosystem.
ID Schema: Uses id (VARCHAR) as primary key.
History: uuid_id column was removed 2025-12-17 (SD-FOUNDATION-V3-001).
Backup: _backup_strategic_directives_uuid_id contains historical uuid_id values.';

-- ============================================================================
-- ROLLBACK SECTION (DO NOT RUN AUTOMATICALLY)
-- ============================================================================
-- To rollback this migration, run the following commands:
--
-- -- Add uuid_id column back
-- ALTER TABLE strategic_directives_v2 ADD COLUMN uuid_id UUID;
--
-- -- Restore values from backup
-- UPDATE strategic_directives_v2 sd
-- SET uuid_id = backup.uuid_id
-- FROM _backup_strategic_directives_uuid_id backup
-- WHERE sd.id = backup.id;
--
-- -- Verify restoration
-- SELECT
--   COUNT(*) as total_restored,
--   COUNT(*) FILTER (WHERE uuid_id IS NOT NULL) as with_uuid
-- FROM strategic_directives_v2;
--
-- -- After successful rollback, optionally drop backup table:
-- -- DROP TABLE _backup_strategic_directives_uuid_id;
-- ============================================================================

-- ============================================================================
-- CLEANUP SECTION (RUN AFTER CONFIRMING STABILITY - OPTIONAL)
-- ============================================================================
-- After confirming the system is stable without uuid_id (recommended: 1 week),
-- you can drop the backup table:
--
-- DROP TABLE IF EXISTS _backup_strategic_directives_uuid_id;
-- ============================================================================
