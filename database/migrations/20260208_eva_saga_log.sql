-- Eva Saga Log - Compensation Pattern for Eva Orchestrator
-- SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-002-F
--
-- Logs saga executions including completed steps, failures, and compensation outcomes.

CREATE TABLE IF NOT EXISTS eva_saga_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  saga_id UUID NOT NULL,
  trace_id UUID,
  venture_id UUID REFERENCES ventures(id),
  status TEXT NOT NULL DEFAULT 'pending',
  steps_registered TEXT[] DEFAULT '{}',
  steps_completed TEXT[] DEFAULT '{}',
  failed_step TEXT,
  error_message TEXT,
  compensation_errors JSONB DEFAULT '[]'::jsonb,
  duration_ms INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_eva_saga_log_saga_id ON eva_saga_log(saga_id);
CREATE INDEX IF NOT EXISTS idx_eva_saga_log_venture_id ON eva_saga_log(venture_id);
CREATE INDEX IF NOT EXISTS idx_eva_saga_log_trace_id ON eva_saga_log(trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_eva_saga_log_status ON eva_saga_log(status);

-- RLS
ALTER TABLE eva_saga_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "service_role_all_eva_saga_log"
  ON eva_saga_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE eva_saga_log IS 'Saga execution logs for Eva Orchestrator compensation pattern';
