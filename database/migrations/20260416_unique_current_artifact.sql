-- Migration: Add unique partial index to prevent duplicate current artifacts
-- Fixes race condition where two concurrent writes create duplicate is_current=true
-- rows for the same (venture_id, lifecycle_stage, artifact_type) tuple.
-- Replaces TOCTOU pre-INSERT check + post-INSERT dedup from PR #3089.

-- Step 1: Clean up any existing duplicates before creating the unique index.
-- Keep the most recent row (highest id) as is_current=true, demote the rest.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY venture_id, lifecycle_stage, artifact_type
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM venture_artifacts
  WHERE is_current = true
)
UPDATE venture_artifacts
SET is_current = false
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Step 2: Create the unique partial index
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_current_artifact
  ON venture_artifacts (venture_id, lifecycle_stage, artifact_type)
  WHERE is_current = true;
