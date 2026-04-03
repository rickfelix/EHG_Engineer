-- Migration: Add virtual session support for SD Queue Drainer
-- SD: SD-LEO-INFRA-PARALLEL-AGENT-QUEUE-001
-- Date: 2026-04-03
--
-- Adds columns to claude_sessions for drain agent virtual sessions:
-- - is_virtual: distinguishes drain agents from real terminal sessions
-- - parent_session_id: links agent to its parent drainer session
-- - agent_slot: slot index (0, 1, 2) within the drainer
-- - last_progress_at: meaningful work completion timestamp (not just liveness)

-- Add columns (idempotent with IF NOT EXISTS via DO block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'claude_sessions' AND column_name = 'is_virtual') THEN
    ALTER TABLE claude_sessions ADD COLUMN is_virtual BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'claude_sessions' AND column_name = 'parent_session_id') THEN
    ALTER TABLE claude_sessions ADD COLUMN parent_session_id TEXT REFERENCES claude_sessions(session_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'claude_sessions' AND column_name = 'agent_slot') THEN
    ALTER TABLE claude_sessions ADD COLUMN agent_slot INTEGER;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'claude_sessions' AND column_name = 'last_progress_at') THEN
    ALTER TABLE claude_sessions ADD COLUMN last_progress_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add index for efficient virtual session queries
CREATE INDEX IF NOT EXISTS idx_claude_sessions_virtual
  ON claude_sessions (parent_session_id)
  WHERE is_virtual = TRUE;

-- Add index for stale virtual session sweep (3-min threshold)
CREATE INDEX IF NOT EXISTS idx_claude_sessions_virtual_heartbeat
  ON claude_sessions (heartbeat_at)
  WHERE is_virtual = TRUE AND status IN ('active', 'idle');

COMMENT ON COLUMN claude_sessions.is_virtual IS 'True for drain agent virtual sessions (3-min stale threshold vs 15-min default)';
COMMENT ON COLUMN claude_sessions.parent_session_id IS 'References the real session running the sd:drain command';
COMMENT ON COLUMN claude_sessions.agent_slot IS 'Slot index (0-2) within the parent drainer';
COMMENT ON COLUMN claude_sessions.last_progress_at IS 'Updated on meaningful work completion (handoff, commit, test pass) — distinct from heartbeat liveness';
