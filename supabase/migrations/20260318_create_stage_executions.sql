-- Migration: Create stage_executions table for per-stage execution tracking
-- SD: SD-VW-BACKEND-EXEC-RECORDS-001
-- Purpose: Track individual stage processing attempts with heartbeat for crash detection

CREATE TABLE IF NOT EXISTS stage_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  lifecycle_stage INT NOT NULL,
  worker_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed', 'timed_out')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Index for querying executions by venture and stage
CREATE INDEX IF NOT EXISTS idx_stage_executions_venture_stage
  ON stage_executions (venture_id, lifecycle_stage);

-- Index for stale heartbeat detection: find running executions with old heartbeats
CREATE INDEX IF NOT EXISTS idx_stage_executions_stale_heartbeat
  ON stage_executions (status, heartbeat_at)
  WHERE status = 'running';

-- RLS: service role full access (worker runs as service role)
ALTER TABLE stage_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON stage_executions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE stage_executions IS 'Per-stage execution records with heartbeat tracking for crash detection (SD-VW-BACKEND-EXEC-RECORDS-001)';
COMMENT ON COLUMN stage_executions.heartbeat_at IS 'Updated periodically during processing; stale value indicates crashed worker';
