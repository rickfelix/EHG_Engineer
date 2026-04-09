-- Migration: execute_teams table
-- SD: SD-MULTISESSION-EXECUTION-TEAM-COMMAND-ORCH-001-A (Phase 1 of /execute command)
-- Source: ARCH-EXECUTE-COMMAND-001 § Data Layer
--
-- Tracks team_id, supervisor PID, worker session IDs, status enum, and metadata
-- (slots, preflight results, circuit breaker history) for the /execute multi-session
-- execution team. Workers reference this table via execute_teams.worker_session_ids[].

CREATE TABLE IF NOT EXISTS execute_teams (
  team_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spawned_by_session   TEXT REFERENCES claude_sessions(session_id) ON DELETE SET NULL,
  supervisor_pid       INTEGER NOT NULL,
  supervisor_hostname  TEXT NOT NULL DEFAULT '',
  worker_count         INTEGER NOT NULL CHECK (worker_count BETWEEN 1 AND 8),
  worker_session_ids   TEXT[] NOT NULL DEFAULT '{}',
  status               TEXT NOT NULL CHECK (status IN ('pending_spawn','active','stopping','stopped','crashed','completed')),
  started_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stopped_at           TIMESTAMPTZ,
  stop_reason          TEXT,
  sds_completed        INTEGER NOT NULL DEFAULT 0,
  sds_failed           INTEGER NOT NULL DEFAULT 0,
  track_filter         TEXT CHECK (track_filter IN ('A','B','C','STANDALONE')),
  metadata             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execute_teams_active
  ON execute_teams(status)
  WHERE status IN ('active','stopping');

CREATE INDEX IF NOT EXISTS idx_execute_teams_started
  ON execute_teams(started_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION execute_teams_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_execute_teams_touch_updated_at ON execute_teams;
CREATE TRIGGER trg_execute_teams_touch_updated_at
  BEFORE UPDATE ON execute_teams
  FOR EACH ROW EXECUTE FUNCTION execute_teams_touch_updated_at();

-- RLS: SELECT for authenticated, all writes via service_role only
ALTER TABLE execute_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS execute_teams_select ON execute_teams;
CREATE POLICY execute_teams_select
  ON execute_teams
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS execute_teams_service_writes ON execute_teams;
CREATE POLICY execute_teams_service_writes
  ON execute_teams
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE execute_teams IS 'Multi-session execution teams spawned by /execute command. One row per team; status tracks lifecycle pending_spawn → active → stopping → stopped/crashed/completed. metadata.slots[] persists callsign/color across worker respawns.';
COMMENT ON COLUMN execute_teams.worker_session_ids IS 'Array of claude_sessions(session_id) text identifiers for each worker slot. Indexed by slot position.';
COMMENT ON COLUMN execute_teams.metadata IS 'JSONB containing: slots[] (slot identity persistence), preflight (health check results), circuit_breaker (rolling failure window).';
