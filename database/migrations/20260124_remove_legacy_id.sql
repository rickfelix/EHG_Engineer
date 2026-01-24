-- Migration: Remove legacy_id column
-- Date: 2026-01-24
-- SD: SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D
--
-- PURPOSE:
-- legacy_id was a numeric ID from before UUID migration.
-- It's no longer used and should be removed.
--
-- PRE-REQUISITE: Verify no codebase references exist before running!

BEGIN;

-- Backup legacy_id values before removal (for rollback if needed)
CREATE TABLE IF NOT EXISTS strategic_directives_v2_legacy_id_backup AS
SELECT uuid_id, legacy_id FROM strategic_directives_v2 WHERE legacy_id IS NOT NULL;

-- Drop the column
ALTER TABLE strategic_directives_v2
DROP COLUMN IF EXISTS legacy_id;

-- Verify removal
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'strategic_directives_v2'
        AND column_name = 'legacy_id'
    ) THEN
        RAISE NOTICE 'SUCCESS: legacy_id column removed';
    ELSE
        RAISE WARNING 'FAILED: legacy_id column still exists';
    END IF;
END $$;

COMMIT;

-- ROLLBACK (if needed):
-- ALTER TABLE strategic_directives_v2 ADD COLUMN legacy_id INT;
-- UPDATE strategic_directives_v2 sd SET legacy_id = b.legacy_id
-- FROM strategic_directives_v2_legacy_id_backup b WHERE sd.uuid_id = b.uuid_id;
