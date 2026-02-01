-- LEO Self-Improvement Data-Plane: Proposals Schema Extension
-- SD: SD-LEO-SELF-IMPROVE-001L (Phase 7a: Data-Plane Integration)
-- Purpose: Add pipeline-related columns to leo_proposals table
-- FR-2, FR-3, FR-4: Support proposal → prioritization → execution pipeline

-- =============================================================================
-- Add pipeline columns to leo_proposals
-- =============================================================================

-- Add source tracking columns
ALTER TABLE leo_proposals
  ADD COLUMN IF NOT EXISTS source_type TEXT NULL;

ALTER TABLE leo_proposals
  ADD COLUMN IF NOT EXISTS source_id UUID NULL;

-- Add prioritization columns (FR-3)
ALTER TABLE leo_proposals
  ADD COLUMN IF NOT EXISTS priority_score INTEGER NULL;

ALTER TABLE leo_proposals
  ADD COLUMN IF NOT EXISTS priority_queue TEXT NULL;

-- Add execution tracking column (FR-4)
ALTER TABLE leo_proposals
  ADD COLUMN IF NOT EXISTS execution_job_id UUID NULL;

-- Add index for source lookups
CREATE INDEX IF NOT EXISTS idx_leo_proposals_source_id
  ON leo_proposals (source_id)
  WHERE source_id IS NOT NULL;

-- Add index for prioritization queries
CREATE INDEX IF NOT EXISTS idx_leo_proposals_priority_queue
  ON leo_proposals (priority_queue, priority_score DESC)
  WHERE priority_queue IS NOT NULL;

-- Add index for status-based queries
CREATE INDEX IF NOT EXISTS idx_leo_proposals_status_priority
  ON leo_proposals (status, priority_score DESC NULLS LAST);

-- =============================================================================
-- Create leo_execution_jobs table (FR-4)
-- =============================================================================

CREATE TABLE IF NOT EXISTS leo_execution_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  proposal_id UUID NULL REFERENCES leo_proposals(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  priority INTEGER NOT NULL DEFAULT 50,
  queue_name TEXT NOT NULL DEFAULT 'standard_queue',
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  result JSONB NULL DEFAULT '{}'::jsonb,
  metadata JSONB NULL DEFAULT '{}'::jsonb,
  CONSTRAINT uq_execution_job_proposal UNIQUE (proposal_id)
);

-- Add indexes for execution job queries
CREATE INDEX IF NOT EXISTS idx_execution_jobs_status
  ON leo_execution_jobs (status, priority DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_execution_jobs_queue
  ON leo_execution_jobs (queue_name, status, priority DESC);

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION leo_execution_jobs_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_execution_jobs_update_timestamp ON leo_execution_jobs;
CREATE TRIGGER trg_execution_jobs_update_timestamp
  BEFORE UPDATE ON leo_execution_jobs
  FOR EACH ROW
  EXECUTE FUNCTION leo_execution_jobs_update_timestamp();

-- RLS for execution jobs
ALTER TABLE leo_execution_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to leo_execution_jobs"
  ON leo_execution_jobs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =============================================================================
-- Comments
-- =============================================================================
COMMENT ON COLUMN leo_proposals.source_type IS 'Source type (feedback, manual, etc.). SD: SD-LEO-SELF-IMPROVE-001L';
COMMENT ON COLUMN leo_proposals.source_id IS 'Reference to source entity ID. SD: SD-LEO-SELF-IMPROVE-001L';
COMMENT ON COLUMN leo_proposals.priority_score IS 'Computed priority score (0-100). SD: SD-LEO-SELF-IMPROVE-001L';
COMMENT ON COLUMN leo_proposals.priority_queue IS 'Queue assignment based on score. SD: SD-LEO-SELF-IMPROVE-001L';
COMMENT ON COLUMN leo_proposals.execution_job_id IS 'Reference to execution job. SD: SD-LEO-SELF-IMPROVE-001L';
COMMENT ON TABLE leo_execution_jobs IS 'Execution work items from prioritized proposals. SD: SD-LEO-SELF-IMPROVE-001L';
