-- ============================================================================
-- Migration: Mark uuid_id column as DEPRECATED
-- Date: 2025-12-12
-- ============================================================================
--
-- This migration documents the deprecation of strategic_directives_v2.uuid_id
-- as part of the SD ID Schema Cleanup.
--
-- BACKGROUND:
-- - The uuid_id column was created during a past migration
-- - It contains UUIDs that are DIFFERENT from the id primary key
-- - This caused systemic confusion in FK relationships
-- - Code used inconsistent `sd.uuid_id || sd.id` patterns
--
-- RESOLUTION:
-- - strategic_directives_v2.id is now the CANONICAL identifier
-- - product_requirements_v2.sd_id references SD.id (not uuid_id)
-- - All code has been updated to use SD.id directly
--
-- FUTURE REMOVAL:
-- - uuid_id column can be dropped once all references are removed
-- - This requires verifying no external systems depend on it
--
-- ============================================================================

-- Add deprecation comment to uuid_id column
COMMENT ON COLUMN strategic_directives_v2.uuid_id IS
'DEPRECATED (2025-12-12): Do not use for FK relationships.
Use the id column instead - it is the canonical identifier.

History:
- Column created during legacy migration
- Contains UUIDs that differ from id for 91% of records
- Caused systemic confusion in FK relationships
- product_requirements_v2.sd_id now references id (not uuid_id)

This column will be dropped in a future migration once all
external dependencies are verified to be removed.';

-- Validation: Show deprecation notice
DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'uuid_id Column Deprecation Notice';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'The uuid_id column in strategic_directives_v2 is now DEPRECATED.';
  RAISE NOTICE '';
  RAISE NOTICE 'DO NOT USE uuid_id for:';
  RAISE NOTICE '  - Foreign key relationships';
  RAISE NOTICE '  - PRD → SD lookups';
  RAISE NOTICE '  - Handoff validations';
  RAISE NOTICE '';
  RAISE NOTICE 'INSTEAD USE:';
  RAISE NOTICE '  - strategic_directives_v2.id (the primary key)';
  RAISE NOTICE '  - product_requirements_v2.sd_id references SD.id';
  RAISE NOTICE '';
  RAISE NOTICE 'Column will be dropped in a future migration.';
  RAISE NOTICE '============================================================';
END $$;
