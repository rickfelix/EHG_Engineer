-- Worker Heartbeats Table
-- SD-LEO-INFRA-STAGE-EXECUTION-WORKER-001 (FR-002)
-- Tracks liveness of background workers (stage-execution-worker, etc.)

CREATE TABLE IF NOT EXISTS worker_heartbeats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id TEXT NOT NULL,
  worker_type TEXT NOT NULL DEFAULT 'stage-execution-worker',
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'stopped', 'crashed')),
  pid INTEGER,
  hostname TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT worker_heartbeats_worker_id_unique UNIQUE (worker_id)
);

-- Index for efficient status queries
CREATE INDEX IF NOT EXISTS idx_worker_heartbeats_type_status
  ON worker_heartbeats (worker_type, status);

-- Enable RLS
ALTER TABLE worker_heartbeats ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "service_role_full_access" ON worker_heartbeats
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
