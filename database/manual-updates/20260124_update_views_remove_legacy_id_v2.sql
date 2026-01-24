-- ==============================================================================
-- UPDATE VIEWS TO REMOVE legacy_id REFERENCES (v2 - Based on Actual Definitions)
-- ==============================================================================
-- SD: SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1
-- Date: 2026-01-24
--
-- This migration updates 10 views that reference legacy_id column.
-- After this migration, legacy_id can be safely dropped.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- STEP 1: Backup existing view definitions
-- ==============================================================================
CREATE TABLE IF NOT EXISTS view_definitions_backup_20260124 (
    view_name TEXT PRIMARY KEY,
    view_type TEXT,
    view_definition TEXT,
    backed_up_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO view_definitions_backup_20260124 (view_name, view_type, view_definition)
SELECT
    c.relname,
    CASE c.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' END,
    pg_get_viewdef(c.oid, true)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
AND c.relkind IN ('v', 'm')
AND pg_get_viewdef(c.oid, true) LIKE '%legacy_id%'
ON CONFLICT (view_name) DO UPDATE SET
    view_definition = EXCLUDED.view_definition,
    backed_up_at = NOW();

DO $$ BEGIN RAISE NOTICE '✓ Backed up view definitions'; END $$;

-- ==============================================================================
-- STEP 2: Drop dependent views first (correct order)
-- ==============================================================================

-- Views that depend on v_sd_keys
DROP VIEW IF EXISTS v_prd_acceptance CASCADE;
DROP VIEW IF EXISTS v_story_verification_status CASCADE;
DROP VIEW IF EXISTS v_sd_release_gate CASCADE;

-- Views that depend on v_active_sessions -> v_sd_parallel_opportunities
DROP VIEW IF EXISTS v_parallel_track_status CASCADE;
DROP VIEW IF EXISTS v_sd_parallel_opportunities CASCADE;

-- Base views
DROP VIEW IF EXISTS v_active_sessions CASCADE;
DROP VIEW IF EXISTS v_sd_keys CASCADE;
DROP VIEW IF EXISTS v_sd_alignment_warnings CASCADE;
DROP VIEW IF EXISTS v_sd_okr_context CASCADE;
DROP VIEW IF EXISTS v_sd_hierarchy CASCADE;
DROP VIEW IF EXISTS v_sd_next_candidates CASCADE;
DROP VIEW IF EXISTS v_sd_execution_status CASCADE;
DROP VIEW IF EXISTS v_baseline_with_rationale CASCADE;

-- Materialized view
DROP MATERIALIZED VIEW IF EXISTS mv_operations_dashboard CASCADE;

DO $$ BEGIN RAISE NOTICE '✓ Dropped all dependent views'; END $$;

-- ==============================================================================
-- STEP 3: Recreate views WITHOUT legacy_id references
-- ==============================================================================

-- 3.1: v_sd_keys (simplest - just remove legacy_id from COALESCE)
CREATE OR REPLACE VIEW v_sd_keys AS
SELECT
    id AS sd_id,
    id AS sd_key,  -- Changed from COALESCE(legacy_id, id)
    title,
    status,
    priority
FROM strategic_directives_v2;

DO $$ BEGIN RAISE NOTICE '✓ Recreated v_sd_keys'; END $$;

-- 3.2: v_active_sessions (change JOIN to use id instead of legacy_id)
CREATE OR REPLACE VIEW v_active_sessions AS
SELECT cs.id,
    cs.session_id,
    cs.sd_id,
    sd.title AS sd_title,
    cs.track,
    cs.tty,
    cs.pid,
    cs.hostname,
    cs.codebase,
    cs.claimed_at,
    cs.heartbeat_at,
    cs.status,
    cs.metadata,
    cs.created_at,
    EXTRACT(epoch FROM now() - cs.heartbeat_at) AS heartbeat_age_seconds,
    EXTRACT(epoch FROM now() - cs.heartbeat_at) / 60::numeric AS heartbeat_age_minutes,
    CASE
        WHEN cs.status = 'released'::text THEN 'released'::text
        WHEN EXTRACT(epoch FROM now() - cs.heartbeat_at) > 300::numeric THEN 'stale'::text
        WHEN cs.sd_id IS NULL THEN 'idle'::text
        ELSE 'active'::text
    END AS computed_status,
    CASE
        WHEN cs.claimed_at IS NOT NULL THEN EXTRACT(epoch FROM now() - cs.claimed_at) / 60::numeric
        ELSE NULL::numeric
    END AS claim_duration_minutes
FROM claude_sessions cs
LEFT JOIN strategic_directives_v2 sd ON cs.sd_id = sd.id::text  -- Changed from legacy_id
WHERE cs.status <> 'released'::text
ORDER BY cs.track, cs.claimed_at DESC;

DO $$ BEGIN RAISE NOTICE '✓ Recreated v_active_sessions'; END $$;

-- 3.3: v_baseline_with_rationale (change JOIN to use id)
CREATE OR REPLACE VIEW v_baseline_with_rationale AS
SELECT b.id AS baseline_id,
    b.baseline_name,
    b.baseline_type,
    b.is_active,
    b.generation_rationale,
    b.generated_by,
    b.algorithm_version,
    b.created_at AS baseline_created_at,
    r.sd_id,
    r.sequence_rank,
    r.track,
    r.track_name,
    r.rationale,
    r.priority_score,
    r.okr_impact_score,
    r.dependency_depth,
    r.blocked_by,
    sd.title AS sd_title,
    sd.status AS sd_status,
    sd.sd_type,
    sd.priority AS sd_priority
FROM sd_execution_baselines b
LEFT JOIN sd_baseline_rationale r ON b.id = r.baseline_id
LEFT JOIN strategic_directives_v2 sd ON r.sd_id::text = sd.id::text  -- Changed from legacy_id
ORDER BY b.created_at DESC, r.sequence_rank;

DO $$ BEGIN RAISE NOTICE '✓ Recreated v_baseline_with_rationale'; END $$;

-- 3.4: v_sd_alignment_warnings (remove legacy_id from SELECT)
CREATE OR REPLACE VIEW v_sd_alignment_warnings AS
SELECT sd.id,
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

DO $$ BEGIN RAISE NOTICE '✓ Recreated v_sd_alignment_warnings'; END $$;

-- 3.5: v_sd_execution_status (change JOIN to use id)
CREATE OR REPLACE VIEW v_sd_execution_status AS
SELECT bi.sd_id,
    sd.title,
    sd.priority,
    sd.status AS sd_status,
    sd.progress_percentage,
    b.baseline_name,
    b.is_active AS is_active_baseline,
    bi.sequence_rank,
    bi.track,
    bi.track_name,
    bi.estimated_effort_hours,
    bi.planned_start_date,
    bi.planned_end_date,
    bi.is_ready,
    bi.dependency_health_score,
    ea.actual_start_date,
    ea.actual_end_date,
    ea.actual_effort_hours,
    ea.status AS execution_status,
    ea.blockers,
    ea.blocked_by_sd_ids,
    CASE
        WHEN bi.estimated_effort_hours > 0::numeric AND ea.actual_effort_hours IS NOT NULL THEN round(ea.actual_effort_hours / bi.estimated_effort_hours * 100::numeric, 1)
        ELSE NULL::numeric
    END AS effort_variance_pct,
    CASE
        WHEN bi.planned_end_date IS NOT NULL AND ea.actual_end_date IS NOT NULL THEN ea.actual_end_date::date - bi.planned_end_date
        ELSE NULL::integer
    END AS schedule_variance_days
FROM sd_baseline_items bi
JOIN sd_execution_baselines b ON bi.baseline_id = b.id
LEFT JOIN strategic_directives_v2 sd ON bi.sd_id = sd.id::text  -- Changed from legacy_id
LEFT JOIN sd_execution_actuals ea ON bi.sd_id = ea.sd_id AND bi.baseline_id = ea.baseline_id
ORDER BY bi.sequence_rank;

DO $$ BEGIN RAISE NOTICE '✓ Recreated v_sd_execution_status'; END $$;

-- 3.6: v_sd_hierarchy (replace legacy_id with id throughout)
CREATE OR REPLACE VIEW v_sd_hierarchy AS
WITH RECURSIVE hierarchy AS (
    SELECT strategic_directives_v2.id,
        strategic_directives_v2.id AS sd_key,  -- Changed from legacy_id
        strategic_directives_v2.title,
        strategic_directives_v2.status,
        strategic_directives_v2.current_phase,
        strategic_directives_v2.parent_sd_id,
        0 AS depth,
        ARRAY[strategic_directives_v2.id::text] AS path,  -- Changed from legacy_id
        strategic_directives_v2.id::text AS root_sd  -- Changed from legacy_id
    FROM strategic_directives_v2
    WHERE strategic_directives_v2.is_active = true
    UNION ALL
    SELECT sd.id,
        sd.id AS sd_key,  -- Changed from legacy_id
        sd.title,
        sd.status,
        sd.current_phase,
        sd.parent_sd_id,
        h.depth + 1,
        h.path || sd.id::text,  -- Changed from legacy_id
        h.root_sd
    FROM strategic_directives_v2 sd
    JOIN hierarchy h ON sd.parent_sd_id::text = h.id::text
    WHERE sd.is_active = true
)
SELECT id,
    sd_key,  -- Changed from legacy_id
    title,
    status,
    current_phase,
    parent_sd_id,
    depth,
    path,
    root_sd,
    CASE
        WHEN status::text = ANY (ARRAY['completed'::character varying, 'cancelled'::character varying]::text[]) THEN true
        ELSE false
    END AS is_complete
FROM hierarchy;

DO $$ BEGIN RAISE NOTICE '✓ Recreated v_sd_hierarchy'; END $$;

-- 3.7: v_sd_next_candidates (change all legacy_id references to id)
CREATE OR REPLACE VIEW v_sd_next_candidates AS
WITH active_baseline AS (
    SELECT sd_execution_baselines.id
    FROM sd_execution_baselines
    WHERE sd_execution_baselines.is_active = true
    LIMIT 1
), dependency_status AS (
    SELECT bi_1.sd_id,
        bi_1.sequence_rank,
        bi_1.track,
        bi_1.dependencies_snapshot,
        COALESCE(( SELECT count(*) = 0
            FROM jsonb_array_elements_text(bi_1.dependencies_snapshot) dep(value)
            WHERE NOT (EXISTS ( SELECT 1
                FROM strategic_directives_v2 sd2
                WHERE sd2.id::text = split_part(dep.value, ' '::text, 1) AND sd2.status::text = 'completed'::text))), true) AS deps_satisfied  -- Changed from legacy_id
    FROM sd_baseline_items bi_1
    WHERE bi_1.baseline_id = (( SELECT active_baseline.id FROM active_baseline))
)
SELECT bi.sd_id,
    sd.title,
    sd.priority,
    sd.status,
    sd.progress_percentage,
    bi.sequence_rank,
    bi.track,
    bi.track_name,
    bi.estimated_effort_hours,
    bi.dependency_health_score,
    ds.deps_satisfied,
    ea.status AS execution_status,
    sd.is_working_on,
    CASE
        WHEN sd.is_working_on = true THEN 1
        WHEN ea.status = 'in_progress'::text THEN 2
        WHEN ds.deps_satisfied AND (sd.status::text = ANY (ARRAY['draft'::character varying, 'active'::character varying]::text[])) THEN 3
        WHEN sd.progress_percentage > 0 AND sd.progress_percentage < 100 THEN 4
        ELSE 5
    END AS readiness_priority
FROM sd_baseline_items bi
JOIN strategic_directives_v2 sd ON bi.sd_id = sd.id::text  -- Changed from legacy_id
JOIN dependency_status ds ON bi.sd_id = ds.sd_id
LEFT JOIN sd_execution_actuals ea ON bi.sd_id = ea.sd_id AND ea.baseline_id = (( SELECT active_baseline.id FROM active_baseline))
WHERE bi.baseline_id = (( SELECT active_baseline.id FROM active_baseline)) AND (sd.status::text <> ALL (ARRAY['completed'::character varying, 'cancelled'::character varying]::text[]))
ORDER BY (
    CASE
        WHEN sd.is_working_on = true THEN 1
        WHEN ea.status = 'in_progress'::text THEN 2
        WHEN ds.deps_satisfied AND (sd.status::text = ANY (ARRAY['draft'::character varying, 'active'::character varying]::text[])) THEN 3
        WHEN sd.progress_percentage > 0 AND sd.progress_percentage < 100 THEN 4
        ELSE 5
    END), bi.sequence_rank;

DO $$ BEGIN RAISE NOTICE '✓ Recreated v_sd_next_candidates'; END $$;

-- 3.8: v_sd_okr_context (remove legacy_id from SELECT)
CREATE OR REPLACE VIEW v_sd_okr_context AS
SELECT sd.id AS sd_uuid,
    sd.id AS sd_key,  -- Changed from legacy_id
    sd.title AS sd_title,
    sd.status,
    sd.progress_percentage,
    sd.is_working_on,
    COALESCE(jsonb_agg(DISTINCT jsonb_build_object('kr_code', kr.code, 'kr_title', kr.title, 'kr_status', kr.status, 'objective_code', o.code, 'objective_title', o.title, 'contribution_type', ska.contribution_type, 'contribution_note', ska.contribution_note, 'kr_progress_pct',
        CASE
            WHEN kr.direction = 'decrease'::text THEN round((kr.baseline_value - kr.current_value) / NULLIF(kr.baseline_value - kr.target_value, 0::numeric) * 100::numeric, 1)
            ELSE round((kr.current_value - COALESCE(kr.baseline_value, 0::numeric)) / NULLIF(kr.target_value - COALESCE(kr.baseline_value, 0::numeric), 0::numeric) * 100::numeric, 1)
        END)) FILTER (WHERE kr.id IS NOT NULL), '[]'::jsonb) AS aligned_krs,
    count(DISTINCT kr.id) AS aligned_kr_count
FROM strategic_directives_v2 sd
LEFT JOIN sd_key_result_alignment ska ON sd.id::text = ska.sd_id::text
LEFT JOIN key_results kr ON ska.key_result_id = kr.id AND kr.is_active = true
LEFT JOIN objectives o ON kr.objective_id = o.id AND o.is_active = true
WHERE sd.is_active = true
GROUP BY sd.id, sd.title, sd.status, sd.progress_percentage, sd.is_working_on;

DO $$ BEGIN RAISE NOTICE '✓ Recreated v_sd_okr_context'; END $$;

-- 3.9: v_sd_parallel_opportunities (change legacy_id references to id)
CREATE OR REPLACE VIEW v_sd_parallel_opportunities AS
WITH active_baseline AS (
    SELECT sd_execution_baselines.id
    FROM sd_execution_baselines
    WHERE sd_execution_baselines.is_active = true
    LIMIT 1
), active_claims AS (
    SELECT DISTINCT v_active_sessions.sd_id,
        v_active_sessions.track,
        v_active_sessions.session_id
    FROM v_active_sessions
    WHERE v_active_sessions.computed_status = 'active'::text AND v_active_sessions.sd_id IS NOT NULL
), active_tracks AS (
    SELECT DISTINCT active_claims.track
    FROM active_claims
), ready_sds AS (
    SELECT bi.sd_id,
        sd.title,
        sd.priority,
        bi.track,
        bi.sequence_rank,
        bi.is_ready,
        bi.dependency_health_score,
        sd.status AS sd_status,
        sd.progress_percentage,
        ac.session_id AS claimed_by_session,
        CASE
            WHEN ac.sd_id IS NOT NULL THEN 'claimed'::text
            WHEN (bi.track IN ( SELECT active_tracks.track FROM active_tracks)) THEN 'track_busy'::text
            WHEN NOT bi.is_ready THEN 'blocked'::text
            WHEN sd.status::text = ANY (ARRAY['completed'::character varying, 'cancelled'::character varying]::text[]) THEN 'done'::text
            ELSE 'available'::text
        END AS availability
    FROM sd_baseline_items bi
    JOIN strategic_directives_v2 sd ON bi.sd_id = sd.id::text  -- Changed from legacy_id
    LEFT JOIN active_claims ac ON bi.sd_id = ac.sd_id
    WHERE bi.baseline_id = (( SELECT active_baseline.id FROM active_baseline))
)
SELECT sd_id,
    title,
    priority,
    track,
    sequence_rank,
    is_ready,
    dependency_health_score,
    sd_status,
    progress_percentage,
    claimed_by_session,
    availability,
    CASE availability
        WHEN 'available'::text THEN 1
        WHEN 'track_busy'::text THEN 2
        WHEN 'blocked'::text THEN 3
        WHEN 'claimed'::text THEN 4
        WHEN 'done'::text THEN 5
        ELSE NULL::integer
    END AS availability_priority
FROM ready_sds
WHERE availability <> 'done'::text
ORDER BY (
    CASE availability
        WHEN 'available'::text THEN 1
        WHEN 'track_busy'::text THEN 2
        WHEN 'blocked'::text THEN 3
        WHEN 'claimed'::text THEN 4
        WHEN 'done'::text THEN 5
        ELSE NULL::integer
    END), track, sequence_rank;

DO $$ BEGIN RAISE NOTICE '✓ Recreated v_sd_parallel_opportunities'; END $$;

-- 3.10: mv_operations_dashboard (materialized view - remove legacy_id from subquery)
CREATE MATERIALIZED VIEW mv_operations_dashboard AS
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
CROSS JOIN (
    SELECT id, title, version, status, category, priority, description,
        strategic_intent, rationale, scope, key_changes, strategic_objectives,
        success_criteria, key_principles, implementation_guidelines, dependencies,
        risks, success_metrics, stakeholders, approved_by, approval_date,
        effective_date, expiry_date, review_schedule, created_at, updated_at,
        created_by, updated_by, metadata, h_count, m_count, l_count, future_count,
        must_have_count, wish_list_count, must_have_pct, rolled_triage, readiness,
        must_have_density, new_module_pct, import_run_id, present_in_latest_import,
        sequence_rank, sd_key, parent_sd_id, is_active, archived_at, archived_by,
        governance_metadata, target_application, progress, completion_date,
        current_phase, phase_progress, is_working_on, uuid_id
        -- Removed: legacy_id
    FROM strategic_directives_v2
    WHERE status::text <> 'archived'::text
) sd
GROUP BY (date_trunc('minute'::text, now()) - (EXTRACT(second FROM now())::integer % 30)::double precision * '00:00:01'::interval);

DO $$ BEGIN RAISE NOTICE '✓ Recreated mv_operations_dashboard'; END $$;

-- ==============================================================================
-- STEP 4: Verification
-- ==============================================================================

DO $$
DECLARE
    view_count INT;
    legacy_ref_count INT;
BEGIN
    -- Count recreated views
    SELECT COUNT(*) INTO view_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
    AND c.relname IN ('v_sd_keys', 'v_active_sessions', 'v_baseline_with_rationale',
                      'v_sd_alignment_warnings', 'v_sd_execution_status', 'v_sd_hierarchy',
                      'v_sd_next_candidates', 'v_sd_okr_context', 'v_sd_parallel_opportunities',
                      'mv_operations_dashboard');

    -- Check for remaining legacy_id references
    SELECT COUNT(*) INTO legacy_ref_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
    AND c.relkind IN ('v', 'm')
    AND pg_get_viewdef(c.oid, true) LIKE '%legacy_id%';

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION VERIFICATION';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Views recreated: %', view_count;
    RAISE NOTICE 'Remaining legacy_id references: %', legacy_ref_count;

    IF legacy_ref_count = 0 THEN
        RAISE NOTICE '✓ SUCCESS: No legacy_id references remain';
        RAISE NOTICE '';
        RAISE NOTICE 'You can now safely run:';
        RAISE NOTICE '  ALTER TABLE strategic_directives_v2 DROP COLUMN legacy_id;';
    ELSE
        RAISE WARNING '⚠ WARNING: % view(s) still reference legacy_id', legacy_ref_count;
    END IF;
    RAISE NOTICE '========================================';
END $$;

-- Test that key views return data
SELECT 'v_sd_keys' AS view_name, COUNT(*) AS row_count FROM v_sd_keys
UNION ALL
SELECT 'v_sd_next_candidates', COUNT(*) FROM v_sd_next_candidates
UNION ALL
SELECT 'v_active_sessions', COUNT(*) FROM v_active_sessions
UNION ALL
SELECT 'mv_operations_dashboard', COUNT(*) FROM mv_operations_dashboard;

COMMIT;
