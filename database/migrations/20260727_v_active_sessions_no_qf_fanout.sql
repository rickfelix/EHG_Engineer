-- 20260727_v_active_sessions_no_qf_fanout.sql
-- QF-20260727-574 — the sessions page rendered a session TWICE.
--
-- THE FAN-OUT. v_active_sessions joined quick_fixes with a plain LEFT JOIN on
-- claiming_session_id. A LEFT JOIN against a NON-UNIQUE right side multiplies rows: one session
-- holding N open-or-in_progress quick fixes produced N rows for that session, and
-- server/routes/fleet-panel.js reads this view, so the chairman's page rendered that session N times.
--
-- MEASURED LIVE BEFORE CHANGING ANYTHING, and the correspondence was exact: at 2026-07-27T21:38:42Z
-- exactly ONE session held more than one qualifying quick fix (b25ec3e5, 2 of them), and exactly
-- that same session was the ONLY duplicated session_id in the view (2 rows). The fan-out set equals
-- the multi-QF set — causal, not merely correlated.
--
-- WHY NOT A BARE EXISTS, WHICH IS WHAT THE TICKET PRESCRIBED. The ticket said qf_active "is used
-- only to compute idle-vs-active in a CASE expression". Reading the view says otherwise: qf_active
-- also PROJECTS THREE OUTPUT COLUMNS — qf_id, qf_title, qf_status. Replacing it with EXISTS would
-- have silently dropped them, and they have live consumers:
--   scripts/modules/sd-next/display/claim-formatters.js:43,49 renders [QF] ${s.qf_title || s.qf_id}
--   scripts/sd-start.js:257 selects qf_id, qf_title from this view
-- So the correct shape preserves the columns while refusing to multiply rows.
--
-- LEFT JOIN LATERAL ... LIMIT 1 does exactly that: at most one qf_active row per session, all three
-- columns intact, and the computed_status CASE (which tests qf_active.id IS NULL) keeps its meaning
-- because "at least one qualifying QF exists" is still expressed faithfully.
--
-- THE ORDERING IS DETERMINISTIC ON PURPOSE. Without a total order the view could pick a different
-- quick fix between renders and the page would flicker between titles for no reason. in_progress
-- sorts first because that is the one actually being worked; created_at then id break every
-- remaining tie, and id is unique, so the choice is stable.
--
-- NOT FIXED DOWNSTREAM WITH DISTINCT. A DISTINCT in fleet-panel.js would hide the fan-out from that
-- one caller while leaving it live for every other consumer of this view — the ticket names this
-- and it is right.
--
-- OUT OF SCOPE, recorded so it is not mistaken for part of this change: the view returns 5,922 rows
-- because its WHERE is cs.status <> 'released' — i.e. every non-released session ever, with
-- "active" as a COMPUTED COLUMN rather than a filter. That is a naming/contract question, separately
-- handed over unclassified, and is deliberately NOT touched here.

CREATE OR REPLACE VIEW public.v_active_sessions AS
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
             LEFT JOIN LATERAL (
                            SELECT q.id, q.title, q.status
                              FROM quick_fixes q
                             WHERE q.claiming_session_id = cs.session_id
                               AND q.status = ANY (ARRAY['open'::text, 'in_progress'::text])
                             ORDER BY (q.status = 'in_progress'::text) DESC, q.created_at ASC, q.id ASC
                             LIMIT 1
                          ) qf_active ON true
          WHERE cs.status <> 'released'::text
          ORDER BY cs.track, cs.claimed_at DESC) _v
     LEFT JOIN claude_sessions _cs ON _cs.session_id = _v.session_id;
