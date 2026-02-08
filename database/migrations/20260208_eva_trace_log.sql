-- Eva Trace Log - Observability for Eva Orchestrator
-- SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-002-E
--
-- Stores structured traces from processStage() operations:
-- spans (timed sub-operations), events, and cross-operation correlation.

-- ── Table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eva_trace_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trace_id UUID NOT NULL,
  parent_trace_id UUID,
  venture_id UUID REFERENCES ventures(id),
  spans JSONB DEFAULT '[]'::jsonb,
  events JSONB DEFAULT '[]'::jsonb,
  total_duration_ms INTEGER,
  span_count INTEGER DEFAULT 0,
  event_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_eva_trace_log_trace_id
  ON eva_trace_log(trace_id);

CREATE INDEX IF NOT EXISTS idx_eva_trace_log_venture_id
  ON eva_trace_log(venture_id);

CREATE INDEX IF NOT EXISTS idx_eva_trace_log_parent_trace_id
  ON eva_trace_log(parent_trace_id)
  WHERE parent_trace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eva_trace_log_created_at
  ON eva_trace_log(created_at);

-- ── Eva Events table (if not exists) ─────────────────────────
-- Some installations may already have eva_events; this is idempotent.

CREATE TABLE IF NOT EXISTS eva_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  trace_id UUID,
  venture_id UUID REFERENCES ventures(id),
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eva_events_trace_id
  ON eva_events(trace_id)
  WHERE trace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eva_events_venture_id
  ON eva_events(venture_id);

CREATE INDEX IF NOT EXISTS idx_eva_events_event_type
  ON eva_events(event_type);

-- ── RLS ──────────────────────────────────────────────────────

ALTER TABLE eva_trace_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE eva_events ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY IF NOT EXISTS "service_role_all_eva_trace_log"
  ON eva_trace_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "service_role_all_eva_events"
  ON eva_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── Comments ─────────────────────────────────────────────────

COMMENT ON TABLE eva_trace_log IS 'Structured traces from Eva Orchestrator processStage() operations';
COMMENT ON COLUMN eva_trace_log.trace_id IS 'Unique identifier for this trace (correlates all spans/events)';
COMMENT ON COLUMN eva_trace_log.parent_trace_id IS 'Parent trace for cross-operation correlation';
COMMENT ON COLUMN eva_trace_log.spans IS 'Array of span objects with timing data';
COMMENT ON COLUMN eva_trace_log.events IS 'Array of event objects emitted during processing';
