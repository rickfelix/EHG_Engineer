-- Migration: Fix NULL legacy_id values in strategic_directives_v2
-- Date: 2025-01-27
-- Issue: 291 records had legacy_id = NULL
-- Solution:
--   1. Update existing NULL legacy_id to match id
--   2. Create trigger to auto-populate legacy_id on INSERT if not provided

-- Step 1: Fix existing records with NULL legacy_id
UPDATE strategic_directives_v2
SET legacy_id = id
WHERE legacy_id IS NULL;

-- Step 2: Create trigger function to auto-populate legacy_id
CREATE OR REPLACE FUNCTION populate_legacy_id_from_id()
RETURNS TRIGGER AS $$
BEGIN
  -- If legacy_id is not provided, copy from id
  IF NEW.legacy_id IS NULL THEN
    NEW.legacy_id := NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create trigger (drop first if exists to make idempotent)
DROP TRIGGER IF EXISTS auto_populate_legacy_id ON strategic_directives_v2;

CREATE TRIGGER auto_populate_legacy_id
BEFORE INSERT ON strategic_directives_v2
FOR EACH ROW
EXECUTE FUNCTION populate_legacy_id_from_id();

-- Note: This trigger preserves any explicitly provided legacy_id value
-- It only auto-populates if legacy_id is NULL on INSERT
