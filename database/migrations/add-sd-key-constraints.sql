-- Migration: Add SD Key Constraints
-- Purpose: Prevent duplicate SD keys and enforce data integrity
-- Date: 2025-09-29
-- Related Issue: SD-UAT-001 key collision

-- Step 1: Fix any existing NULL sd_keys before adding NOT NULL constraint
-- (Give them temporary unique values based on their id)
UPDATE strategic_directives_v2
SET sd_key = COALESCE(sd_key, 'LEGACY-' || id)
WHERE sd_key IS NULL;

-- Step 2: Make sd_key required (no NULLs allowed)
ALTER TABLE strategic_directives_v2
  ALTER COLUMN sd_key SET NOT NULL;

-- Step 3: Add unique constraint on sd_key
-- This prevents duplicate SD keys across all records
ALTER TABLE strategic_directives_v2
  ADD CONSTRAINT unique_sd_key UNIQUE (sd_key);

-- Step 4: Add check constraint: id MUST be UUID format
-- This prevents using human-readable strings like "SD-UAT-001" as IDs
ALTER TABLE strategic_directives_v2
  ADD CONSTRAINT id_must_be_uuid
  CHECK (id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');

-- Step 5: Create index on sd_key for better query performance
CREATE INDEX IF NOT EXISTS idx_strategic_directives_v2_sd_key
  ON strategic_directives_v2(sd_key);

-- Verification queries (commented out - for manual testing):
-- SELECT COUNT(*) as null_sd_keys FROM strategic_directives_v2 WHERE sd_key IS NULL;
-- SELECT sd_key, COUNT(*) as duplicates FROM strategic_directives_v2 GROUP BY sd_key HAVING COUNT(*) > 1;
-- SELECT id FROM strategic_directives_v2 WHERE id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';