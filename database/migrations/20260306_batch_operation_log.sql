-- Batch Operation Log: Audit trail for /batch command executions
-- SD: SD-LEO-SIMPLIFY-ENFORCEMENT-AND-ORCH-001-B

CREATE TABLE IF NOT EXISTS batch_operation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation TEXT NOT NULL,
  dry_run BOOLEAN NOT NULL DEFAULT true,
  operator TEXT,
  total_items INTEGER NOT NULL DEFAULT 0,
  processed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  details JSONB DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for dashboard queries
CREATE INDEX IF NOT EXISTS idx_batch_operation_log_operation ON batch_operation_log(operation);
CREATE INDEX IF NOT EXISTS idx_batch_operation_log_created ON batch_operation_log(created_at DESC);

-- RLS: service role only (operational commands)
ALTER TABLE batch_operation_log ENABLE ROW LEVEL SECURITY;
