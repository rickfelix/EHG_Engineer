-- Migration: EVA Orchestration Events Table
-- SD: SD-EVA-FEAT-CHAIRMAN-DASHBOARD-001
-- Purpose: Stores EVA orchestration lifecycle events for Chairman Event Feed panel
--          Enables real-time event streaming via Supabase Realtime

-- Step 1: Create the events table
CREATE TABLE IF NOT EXISTS eva_orchestration_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  event_source TEXT NOT NULL DEFAULT 'eva_orchestrator',
  venture_id UUID REFERENCES ventures(id) ON DELETE SET NULL,
  event_data JSONB NOT NULL DEFAULT '{}',
  chairman_flagged BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 2: Add CHECK constraint for known event types
ALTER TABLE eva_orchestration_events
  ADD CONSTRAINT chk_event_type CHECK (
    event_type IN (
      'stage_completed',
      'stage_started',
      'decision_requested',
      'decision_resolved',
      'escalation',
      'dfe_triggered',
      'agent_communication',
      'health_score_changed',
      'venture_created',
      'venture_status_changed',
      'chairman_override',
      'gate_passed',
      'gate_failed',
      'custom'
    )
  );

-- Step 3: Indexes for query patterns
CREATE INDEX IF NOT EXISTS idx_eva_orch_events_created
  ON eva_orchestration_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_eva_orch_events_type
  ON eva_orchestration_events (event_type);

CREATE INDEX IF NOT EXISTS idx_eva_orch_events_venture
  ON eva_orchestration_events (venture_id)
  WHERE venture_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eva_orch_events_flagged
  ON eva_orchestration_events (chairman_flagged, created_at DESC)
  WHERE chairman_flagged = true;

-- Step 4: Enable Realtime for live Event Feed
ALTER PUBLICATION supabase_realtime ADD TABLE eva_orchestration_events;

-- Step 5: RLS policies
ALTER TABLE eva_orchestration_events ENABLE ROW LEVEL SECURITY;

-- Service role can do everything
CREATE POLICY eva_orch_events_service_all
  ON eva_orchestration_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read events
CREATE POLICY eva_orch_events_auth_select
  ON eva_orchestration_events
  FOR SELECT
  TO authenticated
  USING (true);

-- Step 6: Comment on table
COMMENT ON TABLE eva_orchestration_events IS 'EVA orchestration lifecycle events for Chairman Dashboard Event Feed. Real-time enabled.';
COMMENT ON COLUMN eva_orchestration_events.event_type IS 'Type of orchestration event (stage_completed, escalation, dfe_triggered, etc.)';
COMMENT ON COLUMN eva_orchestration_events.event_source IS 'Source system/agent that generated the event';
COMMENT ON COLUMN eva_orchestration_events.event_data IS 'JSONB payload with event-specific data (venture_name, stage_number, scores, etc.)';
COMMENT ON COLUMN eva_orchestration_events.chairman_flagged IS 'Whether this event requires Chairman attention (highlighted in Event Feed)';
