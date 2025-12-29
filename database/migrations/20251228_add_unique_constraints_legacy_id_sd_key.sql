-- Migration: Add UNIQUE constraints on strategic_directives_v2.legacy_id and sd_key
-- Date: 2025-12-28
-- Author: System (SD-MOCK-DATA-2025-12 completion fix)
-- Issue: Duplicate legacy_id/sd_key values caused .single() query failures in handoff system
-- Root Cause: No database-level uniqueness enforcement allowed duplicate SD identifiers

-- Step 1: Add UNIQUE constraint on legacy_id (allows NULL, enforces uniqueness on non-null values)
DO $$
BEGIN
  -- Check if constraint already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'strategic_directives_v2_legacy_id_unique'
  ) THEN
    ALTER TABLE strategic_directives_v2
    ADD CONSTRAINT strategic_directives_v2_legacy_id_unique
    UNIQUE (legacy_id);

    RAISE NOTICE 'Added UNIQUE constraint on legacy_id';
  ELSE
    RAISE NOTICE 'UNIQUE constraint on legacy_id already exists';
  END IF;
END $$;

-- Step 2: Add UNIQUE constraint on sd_key (allows NULL, enforces uniqueness on non-null values)
DO $$
BEGIN
  -- Check if constraint already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'strategic_directives_v2_sd_key_unique'
  ) THEN
    ALTER TABLE strategic_directives_v2
    ADD CONSTRAINT strategic_directives_v2_sd_key_unique
    UNIQUE (sd_key);

    RAISE NOTICE 'Added UNIQUE constraint on sd_key';
  ELSE
    RAISE NOTICE 'UNIQUE constraint on sd_key already exists';
  END IF;
END $$;

-- Step 3: Create index for faster lookups (if not exists)
CREATE INDEX IF NOT EXISTS idx_strategic_directives_v2_legacy_id
ON strategic_directives_v2 (legacy_id)
WHERE legacy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_strategic_directives_v2_sd_key
ON strategic_directives_v2 (sd_key)
WHERE sd_key IS NOT NULL;

-- Verification query (run after migration)
-- SELECT
--   constraint_name,
--   table_name
-- FROM information_schema.table_constraints
-- WHERE table_name = 'strategic_directives_v2'
-- AND constraint_type = 'UNIQUE';
