-- Migration: Fix duplicate PRDs and add unique constraint on sd_id
-- Created: 2026-02-06
-- Pattern: PAT-PRD-DUPLICATE-001
-- Issue: 13 SDs have duplicate PRDs (17 duplicates total)
-- Root Cause: No database constraint preventing duplicate PRDs for same sd_id
-- Fix: Update foreign key references, delete older/less complete PRDs, add unique constraint

-- Step 0: Handle foreign key constraint from system_events
-- Update system_events to point to the PRD we're keeping (PRD-GENESIS-001 for SD-PARENT-4.0)
UPDATE system_events
SET prd_id = 'PRD-GENESIS-001'
WHERE prd_id IN ('PRD-LOGIFLOW-001', 'PRD-EDUPATH-001', 'PRD-FINTRACK-001', 'PRD-MEDSYNC-001');

-- Step 1: Delete duplicate PRDs, keeping the most recently updated one per sd_id
-- Strategy: For each sd_id, keep the PRD with:
--   1. Most recent updated_at (NULL values sorted last)
--   2. If updated_at is same/NULL, keep the one with highest progress
DELETE FROM product_requirements_v2
WHERE id IN (
  SELECT id FROM (
    SELECT id, sd_id,
      ROW_NUMBER() OVER (
        PARTITION BY sd_id
        ORDER BY
          updated_at DESC NULLS LAST,
          progress DESC NULLS LAST
      ) as rn
    FROM product_requirements_v2
    WHERE sd_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- Step 2: Add unique constraint on sd_id to prevent future duplicates
-- Note: NULL values are allowed (not all PRDs have sd_id)
-- Uses partial unique index (WHERE clause filters out NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_requirements_v2_unique_sd_id
ON product_requirements_v2 (sd_id)
WHERE sd_id IS NOT NULL;

-- Step 3: Document the constraint
COMMENT ON INDEX idx_product_requirements_v2_unique_sd_id IS
'PAT-PRD-DUPLICATE-001: Prevents duplicate PRDs per SD. Each SD can have at most one PRD. NULL sd_id values are allowed (template PRDs, etc). Added 2026-02-06 after RCA found 13 SDs with duplicate PRDs causing confusion in SD workflows.';

-- Verification query (should return 0 rows after this migration)
-- SELECT sd_id, COUNT(*) FROM product_requirements_v2 WHERE sd_id IS NOT NULL GROUP BY sd_id HAVING COUNT(*) > 1;
