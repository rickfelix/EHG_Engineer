-- Migration: Add synthetic venture support
-- Part of SD-AUTOMATED-PIPELINE-RUNNER-FOR-ORCH-001-A
--
-- Adds is_synthetic flag to ventures table for separating synthetic
-- (pipeline-generated) ventures from organic (user-submitted) ventures.

-- Step 1: Add is_synthetic column
ALTER TABLE ventures
  ADD COLUMN IF NOT EXISTS is_synthetic BOOLEAN DEFAULT FALSE;

-- Step 2: Add synthetic_metadata for tracking generation provenance
ALTER TABLE ventures
  ADD COLUMN IF NOT EXISTS synthetic_metadata JSONB DEFAULT NULL;

-- Step 3: Partial index on is_synthetic=true for efficient filtering
-- Only indexes synthetic rows, keeping the index small
CREATE INDEX IF NOT EXISTS idx_ventures_is_synthetic
  ON ventures (is_synthetic)
  WHERE is_synthetic = true;

-- Step 4: Composite index for common queries filtering synthetic ventures
CREATE INDEX IF NOT EXISTS idx_ventures_synthetic_status
  ON ventures (status, is_synthetic)
  WHERE is_synthetic = true;

-- Step 5: Add comment for documentation
COMMENT ON COLUMN ventures.is_synthetic IS
  'True for pipeline-generated synthetic ventures used in A/B experiments. Default FALSE for organic ventures.';

COMMENT ON COLUMN ventures.synthetic_metadata IS
  'Generation provenance: archetype_key, seed, batch_id, generated_at. NULL for organic ventures.';
