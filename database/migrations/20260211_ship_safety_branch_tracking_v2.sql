-- ============================================================
-- Migration: Ship Safety Branch Tracking (v2 - Safe View Recreation)
-- SD: SD-LEO-FIX-MULTI-SESSION-SHIP-001
-- Date: 2026-02-11
-- Purpose: Add first-class branch tracking to claude_sessions
--          for multi-session ship safety
-- ============================================================

-- 1. Add current_branch column to claude_sessions
ALTER TABLE claude_sessions ADD COLUMN IF NOT EXISTS current_branch TEXT;

-- 2. Create or replace the heartbeat RPC to include branch
CREATE OR REPLACE FUNCTION update_session_heartbeat_with_branch(
  p_session_id TEXT,
  p_branch TEXT DEFAULT NULL
) RETURNS void AS $$
BEGIN
  UPDATE claude_sessions
  SET heartbeat_at = NOW(),
      updated_at = NOW(),
      current_branch = COALESCE(p_branch, current_branch)
  WHERE session_id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Drop and recreate v_active_sessions view to include current_branch
DROP VIEW IF EXISTS v_active_sessions CASCADE;

CREATE VIEW v_active_sessions AS
SELECT
  cs.session_id,
  cs.status,
  cs.sd_id,
  cs.hostname,
  cs.tty,
  cs.pid,
  cs.codebase,
  cs.current_branch,
  cs.heartbeat_at,
  cs.created_at,
  cs.updated_at,
  cs.metadata,
  EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at))::INTEGER AS heartbeat_age_seconds,
  CASE
    WHEN EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) < 60
      THEN EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at))::INTEGER || 's ago'
    WHEN EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) < 3600
      THEN (EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) / 60)::INTEGER || 'm ago'
    ELSE (EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) / 3600)::INTEGER || 'h ago'
  END AS heartbeat_age_human,
  GREATEST(0, 300 - EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)))::INTEGER AS seconds_until_stale,
  CASE
    WHEN cs.status = 'released' THEN 'released'
    WHEN EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) > 300 THEN 'stale'
    WHEN cs.sd_id IS NULL THEN 'idle'
    ELSE 'active'
  END AS computed_status
FROM claude_sessions cs
WHERE cs.status IN ('active', 'idle', 'released')
ORDER BY cs.heartbeat_at DESC;

-- 4. Backfill current_branch from metadata.branch for existing sessions
UPDATE claude_sessions
SET current_branch = metadata->>'branch'
WHERE current_branch IS NULL
  AND metadata->>'branch' IS NOT NULL;

-- 5. Add comment for documentation
COMMENT ON COLUMN claude_sessions.current_branch IS 'Current git branch, updated by heartbeat. Used for multi-session ship safety.';
