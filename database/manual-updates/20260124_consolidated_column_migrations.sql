-- ==============================================================================
-- CONSOLIDATED COLUMN MIGRATIONS
-- ==============================================================================
-- SD: SD-LEO-GEN-RENAME-COLUMNS-SELF-001-C, SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D
-- Date: 2026-01-24
--
-- PURPOSE:
-- 1. Add uuid_internal_pk column (with bidirectional sync to uuid_id)
-- 2. Remove legacy_id column (with backup)
--
-- EXECUTION:
-- Copy this entire file and paste into Supabase SQL Editor, then run.
-- ==============================================================================

-- ==============================================================================
-- MIGRATION 1: Add uuid_internal_pk column
-- ==============================================================================
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION 1: Add uuid_internal_pk column';
    RAISE NOTICE '========================================';
END $$;

BEGIN;

-- Add new column (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'strategic_directives_v2'
        AND column_name = 'uuid_internal_pk'
    ) THEN
        ALTER TABLE strategic_directives_v2
        ADD COLUMN uuid_internal_pk UUID;
        RAISE NOTICE '✓ Added uuid_internal_pk column';
    ELSE
        RAISE NOTICE '⚠ uuid_internal_pk column already exists';
    END IF;
END $$;

-- Copy data
UPDATE strategic_directives_v2
SET uuid_internal_pk = uuid_id
WHERE uuid_internal_pk IS NULL;

-- Add NOT NULL constraint
ALTER TABLE strategic_directives_v2
ALTER COLUMN uuid_internal_pk SET NOT NULL;

-- Create sync trigger
CREATE OR REPLACE FUNCTION sync_uuid_internal_pk()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.uuid_id IS DISTINCT FROM OLD.uuid_id THEN
        NEW.uuid_internal_pk := NEW.uuid_id;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.uuid_internal_pk IS DISTINCT FROM OLD.uuid_internal_pk THEN
        NEW.uuid_id := NEW.uuid_internal_pk;
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF NEW.uuid_internal_pk IS NULL THEN
            NEW.uuid_internal_pk := NEW.uuid_id;
        ELSIF NEW.uuid_id IS NULL THEN
            NEW.uuid_id := NEW.uuid_internal_pk;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_uuid_internal_pk ON strategic_directives_v2;
CREATE TRIGGER trg_sync_uuid_internal_pk
    BEFORE INSERT OR UPDATE ON strategic_directives_v2
    FOR EACH ROW
    EXECUTE FUNCTION sync_uuid_internal_pk();

-- Verify
DO $$
DECLARE
    total_rows INT;
    synced_rows INT;
BEGIN
    SELECT COUNT(*) INTO total_rows FROM strategic_directives_v2;
    SELECT COUNT(*) INTO synced_rows FROM strategic_directives_v2 WHERE uuid_id = uuid_internal_pk;
    IF total_rows = synced_rows THEN
        RAISE NOTICE '✓ SUCCESS: All % rows synced (uuid_id = uuid_internal_pk)', total_rows;
    ELSE
        RAISE WARNING '✗ MISMATCH: % of % rows synced', synced_rows, total_rows;
    END IF;
END $$;

COMMIT;

-- ==============================================================================
-- MIGRATION 2: Remove legacy_id column
-- ==============================================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION 2: Remove legacy_id column';
    RAISE NOTICE '========================================';
END $$;

BEGIN;

-- Backup legacy_id values before removal (for rollback if needed)
CREATE TABLE IF NOT EXISTS strategic_directives_v2_legacy_id_backup AS
SELECT uuid_id, legacy_id FROM strategic_directives_v2 WHERE legacy_id IS NOT NULL;

DO $$
DECLARE
    backup_count INT;
BEGIN
    SELECT COUNT(*) INTO backup_count FROM strategic_directives_v2_legacy_id_backup;
    RAISE NOTICE '✓ Backed up % legacy_id values', backup_count;
END $$;

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
        RAISE NOTICE '✓ SUCCESS: legacy_id column removed';
    ELSE
        RAISE WARNING '✗ FAILED: legacy_id column still exists';
    END IF;
END $$;

COMMIT;

-- ==============================================================================
-- FINAL VERIFICATION
-- ==============================================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'FINAL VERIFICATION';
    RAISE NOTICE '========================================';
END $$;

-- Show final table structure
DO $$
DECLARE
    col RECORD;
    has_uuid_internal_pk BOOLEAN := FALSE;
    has_legacy_id BOOLEAN := FALSE;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE 'Columns in strategic_directives_v2:';
    FOR col IN
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'strategic_directives_v2'
        ORDER BY ordinal_position
    LOOP
        RAISE NOTICE '  - %: % (nullable: %)', col.column_name, col.data_type, col.is_nullable;
        IF col.column_name = 'uuid_internal_pk' THEN
            has_uuid_internal_pk := TRUE;
        END IF;
        IF col.column_name = 'legacy_id' THEN
            has_legacy_id := TRUE;
        END IF;
    END LOOP;

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION SUMMARY';
    RAISE NOTICE '========================================';

    IF has_uuid_internal_pk THEN
        RAISE NOTICE '✓ uuid_internal_pk column added';
    ELSE
        RAISE WARNING '✗ uuid_internal_pk column MISSING';
    END IF;

    IF NOT has_legacy_id THEN
        RAISE NOTICE '✓ legacy_id column removed';
    ELSE
        RAISE WARNING '✗ legacy_id column STILL EXISTS';
    END IF;

    RAISE NOTICE '';
    IF has_uuid_internal_pk AND NOT has_legacy_id THEN
        RAISE NOTICE '🎉 ALL MIGRATIONS COMPLETED SUCCESSFULLY!';
    ELSE
        RAISE WARNING '⚠ MIGRATIONS INCOMPLETE - Review warnings above';
    END IF;
    RAISE NOTICE '========================================';
END $$;

-- Show trigger
SELECT
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'strategic_directives_v2'
  AND trigger_name = 'trg_sync_uuid_internal_pk';
