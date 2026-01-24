-- Migration: Rename id column to sd_code_user_facing
-- Date: 2026-01-24
-- SD: SD-LEO-GEN-RENAME-COLUMNS-SELF-001-B
--
-- PURPOSE:
-- The current 'id' column name is misleading - it contains user-facing SD keys
-- (e.g., 'SD-LEO-001') but the name suggests it's a database primary key.
-- The actual PK is uuid_id (UUID). Renaming to sd_code_user_facing makes
-- the purpose self-documenting.
--
-- APPROACH:
-- Phase 1: Add new column and copy data (backward compatible)
-- Phase 2: Create view for legacy compatibility
-- Phase 3: Eventually drop old column (separate migration)
--
-- CAUTION: This migration requires corresponding codebase updates.
-- Run with care in production.

BEGIN;

-- Phase 1A: Add new column (if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'strategic_directives_v2'
        AND column_name = 'sd_code_user_facing'
    ) THEN
        ALTER TABLE strategic_directives_v2
        ADD COLUMN sd_code_user_facing VARCHAR(100);

        RAISE NOTICE 'Added sd_code_user_facing column';
    ELSE
        RAISE NOTICE 'sd_code_user_facing column already exists';
    END IF;
END $$;

-- Phase 1B: Copy data from id to sd_code_user_facing
UPDATE strategic_directives_v2
SET sd_code_user_facing = id
WHERE sd_code_user_facing IS NULL OR sd_code_user_facing = '';

-- Phase 1C: Add constraints to match original column
-- (id has UNIQUE constraint as it's the "user-facing primary key")
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'strategic_directives_v2_sd_code_user_facing_key'
    ) THEN
        ALTER TABLE strategic_directives_v2
        ADD CONSTRAINT strategic_directives_v2_sd_code_user_facing_key
        UNIQUE (sd_code_user_facing);

        RAISE NOTICE 'Added UNIQUE constraint on sd_code_user_facing';
    END IF;
END $$;

-- Phase 1D: Add NOT NULL constraint after data is copied
ALTER TABLE strategic_directives_v2
ALTER COLUMN sd_code_user_facing SET NOT NULL;

-- Phase 2: Create trigger to keep columns in sync during transition
-- This allows old code to write to 'id' while new code uses 'sd_code_user_facing'
CREATE OR REPLACE FUNCTION sync_sd_code_user_facing()
RETURNS TRIGGER AS $$
BEGIN
    -- If id is updated, sync to sd_code_user_facing
    IF TG_OP = 'UPDATE' AND NEW.id IS DISTINCT FROM OLD.id THEN
        NEW.sd_code_user_facing := NEW.id;
    END IF;

    -- If sd_code_user_facing is updated, sync to id
    IF TG_OP = 'UPDATE' AND NEW.sd_code_user_facing IS DISTINCT FROM OLD.sd_code_user_facing THEN
        NEW.id := NEW.sd_code_user_facing;
    END IF;

    -- For inserts, ensure both columns have the same value
    IF TG_OP = 'INSERT' THEN
        IF NEW.sd_code_user_facing IS NULL THEN
            NEW.sd_code_user_facing := NEW.id;
        ELSIF NEW.id IS NULL THEN
            NEW.id := NEW.sd_code_user_facing;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_sd_code_user_facing ON strategic_directives_v2;
CREATE TRIGGER trg_sync_sd_code_user_facing
    BEFORE INSERT OR UPDATE ON strategic_directives_v2
    FOR EACH ROW
    EXECUTE FUNCTION sync_sd_code_user_facing();

-- Phase 3: Create index on new column for query performance
CREATE INDEX IF NOT EXISTS idx_sd_code_user_facing
ON strategic_directives_v2(sd_code_user_facing);

-- Verification queries
DO $$
DECLARE
    total_rows INT;
    synced_rows INT;
BEGIN
    SELECT COUNT(*) INTO total_rows FROM strategic_directives_v2;
    SELECT COUNT(*) INTO synced_rows FROM strategic_directives_v2 WHERE id = sd_code_user_facing;

    IF total_rows = synced_rows THEN
        RAISE NOTICE 'SUCCESS: All % rows have id = sd_code_user_facing', total_rows;
    ELSE
        RAISE WARNING 'MISMATCH: % of % rows have mismatched values', (total_rows - synced_rows), total_rows;
    END IF;
END $$;

COMMIT;

-- ROLLBACK SCRIPT (if needed):
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_sync_sd_code_user_facing ON strategic_directives_v2;
-- DROP FUNCTION IF EXISTS sync_sd_code_user_facing();
-- DROP INDEX IF EXISTS idx_sd_code_user_facing;
-- ALTER TABLE strategic_directives_v2 DROP CONSTRAINT IF EXISTS strategic_directives_v2_sd_code_user_facing_key;
-- ALTER TABLE strategic_directives_v2 DROP COLUMN IF EXISTS sd_code_user_facing;
-- COMMIT;
