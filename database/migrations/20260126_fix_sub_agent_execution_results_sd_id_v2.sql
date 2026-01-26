-- Migration: Fix sub_agent_execution_results sd_id integrity (v2)
-- SD: SD-LEO-FIX-ID-FORMAT-001
-- Date: 2026-01-26
-- Purpose: Clean up orphaned sd_id references and add FK constraint
-- Updated: Added step to drop NOT NULL constraint before cleanup

-- This migration addresses orphaned records where sd_id doesn't exist in strategic_directives_v2

-- Step 1: Check orphan count before cleanup
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM sub_agent_execution_results t
  WHERE t.sd_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM strategic_directives_v2 s WHERE s.id = t.sd_id);

  RAISE NOTICE 'Orphaned records to fix: %', orphan_count;
END $$;

-- Step 2: Drop NOT NULL constraint (allows setting orphans to NULL)
ALTER TABLE sub_agent_execution_results
ALTER COLUMN sd_id DROP NOT NULL;

-- Step 3: Set orphaned sd_id values to NULL (preserves the execution records)
UPDATE sub_agent_execution_results
SET sd_id = NULL
WHERE sd_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM strategic_directives_v2 s WHERE s.id = sd_id);

-- Step 4: Add FK constraint (allowing NULL values)
-- First check if constraint already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sub_agent_execution_results_sd_id_fkey'
    AND table_name = 'sub_agent_execution_results'
  ) THEN
    ALTER TABLE sub_agent_execution_results
    ADD CONSTRAINT sub_agent_execution_results_sd_id_fkey
    FOREIGN KEY (sd_id) REFERENCES strategic_directives_v2(id)
    ON DELETE SET NULL;

    RAISE NOTICE 'FK constraint added successfully';
  ELSE
    RAISE NOTICE 'FK constraint already exists';
  END IF;
END $$;

-- Step 5: Verify cleanup
DO $$
DECLARE
  remaining_orphans INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_orphans
  FROM sub_agent_execution_results t
  WHERE t.sd_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM strategic_directives_v2 s WHERE s.id = t.sd_id);

  IF remaining_orphans > 0 THEN
    RAISE EXCEPTION 'Migration failed: % orphaned records still exist', remaining_orphans;
  ELSE
    RAISE NOTICE 'Migration successful: 0 orphaned records remain';
  END IF;
END $$;

-- Rollback script (save separately as rollback_20260126_sub_agent_execution_results_v2.sql)
-- NOTE: Cannot restore original sd_id values as they are set to NULL
-- ALTER TABLE sub_agent_execution_results DROP CONSTRAINT IF EXISTS sub_agent_execution_results_sd_id_fkey;
-- ALTER TABLE sub_agent_execution_results ALTER COLUMN sd_id SET NOT NULL;
