-- Migration: Expose the four liveness-ladder inputs the view was hiding
-- SD: SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001 (FR-2d)
--
-- PROBLEM, MEASURED. lib/fleet/session-liveness.cjs is the read-time liveness SSOT and
-- its ladder is:
--     is_alive OR fresh_heartbeat OR hasPidAlive OR hasTickAlive OR hasExpectedSilence
-- Three of those five rungs read columns that v_active_sessions never selected:
--     hasTickAlive       -> session.process_alive_at      (absent -> hard false)
--     hasExpectedSilence -> session.expected_silence_until (absent -> hard false)
-- and two more that consumers need to explain or audit a verdict:
--     updated_at         -> distinguishes a narrow targeted write from a row update
--     pid_validated_at   -> when the PID rung last rendered a verdict
--
-- Verified against the live view on 2026-07-27: all four are MISSING (37 columns,
-- ending at has_uncommitted_changes). Because `session.process_alive_at` is simply
-- undefined on a view row, hasTickAlive/hasExpectedSilence return false WITHOUT
-- EVER EVALUATING their thresholds. Every view-backed consumer therefore runs a
-- silently DEGRADED ladder:
--     is_alive OR fresh_heartbeat OR hasPidAlive
-- and until this SD's C2 child landed, hasPidAlive resolved 0 of 12 rows — leaving
-- is_alive OR fresh_heartbeat, i.e. only the forgeable legs, as the whole ladder.
-- This is the "a check that cannot see the constraint is not evidence of absence"
-- failure in schema form: the rung did not fail, it was never asked.
--
-- The four columns all exist on claude_sessions (confirmed live) — nothing is
-- computed or backfilled here. This migration only stops hiding them.
--
-- STRICTLY ADDITIVE. Four columns tail-appended at positions 38-41 via the SAME
-- _cs outer-join pattern established by 20260526_v_active_sessions_expose_liveness.sql
-- (which itself documents that this is the shape CREATE OR REPLACE VIEW accepts
-- without "cannot change name of view column"). All 37 pre-existing columns keep
-- their original name, order and type. No rename, no drop, no reorder.
--
-- The inner subquery (_v) is preserved VERBATIM from 20260526 — the SD/QF claim
-- model is untouched, as is the 600s display-stale threshold, which remains
-- deliberately distinct from the 300s liveness/claim threshold in
-- lib/claim/stale-threshold.js (two-threshold model, SD-LEO-INFRA-EXPOSE-CLAIM-OWNER-001 FR-2).
--
-- Rollback: replay 20260727_v_active_sessions_no_qf_fanout.sql verbatim (NOT the 20260526 file --
-- see the rebase note below; rolling back to 20260526 would re-open the QF fan-out).
-- No data migration (read-model view only).
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- REBASED 2026-07-27 ONTO QF-20260727-574, WHICH LANDED ON MAIN WHILE THIS SD WAS IN FLIGHT.
--
-- TWO FULL `CREATE OR REPLACE VIEW v_active_sessions` STATEMENTS, SAME DAY, SAME VIEW. Git merged
-- them without a conflict because they are SEPARATE FILES -- but a view has ONE definition, so
-- whichever is applied last wins OUTRIGHT. This file previously carried the pre-fanout-fix body
-- (a plain `LEFT JOIN quick_fixes qf_active`), so applying it after QF-20260727-574 would have
-- SILENTLY REVERTED that fix and restored duplicate sessions on the chairman's page. A clean
-- git merge is not evidence of semantic compatibility.
--
-- MEASURED, NOT ASSUMED. Read live at 2026-07-27T20:5xZ, BEFORE editing:
--   process_alive_at / updated_at / expected_silence_until / pid_validated_at -> ALL MISSING
--   qf_id / qf_title / qf_status                                             -> PRESENT
--   duplicated session_ids in 1000 sampled rows                              -> 0
-- i.e. the live view is QF-20260727-574's definition, and FR-2d IS NOT APPLIED. The ladder is
-- still silently degraded in production right now.
--
-- WHY THAT MATTERS FOR THIS SD SPECIFICALLY. The FR-2d test asserts the migration TEXT (hermetic)
-- and its live-parity block ABSTAINS with no designated non-prod target, so NOTHING in CI can
-- observe whether this view was ever applied. Shipping on a green suite alone would reproduce, in
-- this SD, the exact failure it was written to eliminate: a documented partial that reads complete.
-- THIS FILE BEING MERGED IS NOT THE FIX TAKING EFFECT -- it must be APPLIED to the database.
--
-- The composition below is the sibling's LATERAL body with FR-2d's four `_cs.*` columns
-- tail-appended. Both prior definitions descend from 20260526 and are otherwise character-identical,
-- so this is the union of the two, not a third variant.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

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
    _cs.has_uncommitted_changes,
    -- SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001 (FR-2d): the ladder's own inputs.
    -- Without these, hasTickAlive and hasExpectedSilence are hard-false for every
    -- view-backed consumer and the ladder silently degrades to its forgeable legs.
    _cs.process_alive_at,
    _cs.updated_at,
    _cs.expected_silence_until,
    _cs.pid_validated_at
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
             -- REBASED ONTO QF-20260727-574 (see header). This LATERAL ... LIMIT 1 is that fix,
             -- carried VERBATIM. It was a plain `LEFT JOIN quick_fixes qf_active ON ...` here until
             -- 2026-07-27; against a non-unique right side that multiplies rows, so a session
             -- holding N open QFs rendered N times on the chairman's page.
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

COMMENT ON VIEW v_active_sessions IS 'Active sessions view with 600s display-stale threshold (intentionally distinct from the 300s liveness/claim threshold in lib/claim/stale-threshold.js; see SD-LEO-INFRA-EXPOSE-CLAIM-OWNER-001 FR-2 for the two-threshold model). Surfaces SD claims (cs.sd_key), in-flight QF claims (quick_fixes.claiming_session_id), and the full read-time liveness ladder inputs (is_alive, has_uncommitted_changes, process_alive_at, expected_silence_until, pid_validated_at, updated_at) so a view-backed consumer of lib/fleet/session-liveness.cjs reaches the SAME verdict as a table-backed one instead of silently running a degraded ladder (SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001 FR-2d).';

-- Reload PostgREST schema cache so the new columns are immediately visible
NOTIFY pgrst, 'reload schema';
