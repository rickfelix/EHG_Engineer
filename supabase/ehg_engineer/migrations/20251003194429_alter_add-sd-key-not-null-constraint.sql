-- Migration: Add NOT NULL constraint to sd_key field
-- Date: 2025-10-03
-- Purpose: Prevent null values in sd_key column of strategic_directives_v2 table

-- Step 1: First, update any existing NULL sd_key values with a generated key
UPDATE strategic_directives_v2
SET sd_key = CASE
  WHEN sd_key IS NULL THEN id
  ELSE sd_key
END
WHERE sd_key IS NULL;

-- Step 2: Add NOT NULL constraint to sd_key column
ALTER TABLE strategic_directives_v2
ALTER COLUMN sd_key SET NOT NULL;

-- Step 3: Verify the constraint was added
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'strategic_directives_v2'
    AND column_name = 'sd_key'
    AND is_nullable = 'NO'
  ) THEN
    RAISE NOTICE '✅ NOT NULL constraint successfully added to sd_key column';
  ELSE
    RAISE EXCEPTION '❌ Failed to add NOT NULL constraint';
  END IF;
END $$;

-- Step 4: Create a unique index on sd_key if it doesn't exist
CREATE UNIQUE INDEX IF NOT EXISTS idx_strategic_directives_v2_sd_key
ON strategic_directives_v2(sd_key);
