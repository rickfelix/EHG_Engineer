-- EVA Event Log for Venture Monitor Audit Trail
-- SD: SD-EVA-FEAT-EVENT-MONITOR-001
-- Creates the eva_event_log table for tracking all realtime/cron-triggered actions

CREATE TABLE IF NOT EXISTS eva_event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  trigger_source TEXT NOT NULL CHECK (trigger_source IN ('realtime', 'cron', 'manual')),
  venture_id UUID,
  correlation_id UUID NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed', 'suppressed')),
  error_message TEXT,
  job_name TEXT,
  scheduled_time TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_eva_event_log_correlation ON eva_event_log(correlation_id);
CREATE INDEX IF NOT EXISTS idx_eva_event_log_created ON eva_event_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eva_event_log_venture ON eva_event_log(venture_id) WHERE venture_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_eva_event_log_type ON eva_event_log(event_type);
CREATE INDEX IF NOT EXISTS idx_eva_event_log_status ON eva_event_log(status);
CREATE INDEX IF NOT EXISTS idx_eva_event_log_job ON eva_event_log(job_name) WHERE job_name IS NOT NULL;

-- RLS
ALTER TABLE eva_event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on eva_event_log"
  ON eva_event_log FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can read eva_event_log"
  ON eva_event_log FOR SELECT
  USING (auth.role() = 'authenticated');
