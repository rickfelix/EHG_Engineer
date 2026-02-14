-- ============================================================
-- Migration: Update stale threshold from 5 minutes to 15 minutes
-- Date: 2026-02-14
-- Purpose: Increase session staleness threshold from 300s (5min)
--          to 900s (15min) in v_active_sessions view to match
--          the JS-side changes in claim-guard.mjs and
--          session-manager.mjs. Prevents premature stale marking
--          during long-running operations.
-- ============================================================

-- Drop and recreate with updated threshold (300 → 900)
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
  GREATEST(0, 900 - EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at))) as seconds_until_stale,
  CASE
    WHEN cs.status = 'released' THEN 'released'
    WHEN cs.status = 'stale' THEN 'stale'
    WHEN EXTRACT(EPOCH FROM (NOW() - cs.heartbeat_at)) > 900 THEN 'stale'
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
  'Active sessions with SD title, terminal identity, staleness info, branch tracking, and lifecycle timestamps. Stale threshold: 900s (15min).';

-- Verification
DO $$
BEGIN
  -- Verify the stale threshold is 900 (not 300)
  IF EXISTS (
    SELECT 1 FROM pg_views
    WHERE viewname = 'v_active_sessions'
    AND definition LIKE '%900%'
  ) THEN
    RAISE NOTICE 'SUCCESS: v_active_sessions stale threshold updated to 900s (15min)';
  ELSE
    RAISE WARNING 'FAILED: v_active_sessions may still use old threshold';
  END IF;
END $$;
