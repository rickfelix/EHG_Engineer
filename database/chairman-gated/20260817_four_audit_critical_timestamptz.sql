-- @approved-by:
-- SD-LEO-INFRA-FOUR-AUDIT-CRITICAL-001 — timestamp -> timestamptz, 15 columns, 4 audit-critical tables.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE except at the named ceremony, and only
-- during a coordinator-scheduled QUIESCE WINDOW (see below).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AWAITING FRESH CHAIRMAN REVIEW (re-stage, 2026-08-22) — the PRIOR @approved-by (codestreetlabs@gmail.com,
-- chairman ruling A at terminal 2026-08-21 ~10:06Z) was exercised in the 2026-08-22 06:00Z quiesce
-- window and FAILED-AND-ROLLED-BACK (SQLSTATE 0A000, public.v_plan_item_position missing from the
-- DROP/CREATE envelope -- see the MAX-AGE GUARD section below). That approval covered the OLD
-- 11-object envelope, not this file's now-12-object content -- deliberately blanked per house
-- convention (never carry an approval stamp forward onto materially-changed SQL it never reviewed).
-- This re-staged version needs a FRESH chairman A before its next ceremony attempt. Chairman decision
-- 374fbb24 (GO/A, 2026-08-15) still authorizes BUILD of this staged migration; the ALTER itself is
-- applied ONLY at a chairman 3-factor ceremony.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- THE BUG THIS CLOSES
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- quick_fixes, sd_phase_handoffs, strategic_directives_v2, user_stories each carry a mix of
-- `timestamp without time zone` and `timestamp with time zone` columns. PostgREST returns naive
-- columns with NO offset designator; JavaScript parses an offset-less ISO string as LOCAL time per
-- spec, so on any non-UTC host every naive timestamp reads wrong by the host's UTC offset (witnessed
-- live: a 16-minute-old handoff computing "-225m ago"). All 15 columns below are live-confirmed
-- `timestamp without time zone` (PLAN VALIDATION evidence 5dcada29, zero drift either direction
-- against the 6 already-aware sibling columns on these same tables). This migration converts every
-- naive column on these 4 tables to timestamptz, closing the bug for every existing and future
-- reader at once rather than requiring per-reader compensation.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY EVERY STATEMENT CARRIES AN EXPLICIT USING CLAUSE (the single highest-value finding, PLAN
-- VALIDATION review, evidence 5dcada29; independently re-confirmed live via a TEMP-table proof —
-- database/chairman-gated/20260817_four_audit_critical_timestamptz_using_clause_proof.mjs)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- `ALTER COLUMN ... TYPE timestamptz` with no USING clause interprets each stored naive value
-- through the APPLYING SESSION's TimeZone GUC, not through the value's true meaning. Every value
-- stored in these columns today IS UTC (application-written, never locally-authored) — so an
-- unpinned ALTER run from a non-UTC session (e.g. an EDT-configured operator shell) would silently
-- and PERMANENTLY shift every historical timestamp by the session's offset, recreating at the row
-- level, irreversibly, the exact class of bug this migration exists to fix. Every statement below
-- pins interpretation explicitly: `USING <col> AT TIME ZONE 'UTC'`.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- DEPENDENT VIEWS/MATVIEWS — DROP/RECREATE ENVELOPE REQUIRED (DATABASE sub-agent review, evidence
-- 8c3ed611, EXEC phase — proven live via a TEMP TABLE + TEMP VIEW dependency reproduction;
-- RE-CENSUSED 2026-08-22 per the MAX-AGE GUARD above)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 10 of the 15 target columns are referenced by 12 dependent view/matview objects (2 in the
-- `governance` schema, invisible to a public-schema-only check). Without dropping these first,
-- `ALTER COLUMN TYPE` raises SQLSTATE 0A000 ("cannot alter type of a column used by a view or
-- rule") and the ceremony transaction aborts cleanly (no data risk — BEGIN/COMMIT means a failed
-- statement just rolls the whole transaction back) but never applies. The original 2026-08-17
-- census (11 objects) was NOT caught missing public.v_plan_item_position by the PLAN-phase
-- automated DATABASE sub-agent run (which found zero migration files, since none existed yet) — it
-- required a live review of the actual authored SQL, and that live review's own pg_depend scan
-- still missed one object, live-confirmed exactly by the 2026-08-22 ceremony's failure. THE
-- COORDINATION GAP: public.v_plan_item_position has existed since 2026-08-03
-- (SD-LEO-INFRA-PLAN-POSITION-READABLE-001) — it predates this migration's own chairman BUILD
-- decision (374fbb24, 2026-08-15) and its 2026-08-17 census, so this was a CENSUS-COMPLETENESS gap
-- in the original migration's own authoring, not a later SD shipping against an already-pending
-- target invisibly (that narrower framing does not match the actual timeline, checked directly
-- against git history — corrected here rather than carried forward unverified). Exact definitions
-- and grants for the original 11 captured live 2026-08-17; the 12th (v_plan_item_position) captured
-- live 2026-08-22 via the same pg_get_viewdef()/information_schema.role_table_grants method; each
-- object is recreated identically below. Two distinct grant shapes exist (public-schema views get
-- the full anon/authenticated/service_role set; the governance pair is narrower for anon); the 2
-- matviews carry NO explicit grants (owner-only) and need none re-applied. SEPARATE FINDING, not
-- fixed here: public.v_plan_item_position's live grants include DELETE/INSERT/UPDATE/TRUNCATE for
-- anon/authenticated on a read-only derived view — unusually broad for its purpose, flagged via
-- /signal feedback rather than narrowed unilaterally in a migration this SD did not originate.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SCOPE: 15 columns, 4 tables. OUT OF SCOPE: the 6 already-aware sibling columns on these same
-- tables (sd_phase_handoffs.resolved_at, strategic_directives_v2.{completion_date,
-- embedding_generated_at,quality_checked_at}, quick_fixes.not_before, user_stories.e2e_test_last_run)
-- and product_requirements_v2 (7 naive columns, orphaned by the SD-LEO-INFRA-NAIVE-TIMESTAMP-SKEW-001
-- fold — documented as a follow-up-SD candidate in this SD's PRD FR-6, not silently absorbed here).
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- QUIESCE WINDOW REQUIRED — these are 4 of the highest-write-frequency tables in the schema
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- `ALTER COLUMN ... TYPE` on a populated column is a full TABLE REWRITE requiring an ACCESS
-- EXCLUSIVE lock for the duration of the rewrite, not a metadata-only change (DATABASE sub-agent
-- review: total rewrite volume across all 4 tables is well under 400MB, so the direct-ALTER
-- approach — not an add-column/backfill/swap pattern — is the right call; a dual-write surface
-- across 4 audit-critical tables plus 11 view re-points would cost more than it buys here).
-- sd_phase_handoffs, strategic_directives_v2, quick_fixes, and user_stories are continuously
-- written by the live fleet. The chairman/coordinator MUST schedule this apply during a
-- coordinator-declared QUIESCE window (fleet writers paused, not merely "quiet") — under the ACCESS
-- EXCLUSIVE lock, a concurrent writer does NOT queue, it gets an immediate 55P03 lock-not-available
-- error (this transaction sets a 5s lock_timeout). This is an apply-time coordination concern the
-- ceremony packet (database/chairman-gated/README.md) documents but does not itself enforce.

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- MAX-AGE GUARD (re-stage, 2026-08-22, Solomon Shape Ruling option B) — the 2026-08-17 census
-- missed public.v_plan_item_position (live since 2026-08-03, SD-LEO-INFRA-PLAN-POSITION-READABLE-001
-- -- it predates even this migration's chairman BUILD decision 374fbb24 of 2026-08-15, so the
-- original DATABASE sub-agent scan was incomplete, not outrun by a later ship). The 2026-08-22
-- ceremony attempt failed and rolled back on exactly this (SQLSTATE 0A000). A fresh census taken
-- 2026-08-22 (script: scripts/one-off/census-timestamptz-four-audit-critical-deps.mjs, pg_depend-based, ALL schemas) now
-- finds 12 dependent objects; this file's DROP/CREATE envelope below is that fresh census. To stop
-- this failure class recurring silently, the migration now refuses to apply if its own census is
-- older than the ceremony window -- re-run the census and re-stage rather than trusting a stale list.
DO $census_guard$
DECLARE
  census_generated_at CONSTANT timestamptz := '2026-08-22T07:00:00Z';
  max_age_hours CONSTANT numeric := 48;
BEGIN
  IF now() - census_generated_at > (max_age_hours || ' hours')::interval THEN
    RAISE EXCEPTION 'MAX-AGE GUARD: dependent-view census generated at % is older than % hours (now=%) -- re-run scripts/one-off/census-timestamptz-four-audit-critical-deps.mjs and re-stage this migration with a fresh census_generated_at before applying', census_generated_at, max_age_hours, now();
  END IF;
END;
$census_guard$;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- STEP 1: Drop dependent views/matviews (none of these 12 objects depend on each other, so order
-- is not significant; non-CASCADE so an unexpected additional dependency fails loud rather than
-- silently cascading further).
-- ───────────────────────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS governance.v_governance_overview;
DROP VIEW IF EXISTS governance.v_phase_handoff_status;
DROP VIEW IF EXISTS public.legacy_handoff_executions_view;
DROP MATERIALIZED VIEW IF EXISTS public.mv_operations_dashboard;
DROP MATERIALIZED VIEW IF EXISTS public.mv_sd_summary;
DROP VIEW IF EXISTS public.strategic_directives_backlog;
DROP VIEW IF EXISTS public.v_active_sessions;
DROP VIEW IF EXISTS public.v_blocked_handoffs_pending;
DROP VIEW IF EXISTS public.v_plan_item_position;
DROP VIEW IF EXISTS public.v_sd_alignment_warnings;
DROP VIEW IF EXISTS public.v_sd_completion_integrity;
DROP VIEW IF EXISTS public.v_sds_needing_business_evaluation;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- STEP 2: The 15 column conversions, collapsed to 4 multi-clause ALTER TABLE statements (one per
-- table, per DATABASE sub-agent recommendation) rather than 15 single-clause statements.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE quick_fixes
  ALTER COLUMN completed_at TYPE timestamptz USING completed_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN started_at TYPE timestamptz USING started_at AT TIME ZONE 'UTC';

ALTER TABLE sd_phase_handoffs
  ALTER COLUMN accepted_at TYPE timestamptz USING accepted_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN rejected_at TYPE timestamptz USING rejected_at AT TIME ZONE 'UTC';

ALTER TABLE strategic_directives_v2
  ALTER COLUMN approval_date TYPE timestamptz USING approval_date AT TIME ZONE 'UTC',
  ALTER COLUMN archived_at TYPE timestamptz USING archived_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN effective_date TYPE timestamptz USING effective_date AT TIME ZONE 'UTC',
  ALTER COLUMN expiry_date TYPE timestamptz USING expiry_date AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';

ALTER TABLE user_stories
  ALTER COLUMN completed_at TYPE timestamptz USING completed_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- STEP 3: Recreate dependent views/matviews with IDENTICAL definitions (captured live 2026-08-17
-- via pg_get_viewdef(oid, true)) and grants (captured live via information_schema.role_table_grants).
-- ───────────────────────────────────────────────────────────────────────────────────────────────

CREATE VIEW governance.v_governance_overview AS
 SELECT sd.id AS sd_id,
    sd.sd_key,
    sd.title AS sd_title,
    sd.status AS sd_status,
    sd.priority,
    sd.current_phase,
    sd.progress_percentage,
    sd.category,
    prd.id AS prd_id,
    prd.title AS prd_title,
    prd.status AS prd_status,
    prd.version AS prd_version,
    sd.created_at AS sd_created,
    sd.updated_at AS sd_updated
   FROM strategic_directives_v2 sd
     LEFT JOIN product_requirements_v2 prd ON prd.sd_id::text = sd.id::text;
GRANT SELECT ON governance.v_governance_overview TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON governance.v_governance_overview TO authenticated;
GRANT ALL ON governance.v_governance_overview TO service_role;

CREATE VIEW governance.v_phase_handoff_status AS
 SELECT sd.id AS sd_id,
    sd.sd_key,
    sd.title AS sd_title,
    sd.current_phase,
    h.from_phase,
    h.to_phase,
    h.handoff_type,
    h.status AS handoff_status,
    h.validation_score,
    h.validation_passed,
    h.created_at AS handoff_created,
    h.accepted_at AS handoff_accepted
   FROM strategic_directives_v2 sd
     LEFT JOIN sd_phase_handoffs h ON h.sd_id::text = sd.id::text
  ORDER BY sd.sd_key, h.created_at;
GRANT SELECT ON governance.v_phase_handoff_status TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON governance.v_phase_handoff_status TO authenticated;
GRANT ALL ON governance.v_phase_handoff_status TO service_role;

CREATE VIEW public.legacy_handoff_executions_view AS
 SELECT sd_phase_handoffs.id,
    sd_phase_handoffs.sd_id,
    sd_phase_handoffs.handoff_type,
    sd_phase_handoffs.from_phase AS from_agent,
    sd_phase_handoffs.to_phase AS to_agent,
    sd_phase_handoffs.status,
    sd_phase_handoffs.created_at,
    sd_phase_handoffs.accepted_at,
    sd_phase_handoffs.metadata ->> 'migrated_from'::text AS migration_status,
        CASE
            WHEN (sd_phase_handoffs.metadata ->> 'migrated_from'::text) = 'leo_handoff_executions'::text THEN 'Migrated to sd_phase_handoffs'::text
            ELSE 'Legacy record'::text
        END AS record_status
   FROM sd_phase_handoffs
  WHERE (sd_phase_handoffs.metadata ->> 'migrated_from'::text) = 'leo_handoff_executions'::text
UNION ALL
 SELECT leo_handoff_executions.id,
    leo_handoff_executions.sd_id,
    leo_handoff_executions.handoff_type,
    leo_handoff_executions.from_agent,
    leo_handoff_executions.to_agent,
    leo_handoff_executions.status,
    leo_handoff_executions.created_at,
    leo_handoff_executions.accepted_at,
    'Not migrated'::text AS migration_status,
    'Legacy only - see leo_handoff_executions table'::text AS record_status
   FROM leo_handoff_executions
  WHERE NOT (leo_handoff_executions.id IN ( SELECT sd_phase_handoffs.id
           FROM sd_phase_handoffs));
GRANT ALL ON public.legacy_handoff_executions_view TO anon, authenticated, service_role;

CREATE MATERIALIZED VIEW public.mv_operations_dashboard AS
 SELECT date_trunc('minute'::text, now()) - (EXTRACT(second FROM now())::integer % 30)::double precision * '00:00:01'::interval AS time_bucket,
    count(DISTINCT sd.id) FILTER (WHERE sd.status::text = 'in_progress'::text) AS active_sds,
    count(DISTINCT sd.id) FILTER (WHERE sd.status::text = 'blocked'::text) AS blocked_sds,
    COALESCE(avg(sd.progress) FILTER (WHERE sd.status::text = 'in_progress'::text), 0::numeric) AS avg_progress,
    1250 AS avg_page_load_ms,
    145 AS avg_memory_mb,
    count(*) FILTER (WHERE oa.severity::text = 'critical'::text AND oa.performed_at > (now() - '01:00:00'::interval)) AS critical_security_events,
    count(*) FILTER (WHERE oa.module::text = 'security'::text AND oa.performed_at > (now() - '01:00:00'::interval)) AS recent_security_checks,
    94 AS data_quality_score,
    count(*) FILTER (WHERE oa.performed_at > (now() - '00:05:00'::interval)) AS recent_activity_count,
        CASE
            WHEN count(*) FILTER (WHERE oa.severity::text = 'critical'::text AND oa.performed_at > (now() - '01:00:00'::interval)) > 0 THEN 'critical'::text
            WHEN count(*) FILTER (WHERE oa.severity::text = 'error'::text AND oa.performed_at > (now() - '01:00:00'::interval)) > 5 THEN 'warning'::text
            ELSE 'healthy'::text
        END AS system_health_status,
    now() AS last_updated
   FROM operations_audit_log oa
     CROSS JOIN ( SELECT strategic_directives_v2.id,
            strategic_directives_v2.title,
            strategic_directives_v2.version,
            strategic_directives_v2.status,
            strategic_directives_v2.category,
            strategic_directives_v2.priority,
            strategic_directives_v2.description,
            strategic_directives_v2.strategic_intent,
            strategic_directives_v2.rationale,
            strategic_directives_v2.scope,
            strategic_directives_v2.key_changes,
            strategic_directives_v2.strategic_objectives,
            strategic_directives_v2.success_criteria,
            strategic_directives_v2.key_principles,
            strategic_directives_v2.implementation_guidelines,
            strategic_directives_v2.dependencies,
            strategic_directives_v2.risks,
            strategic_directives_v2.success_metrics,
            strategic_directives_v2.stakeholders,
            strategic_directives_v2.approved_by,
            strategic_directives_v2.approval_date,
            strategic_directives_v2.effective_date,
            strategic_directives_v2.expiry_date,
            strategic_directives_v2.review_schedule,
            strategic_directives_v2.created_at,
            strategic_directives_v2.updated_at,
            strategic_directives_v2.created_by,
            strategic_directives_v2.updated_by,
            strategic_directives_v2.metadata,
            strategic_directives_v2.h_count,
            strategic_directives_v2.m_count,
            strategic_directives_v2.l_count,
            strategic_directives_v2.future_count,
            strategic_directives_v2.must_have_count,
            strategic_directives_v2.wish_list_count,
            strategic_directives_v2.must_have_pct,
            strategic_directives_v2.rolled_triage,
            strategic_directives_v2.readiness,
            strategic_directives_v2.must_have_density,
            strategic_directives_v2.new_module_pct,
            strategic_directives_v2.import_run_id,
            strategic_directives_v2.present_in_latest_import,
            strategic_directives_v2.sequence_rank,
            strategic_directives_v2.sd_key,
            strategic_directives_v2.parent_sd_id,
            strategic_directives_v2.is_active,
            strategic_directives_v2.archived_at,
            strategic_directives_v2.archived_by,
            strategic_directives_v2.governance_metadata,
            strategic_directives_v2.target_application,
            strategic_directives_v2.progress,
            strategic_directives_v2.completion_date,
            strategic_directives_v2.current_phase,
            strategic_directives_v2.phase_progress,
            strategic_directives_v2.is_working_on,
            strategic_directives_v2.uuid_id
           FROM strategic_directives_v2
          WHERE strategic_directives_v2.status::text <> 'archived'::text) sd
  GROUP BY (date_trunc('minute'::text, now()) - (EXTRACT(second FROM now())::integer % 30)::double precision * '00:00:01'::interval);
-- No grants: live-captured GRANTS was empty (owner-only access, matches pre-migration state).

CREATE MATERIALIZED VIEW public.mv_sd_summary AS
 SELECT s.id,
    s.sd_key,
    s.title,
    s.status,
    s.priority,
    s.version,
    count(DISTINCT p.id) AS prd_count,
    count(DISTINCT us.id) AS story_count,
    max(p.updated_at) AS last_prd_update,
    max(us.updated_at) AS last_story_update
   FROM strategic_directives_v2 s
     LEFT JOIN product_requirements_v2 p ON s.id::text = p.sd_id::text OR s.id::text = p.directive_id::text
     LEFT JOIN user_stories us ON us.sd_id::text = s.id::text
  GROUP BY s.id, s.sd_key, s.title, s.status, s.priority, s.version;
-- No grants: live-captured GRANTS was empty (owner-only access, matches pre-migration state).

CREATE VIEW public.strategic_directives_backlog AS
 SELECT id AS sd_id,
    sequence_rank,
    title AS sd_title,
    category AS page_category,
    NULL::text AS page_title,
    ( SELECT count(*) AS count
           FROM sd_backlog_map m
          WHERE m.sd_id::text = v2.id::text) AS total_items,
    h_count,
    m_count,
    l_count,
    future_count,
    must_have_count,
    wish_list_count,
    must_have_pct,
    rolled_triage,
    readiness,
    must_have_density,
    new_module_pct,
    metadata AS extras,
    import_run_id,
    present_in_latest_import,
    created_at,
    updated_at
   FROM strategic_directives_v2 v2
  WHERE import_run_id IS NOT NULL;
GRANT ALL ON public.strategic_directives_backlog TO anon, authenticated, service_role;

CREATE VIEW public.v_active_sessions AS
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
    _cs.has_uncommitted_changes,
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
             LEFT JOIN LATERAL ( SELECT q.id,
                    q.title,
                    q.status
                   FROM quick_fixes q
                  WHERE q.claiming_session_id = cs.session_id AND (q.status = ANY (ARRAY['open'::text, 'in_progress'::text]))
                  ORDER BY (q.status = 'in_progress'::text) DESC, q.created_at, q.id
                 LIMIT 1) qf_active ON true
          WHERE cs.status <> 'released'::text
          ORDER BY cs.track, cs.claimed_at DESC) _v
     LEFT JOIN claude_sessions _cs ON _cs.session_id = _v.session_id;
