-- Migration: Expose claim-owner liveness columns through v_active_sessions
-- SD: SD-LEO-INFRA-EXPOSE-CLAIM-OWNER-001 (FR-1)
--
-- Problem: claude_sessions already carries is_alive (PID-liveness check) and
-- has_uncommitted_changes (git working-tree dirty), but v_active_sessions did
-- not pass them through. Consumers therefore either re-derived liveness from
-- raw fields (creating the writer-consumer asymmetry RCA 269e55cc) or displayed
-- a placeholder. fleet-dashboard.cjs L396 already reads has_uncommitted_changes
-- and rendered a dash because the view never selected it — this migration
-- un-breaks that column.
--
-- Strictly additive. Two new columns appended at the end (positions 36, 37).
-- All pre-existing columns preserved with their original name, order, and
-- type. No rename, no drop, no reorder — CREATE OR REPLACE VIEW permits the
-- tail-append shape used here.
--
-- Live view shape (DO NOT MODIFY without re-checking pg_get_viewdef):
-- The view uses a two-layer LATERAL structure — an inner subquery (alias _v)
-- builds the SD/QF claim model, then an outer LEFT JOIN to claude_sessions
-- (alias _cs) tail-appends per-session passthrough columns. The outer-join
-- pattern was introduced by a prior migration to add loop_state (pos 35); this
-- migration follows the same pattern to tail-append is_alive and
-- has_uncommitted_changes (positions 36, 37) from the same outer join.
--
-- The inner subquery body (FROM line 91 onward, ending in
-- "ORDER BY cs.track, cs.claimed_at DESC) _v") is preserved verbatim from
-- 20260426_v_active_sessions_qf_claim_visibility.sql so the SD/QF claim model
-- is unchanged. The outer SELECT (lines 6-43) selects each inner column by
-- name in order, then appends the new ones — this is the shape that survives
-- CREATE OR REPLACE VIEW without "cannot change name of view column" errors.
--
-- Authoring note: an earlier draft of this migration was written against the
-- 20260426 baseline (34 columns ending at parent_session_id) and failed at
-- runtime because the live view has 35 columns (loop_state was added later via
-- the outer-join pattern). The reconciled DDL below was captured via
-- pg_get_viewdef() against dedlbzhpgkmetvhbkyzq on 2026-05-26 and is what
-- actually applied. If a future migration needs to add another passthrough
-- column, follow the same _cs outer-join pattern at the tail.
--
-- Rollback: replay 20260426_v_active_sessions_qf_claim_visibility.sql plus the
-- loop_state outer-join migration. No data backfill needed (read-model view).
--
-- Two-threshold model context: this view encodes the 600s DISPLAY-STALE
-- threshold deliberately; the 300s LIVENESS/CLAIM threshold lives in
-- lib/claim/stale-threshold.js. See SD-LEO-INFRA-EXPOSE-CLAIM-OWNER-001 FR-2.

CREATE OR REPLACE VIEW v_active_sessions AS
SELECT _v.id,
    _v.session_id,
    _v.sd_id,
    _v.sd_key,
    _v.sd_title,
    _v.qf_id,
    _v.qf_title,
    _v.qf_status,
    _v.track,
    _v.tty,
    _v.pid,
    _v.hostname,
    _v.codebase,
    _v.current_branch,
    _v.machine_id,
    _v.terminal_id,
    _v.terminal_identity,
    _v.claimed_at,
    _v.heartbeat_at,
    _v.status,
    _v.released_reason,
    _v.released_at,
    _v.stale_reason,
    _v.stale_at,
    _v.metadata,
    _v.created_at,
    _v.heartbeat_age_seconds,
    _v.heartbeat_age_minutes,
    _v.seconds_until_stale,
    _v.computed_status,
    _v.claim_duration_minutes,
    _v.heartbeat_age_human,
    _v.is_virtual,
    _v.parent_session_id,
    _cs.loop_state,
    -- SD-LEO-INFRA-EXPOSE-CLAIM-OWNER-001 (FR-1): liveness columns passthrough
    _cs.is_alive,
    _cs.has_uncommitted_changes
   FROM ( SELECT cs.id,
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
             LEFT JOIN quick_fixes qf_active ON qf_active.claiming_session_id = cs.session_id AND (qf_active.status = ANY (ARRAY['open'::text, 'in_progress'::text]))
          WHERE cs.status <> 'released'::text
          ORDER BY cs.track, cs.claimed_at DESC) _v
     LEFT JOIN claude_sessions _cs ON _cs.session_id = _v.session_id;

COMMENT ON VIEW v_active_sessions IS 'Active sessions view with 600s display-stale threshold (intentionally distinct from the 300s liveness/claim threshold in lib/claim/stale-threshold.js; see SD-LEO-INFRA-EXPOSE-CLAIM-OWNER-001 FR-2 for the two-threshold model). Surfaces SD claims (cs.sd_key), in-flight QF claims (quick_fixes.claiming_session_id), and base-table liveness signals (is_alive, has_uncommitted_changes) so consumers do not need to re-derive them.';

-- Reload PostgREST schema cache so the new columns are immediately visible
NOTIFY pgrst, 'reload schema';
