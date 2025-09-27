-- Migration: Remove redundant execution_order column
-- Date: 2025-09-27
-- Reason: execution_order and sequence_rank serve the same purpose, keeping only sequence_rank

-- Step 1: Copy any execution_order values to sequence_rank where sequence_rank is null
-- (This ensures we don't lose any data)
UPDATE strategic_directives_v2
SET sequence_rank = execution_order
WHERE sequence_rank IS NULL
  AND execution_order IS NOT NULL;

-- Step 2: Drop the redundant execution_order column
ALTER TABLE strategic_directives_v2
DROP COLUMN IF EXISTS execution_order;

-- Step 3: Add comment to document the field's purpose
COMMENT ON COLUMN strategic_directives_v2.sequence_rank IS
'Execution sequence ranking for Strategic Directives. Lower numbers = higher priority/earlier execution. Used for dependency-based ordering.';