GRANT ALL ON public.v_active_sessions TO anon, authenticated, service_role;

CREATE VIEW public.v_blocked_handoffs_pending AS
 SELECT h.id,
    h.sd_id,
    h.handoff_type,
    (h.from_phase::text || ' → '::text) || h.to_phase::text AS transition,
    h.validation_score,
    h.rejection_reason,
    h.created_at,
    EXTRACT(epoch FROM now() - h.created_at::timestamp with time zone) / 3600::numeric AS hours_blocked,
    h.metadata ->> 'remediation_hints'::text AS hints,
    sd.title AS sd_title,
    sd.status AS sd_status
   FROM sd_phase_handoffs h
     LEFT JOIN strategic_directives_v2 sd ON sd.id::text = h.sd_id::text
  WHERE h.status::text = 'blocked'::text
  ORDER BY h.created_at DESC;
GRANT ALL ON public.v_blocked_handoffs_pending TO anon, authenticated, service_role;

-- Added in the 2026-08-22 re-stage (fresh census -- missed by the original 2026-08-17 scan; this
-- view has existed since 2026-08-03, SD-LEO-INFRA-PLAN-POSITION-READABLE-001). Definition and
-- grants captured live 2026-08-22 via pg_get_viewdef()/information_schema.role_table_grants.
CREATE VIEW public.v_plan_item_position AS
 SELECT i.id AS item_id,
    i.wave_id,
    w.sequence_rank AS wave_sequence_rank,
    w.title AS wave_title,
    w.status AS wave_status,
    w.time_horizon,
    i.title AS item_title,
    i.item_disposition,
    i.promoted_to_sd_key AS child_sd_key,
    sd.status AS child_status,
    sd.current_phase AS child_phase,
    sd.claiming_session_id IS NOT NULL AS child_is_claimed,
    sd.claiming_session_id AS child_claiming_session_id,
    i.promoted_to_sd_key IS NOT NULL AND sd.sd_key IS NULL AS is_orphaned,
    GREATEST(i.updated_at, COALESCE(sd.updated_at::timestamp with time zone, i.updated_at)) AS last_advance_at
   FROM roadmap_wave_items i
     JOIN roadmap_waves w ON w.id = i.wave_id
     LEFT JOIN strategic_directives_v2 sd ON sd.sd_key = i.promoted_to_sd_key
  WHERE (w.roadmap_id IN ( SELECT strategic_roadmaps.id
           FROM strategic_roadmaps
          WHERE strategic_roadmaps.status::text = 'active'::text));
