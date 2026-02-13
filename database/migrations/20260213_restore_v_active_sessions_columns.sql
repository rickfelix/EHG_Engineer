-- ============================================================
-- Migration: Restore v_active_sessions columns lost in ship-safety migration
-- RCA: sd-start claim failures due to schema drift
-- Date: 2026-02-13
-- Purpose: Restore sd_title, track, heartbeat_age_minutes, and other
--          columns that were removed when the view was recreated in
--          20260211_ship_safety_branch_tracking_v2.sql.
--          Also adds current_branch which that migration intended to add.
-- ============================================================

-- Drop and recreate with FULL column set (original + current_branch)
DROP VIEW IF EXISTS v_active_sessions CASCADE;

CREATE VIEW v_active_sessions AS
SELECT
  cs.id,
  cs.session_id,
  cs.sd_id,
  sd.title as sd_title,
  cs.track,
  cs.tty,
  cs.pid,
  cs.hostname,
  cs.codebase,
  cs.current_branch,
  cs.machine_id,
  cs.terminal_id,
  cs.terminal_identity,
  cs.claimed_at,
  cs.heartbeat_at,
  cs.status,
  cs.released_reason,
  cs.released_at,
  cs.stale_reason,
  cs.stale_at,
  cs.metadata,
  cs.created_at,
  EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) as heartbeat_age_seconds,
  EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) / 60 as heartbeat_age_minutes,
  GREATEST(0, 300 - EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at))) as seconds_until_stale,
  CASE
    WHEN cs.status = 'released' THEN 'released'
    WHEN cs.status = 'stale' THEN 'stale'
    WHEN EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) > 300 THEN 'stale'
    WHEN cs.sd_id IS NULL THEN 'idle'
    ELSE 'active'
  END as computed_status,
  CASE
    WHEN cs.claimed_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (NOW() - cs.claimed_at)) / 60
    ELSE NULL
  END as claim_duration_minutes,
  CASE
    WHEN EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) < 60 THEN
      EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at))::int || 's ago'
    WHEN EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) < 3600 THEN
      (EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) / 60)::int || 'm ago'
    ELSE
      (EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) / 3600)::int || 'h ago'
  END as heartbeat_age_human
FROM claude_sessions cs
LEFT JOIN strategic_directives_v2 sd ON cs.sd_id = sd.sd_key
WHERE cs.status NOT IN ('released')
ORDER BY cs.track NULLS LAST, cs.claimed_at DESC;

COMMENT ON VIEW v_active_sessions IS
  'Active sessions with SD title, terminal identity, staleness info, branch tracking, and lifecycle timestamps. Restored from 20260201 + current_branch from 20260211.';

-- Verification
DO $$
BEGIN
  -- Verify sd_title column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'v_active_sessions' AND column_name = 'sd_title'
  ) THEN
    RAISE NOTICE 'SUCCESS: v_active_sessions.sd_title column restored';
  ELSE
    RAISE WARNING 'FAILED: v_active_sessions.sd_title not found';
  END IF;

  -- Verify track column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'v_active_sessions' AND column_name = 'track'
  ) THEN
    RAISE NOTICE 'SUCCESS: v_active_sessions.track column restored';
  ELSE
    RAISE WARNING 'FAILED: v_active_sessions.track not found';
  END IF;

  -- Verify heartbeat_age_minutes column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'v_active_sessions' AND column_name = 'heartbeat_age_minutes'
  ) THEN
    RAISE NOTICE 'SUCCESS: v_active_sessions.heartbeat_age_minutes column restored';
  ELSE
    RAISE WARNING 'FAILED: v_active_sessions.heartbeat_age_minutes not found';
  END IF;

  -- Verify current_branch column exists (from ship-safety migration)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'v_active_sessions' AND column_name = 'current_branch'
  ) THEN
    RAISE NOTICE 'SUCCESS: v_active_sessions.current_branch column present';
  ELSE
    RAISE WARNING 'FAILED: v_active_sessions.current_branch not found';
  END IF;
END $$;
