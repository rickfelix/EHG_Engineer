-- Stage Execution Records: Per-execution tracking with heartbeat for crash detection
-- SD-VW-BACKEND-EXEC-RECORDS-001
--
-- Tracks individual stage processing attempts by the stage-execution-worker.
-- Each row = one processStage() invocation for a venture/stage combination.
-- heartbeat_at is refreshed periodically during processing to enable
-- stale execution detection (crashed workers leave stale heartbeats).

CREATE TABLE IF NOT EXISTS stage_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  lifecycle_stage INTEGER NOT NULL,
  worker_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed', 'timed_out')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for polling: find running executions for a venture/stage
CREATE INDEX idx_stage_executions_venture_stage
  ON stage_executions (venture_id, lifecycle_stage);

-- Index for stale detection: find running records with old heartbeats
CREATE INDEX idx_stage_executions_stale_detection
  ON stage_executions (status, heartbeat_at)
  WHERE status = 'running';

-- Index for worker observability: find all executions by a worker
CREATE INDEX idx_stage_executions_worker
  ON stage_executions (worker_id, started_at DESC);

-- RLS: service role full access (worker runs as service role)
ALTER TABLE stage_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on stage_executions"
  ON stage_executions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Auto-update updated_at on modification
CREATE OR REPLACE FUNCTION update_stage_executions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stage_executions_updated_at
  BEFORE UPDATE ON stage_executions
  FOR EACH ROW
  EXECUTE FUNCTION update_stage_executions_updated_at();

COMMENT ON TABLE stage_executions IS 'Per-execution tracking for stage-execution-worker. Each row is one processStage() attempt with heartbeat for crash detection.';
COMMENT ON COLUMN stage_executions.heartbeat_at IS 'Refreshed periodically during processing. Stale heartbeat = crashed worker.';
COMMENT ON COLUMN stage_executions.worker_id IS 'Identifies which worker instance processed this execution.';