GRANT ALL ON public.v_plan_item_position TO anon, authenticated, service_role;

CREATE VIEW public.v_sd_alignment_warnings AS
 SELECT sd.id,
    sd.sd_key,
    sd.title,
    sd.status,
    sd.created_at,
    sd.priority,
        CASE
            WHEN sd.status::text = ANY (ARRAY['draft'::character varying, 'lead_review'::character varying]::text[]) THEN 'warning'::text
            WHEN sd.status::text = ANY (ARRAY['plan_active'::character varying, 'exec_active'::character varying, 'active'::character varying, 'in_progress'::character varying]::text[]) THEN 'critical'::text
            ELSE 'info'::text
        END AS severity,
    'SD has no Key Result alignment'::text AS message
   FROM strategic_directives_v2 sd
     LEFT JOIN sd_key_result_alignment ska ON sd.id::text = ska.sd_id::text
  WHERE sd.is_active = true AND (sd.status::text <> ALL (ARRAY['completed'::character varying, 'cancelled'::character varying, 'deferred'::character varying]::text[])) AND ska.id IS NULL
  ORDER BY (
        CASE
            WHEN sd.status::text = ANY (ARRAY['plan_active'::character varying, 'exec_active'::character varying, 'active'::character varying, 'in_progress'::character varying]::text[]) THEN 1
            WHEN sd.status::text = ANY (ARRAY['draft'::character varying, 'lead_review'::character varying]::text[]) THEN 2
            ELSE 3
        END), sd.created_at DESC;
