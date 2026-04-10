-- Migration: Update v_active_sessions stale threshold from 300s to 600s
-- Reason: Board consensus — 10min = 2x heartbeat interval (matches stale-threshold.js default)
-- Idempotent: CREATE OR REPLACE VIEW
-- Rollback: Replace 600 with 300 in seconds_until_stale and computed_status CASE

CREATE OR REPLACE VIEW v_active_sessions AS
SELECT cs.id,
    cs.session_id,
    cs.sd_id,
    COALESCE(sd.title, qf.title::character varying) AS sd_title,
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
    EXTRACT(epoch FROM now() - cs.heartbeat_at) AS heartbeat_age_seconds,
    EXTRACT(epoch FROM now() - cs.heartbeat_at) / 60.0 AS heartbeat_age_minutes,
    GREATEST(0::numeric, 600.0 - EXTRACT(epoch FROM now() - cs.heartbeat_at)) AS seconds_until_stale,
        CASE
            WHEN cs.status = 'released'::text THEN 'released'::text
            WHEN cs.status = 'stale'::text THEN 'stale'::text
            WHEN EXTRACT(epoch FROM now() - cs.heartbeat_at) > 600::numeric THEN 'stale'::text
            WHEN cs.sd_id IS NULL THEN 'idle'::text
            ELSE 'active'::text
        END AS computed_status,
        CASE
            WHEN cs.claimed_at IS NOT NULL THEN EXTRACT(epoch FROM now() - cs.claimed_at) / 60.0
            ELSE NULL::numeric
        END AS claim_duration_minutes,
        CASE
            WHEN EXTRACT(epoch FROM now() - cs.heartbeat_at) < 60::numeric THEN EXTRACT(epoch FROM now() - cs.heartbeat_at)::integer || 's ago'::text
            WHEN EXTRACT(epoch FROM now() - cs.heartbeat_at) < 3600::numeric THEN (EXTRACT(epoch FROM now() - cs.heartbeat_at) / 60.0)::integer || 'm ago'::text
            ELSE (EXTRACT(epoch FROM now() - cs.heartbeat_at) / 3600.0)::integer || 'h ago'::text
        END AS heartbeat_age_human,
    cs.is_virtual,
    cs.parent_session_id
   FROM claude_sessions cs
     LEFT JOIN strategic_directives_v2 sd ON cs.sd_id = sd.sd_key
     LEFT JOIN quick_fixes qf ON cs.sd_id = qf.id
  WHERE cs.status <> 'released'::text
  ORDER BY cs.track, cs.claimed_at DESC;

COMMENT ON VIEW v_active_sessions IS 'Active sessions view with 600s (10min) stale threshold — 2x heartbeat interval';
