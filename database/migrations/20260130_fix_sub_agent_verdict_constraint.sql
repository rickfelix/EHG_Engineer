-- Migration: Fix sub_agent_execution_results verdict constraint
-- Issue: BL-INF-2337A - MANUAL_REQUIRED not valid in sub_agent_execution_results
-- RCA: Code emits MANUAL_REQUIRED and PENDING verdicts, but constraint only allows 5 values
-- Solution: Add MANUAL_REQUIRED, PENDING, and ERROR to the constraint

-- Step 1: Drop the existing constraint
ALTER TABLE sub_agent_execution_results
DROP CONSTRAINT IF EXISTS valid_verdict;

-- Step 2: Add the updated constraint with new verdict values
ALTER TABLE sub_agent_execution_results
ADD CONSTRAINT valid_verdict
CHECK (verdict IN (
  'PASS',
  'FAIL',
  'BLOCKED',
  'CONDITIONAL_PASS',
  'WARNING',
  'MANUAL_REQUIRED',  -- New: When sub-agent has no automation module
  'PENDING',          -- New: When execution is pending
  'ERROR'             -- New: When execution errors occur
));

-- Add comment documenting the change
COMMENT ON CONSTRAINT valid_verdict ON sub_agent_execution_results IS
'Valid verdict values including MANUAL_REQUIRED for non-automated sub-agents, PENDING for in-progress, ERROR for failures. Updated 2026-01-30 per RCA BL-INF-2337A';

-- Verification query (run after migration to confirm)
-- SELECT DISTINCT verdict FROM sub_agent_execution_results;
