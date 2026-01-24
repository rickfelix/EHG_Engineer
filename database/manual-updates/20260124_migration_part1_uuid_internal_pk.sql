-- ==============================================================================
-- MIGRATION PART 1: Add uuid_internal_pk column
-- ==============================================================================
-- SD: SD-LEO-GEN-RENAME-COLUMNS-SELF-001-C
-- Date: 2026-01-24
--
-- PURPOSE:
-- Add uuid_internal_pk column with bidirectional sync to uuid_id
-- This is safe to run independently.
--
-- EXECUTION:
-- Copy this entire file and paste into Supabase SQL Editor, then run.
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION: Add uuid_internal_pk column';
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

-- Copy data from uuid_id
UPDATE strategic_directives_v2
SET uuid_internal_pk = uuid_id
WHERE uuid_internal_pk IS NULL;

-- Add NOT NULL constraint
ALTER TABLE strategic_directives_v2
ALTER COLUMN uuid_internal_pk SET NOT NULL;

-- Create bidirectional sync trigger
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

-- Show trigger confirmation
SELECT
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'strategic_directives_v2'
  AND trigger_name = 'trg_sync_uuid_internal_pk';
