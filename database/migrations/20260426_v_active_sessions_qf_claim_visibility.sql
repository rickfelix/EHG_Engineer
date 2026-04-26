-- Migration: Extend v_active_sessions to surface QF-only session claims
-- SD: SD-LEO-INFRA-FLEET-DASHBOARD-VISIBILITY-001
--
-- Problem: Sessions whose only claim is a quick_fix (claiming_session_id set on
-- the quick_fixes row, status in ['open','in_progress']) currently appear as
-- 'idle' in v_active_sessions because the prior view only joined quick_fixes
-- via cs.sd_key = qf.id — a path no claim mechanism actually populates.
-- create-quick-fix.js writes claiming_session_id on the QF row, NOT cs.sd_key.
--
-- Fix: Add a LEFT JOIN on quick_fixes via claiming_session_id (the canonical
-- relationship), expose qf_id and qf_title, and update computed_status so a
-- session is 'idle' only when both sd_key AND qf_id are NULL.
--
-- Idempotent: DROP VIEW IF EXISTS + CREATE VIEW (transactional). CREATE OR
-- REPLACE VIEW alone fails on column reorder in Postgres ("cannot change name
-- of view column"). The new qf_id/qf_title/qf_status columns are inserted at
-- positions 6-8 (next to sd_title) for readability, which forces a recreate.
-- Wrapped in a single transaction so concurrent reads either see the old view
-- or the new view, never an absent view.
-- Backward-compatible: all pre-existing columns preserved (including the
-- legacy COALESCE(sd.title, qf.title) sd_title and the cs.sd_key=qf.id JOIN).
-- Rollback: replay the prior view definition from
-- 20260406_v_active_sessions_stale_threshold_600s.sql.

BEGIN;

DROP VIEW IF EXISTS v_active_sessions CASCADE;

CREATE VIEW v_active_sessions AS
SELECT cs.id,
    cs.session_id,
    cs.sd_key AS sd_id,
    cs.sd_key,
    COALESCE(sd.title, qf.title::character varying) AS sd_title,
    qf_active.id AS qf_id,
    qf_active.title AS qf_title,
    qf_active.status AS qf_status,
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
            WHEN cs.sd_key IS NULL AND qf_active.id IS NULL THEN 'idle'::text
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
     LEFT JOIN strategic_directives_v2 sd ON cs.sd_key = sd.sd_key
     LEFT JOIN quick_fixes qf ON cs.sd_key = qf.id
     LEFT JOIN quick_fixes qf_active ON qf_active.claiming_session_id = cs.session_id
       AND qf_active.status IN ('open', 'in_progress')
  WHERE cs.status <> 'released'::text
  ORDER BY cs.track, cs.claimed_at DESC;

COMMENT ON VIEW v_active_sessions IS 'Active sessions view with 600s stale threshold. Surfaces both SD claims (cs.sd_key) and in-flight QF claims (quick_fixes.claiming_session_id) — sessions are idle only when neither is set.';

COMMIT;

-- Reload PostgREST schema cache so the new columns are immediately visible
NOTIFY pgrst, 'reload schema';
