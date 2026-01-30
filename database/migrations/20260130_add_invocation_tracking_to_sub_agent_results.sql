-- Migration: Add invocation_id for Task tool sub-agent recording
-- SD: SD-LEO-INFRA-SUB-AGENT-TASK-001
-- Purpose: Enable idempotent recording of Task tool sub-agent invocations
-- FR-4: Ensures duplicate rows are prevented when the same Task invocation triggers multiple times

-- Add invocation_id column if not exists
ALTER TABLE sub_agent_execution_results
ADD COLUMN IF NOT EXISTS invocation_id TEXT;

-- Add unique constraint for idempotency (FR-4)
-- Using CREATE INDEX ... IF NOT EXISTS pattern since ADD CONSTRAINT IF NOT EXISTS doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sub_agent_execution_results_invocation_id_key'
  ) THEN
    ALTER TABLE sub_agent_execution_results
    ADD CONSTRAINT sub_agent_execution_results_invocation_id_key UNIQUE (invocation_id);
  END IF;
END $$;

-- Add summary column for storing extracted summary (FR-2)
ALTER TABLE sub_agent_execution_results
ADD COLUMN IF NOT EXISTS summary TEXT;

-- Add raw_output column for storing full Task result payload (FR-3)
ALTER TABLE sub_agent_execution_results
ADD COLUMN IF NOT EXISTS raw_output JSONB;

-- Add source column to track where the record came from
ALTER TABLE sub_agent_execution_results
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- Add index on invocation_id for fast lookups (FR-5)
CREATE INDEX IF NOT EXISTS idx_sub_agent_execution_results_invocation_id
ON sub_agent_execution_results(invocation_id);

-- Add index on sub_agent_code + created_at for stop-hook enforcement queries
CREATE INDEX IF NOT EXISTS idx_sub_agent_execution_results_code_created
ON sub_agent_execution_results(sub_agent_code, created_at DESC);

-- Comment on columns
COMMENT ON COLUMN sub_agent_execution_results.invocation_id IS 'Deterministic SHA-256 hash of (tool_name, subagent_type, tool_call_id, inputs) for idempotency';
COMMENT ON COLUMN sub_agent_execution_results.summary IS 'Extracted summary from Task tool output (first 500 chars if from text)';
COMMENT ON COLUMN sub_agent_execution_results.raw_output IS 'Full Task result payload (truncated to 256KB with truncated flag if larger)';
COMMENT ON COLUMN sub_agent_execution_results.source IS 'Where this record came from: manual, task_hook, sub_agent_executor';