GRANT ALL ON public.v_sd_alignment_warnings TO anon, authenticated, service_role;

CREATE VIEW public.v_sd_completion_integrity AS
 SELECT id,
    sd_key,
    uuid_id,
    status,
    current_phase,
    sd_type,
    updated_at,
    created_at,
    status::text = 'completed'::text AND (COALESCE(sd_type, ''::character varying)::text <> ALL (ARRAY['orchestrator'::character varying, 'documentation'::character varying, 'docs'::character varying]::text[])) AND NOT (EXISTS ( SELECT 1
           FROM sd_phase_handoffs sph
          WHERE sph.sd_id::text = sd.id::text AND (sph.handoff_type::text = ANY (ARRAY['LEAD-FINAL-APPROVAL'::character varying, 'BYPASS-COMPLETION'::character varying]::text[])) AND sph.status::text = 'accepted'::text)) AS is_ghost_completed,
    ( SELECT count(*)::integer AS count
           FROM sd_phase_handoffs sph
          WHERE sph.sd_id::text = sd.id::text AND sph.handoff_type::text = 'LEAD-FINAL-APPROVAL'::text AND sph.status::text = 'rejected'::text) AS lfa_rejected_count,
    ( SELECT max(sph.created_at) AS max
           FROM sd_phase_handoffs sph
          WHERE sph.sd_id::text = sd.id::text AND sph.handoff_type::text = 'LEAD-FINAL-APPROVAL'::text) AS lfa_last_attempted_at
   FROM strategic_directives_v2 sd;
GRANT ALL ON public.v_sd_completion_integrity TO anon, authenticated, service_role;

CREATE VIEW public.v_sds_needing_business_evaluation AS
 SELECT sd.id,
    sd.title,
    sd.priority,
    sd.created_at,
    sd.description,
        CASE
            WHEN be.id IS NULL THEN true
            ELSE false
        END AS needs_evaluation
   FROM strategic_directives_v2 sd
     LEFT JOIN sd_business_evaluations be ON sd.id::text = be.sd_id
  WHERE sd.status::text = 'pending_business_evaluation'::text OR sd.status::text = 'draft'::text AND be.id IS NULL
  ORDER BY sd.priority DESC, sd.created_at;
GRANT ALL ON public.v_sds_needing_business_evaluation TO anon, authenticated, service_role;

-- PostgREST schema-cache reload: column type changes AND view/matview redefinitions are part of
-- the exposed API surface.
NOTIFY pgrst, 'reload schema';

COMMIT;
