-- Migration: Add progress_percentage column to strategic_directives_v2
-- Date: 2025-10-10
-- Issue: LEO Protocol Enhancement #7 trigger references non-existent column
-- Risk: VERY LOW (additive change only)
-- Downtime: NONE

-- Step 1: Add column with IF NOT EXISTS (idempotent)
ALTER TABLE strategic_directives_v2
  ADD COLUMN IF NOT EXISTS progress_percentage INTEGER
  DEFAULT 0
  CHECK (progress_percentage >= 0 AND progress_percentage <= 100);

-- Step 2: Set default for NULL rows (defensive)
UPDATE strategic_directives_v2
  SET progress_percentage = 0
  WHERE progress_percentage IS NULL;

-- Verification query (run after migration):
-- SELECT id, progress_percentage FROM strategic_directives_v2 LIMIT 5;
