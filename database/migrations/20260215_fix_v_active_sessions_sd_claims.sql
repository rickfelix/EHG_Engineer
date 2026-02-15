-- Migration: SD-LEO-FIX-CLAIM-DUAL-TRUTH-001 (US-002)
-- Purpose: Update v_active_sessions to source SD data from sd_claims (authoritative)
--          instead of claude_sessions.sd_id (denormalized cache).
-- Date: 2026-02-15
-- Backward Compatible: Yes (COALESCE falls back to claude_sessions.sd_id)

DROP VIEW IF EXISTS v_active_sessions CASCADE;

CREATE VIEW v_active_sessions AS
SELECT
  cs.id,
  cs.session_id,
  -- SD-LEO-FIX-CLAIM-DUAL-TRUTH-001: sd_claims is authoritative for claim ownership.
  -- Fall back to claude_sessions.sd_id for backward compatibility during migration.
  COALESCE(sc.sd_id, cs.sd_id) as sd_id,
  sd.title as sd_title,
  COALESCE(sc.track, cs.track) as track,
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
    WHEN COALESCE(sc.sd_id, cs.sd_id) IS NULL THEN 'idle'
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
LEFT JOIN sd_claims sc ON cs.session_id = sc.session_id AND sc.released_at IS NULL
LEFT JOIN strategic_directives_v2 sd ON COALESCE(sc.sd_id, cs.sd_id) = sd.sd_key
WHERE cs.status NOT IN ('released')
ORDER BY cs.track NULLS LAST, cs.claimed_at DESC;

COMMENT ON VIEW v_active_sessions IS
  'Active sessions with SD data sourced from sd_claims (authoritative). Falls back to claude_sessions.sd_id for backward compatibility.';

-- Verification
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'v_active_sessions' AND column_name = 'sd_id'
  ) THEN
    RAISE NOTICE 'SUCCESS: v_active_sessions view recreated with sd_claims join';
  ELSE
    RAISE WARNING 'FAILED: v_active_sessions view missing sd_id column';
  END IF;
END $$;
