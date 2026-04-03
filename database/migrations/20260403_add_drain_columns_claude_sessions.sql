-- Add columns for parallel drain agent support
-- SD: SD-LEO-INFRA-PARALLEL-AGENT-QUEUE-001

ALTER TABLE claude_sessions
  ADD COLUMN IF NOT EXISTS is_virtual BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS parent_session_id TEXT REFERENCES claude_sessions(session_id),
  ADD COLUMN IF NOT EXISTS agent_slot INTEGER,
  ADD COLUMN IF NOT EXISTS last_progress_at TIMESTAMPTZ;

-- Index for querying virtual sessions by parent
CREATE INDEX IF NOT EXISTS idx_claude_sessions_parent_session
  ON claude_sessions(parent_session_id)
  WHERE parent_session_id IS NOT NULL;

-- Index for virtual session stale sweep (different threshold)
CREATE INDEX IF NOT EXISTS idx_claude_sessions_virtual_stale
  ON claude_sessions(heartbeat_at)
  WHERE is_virtual = TRUE AND status = 'active';

COMMENT ON COLUMN claude_sessions.is_virtual IS 'True for drain agent virtual sessions';
COMMENT ON COLUMN claude_sessions.parent_session_id IS 'Links virtual agent session to parent drainer session';
COMMENT ON COLUMN claude_sessions.agent_slot IS 'Slot index (0, 1, 2) within parent drainer';
COMMENT ON COLUMN claude_sessions.last_progress_at IS 'Updated on meaningful work completion (phase transition, PR)';
