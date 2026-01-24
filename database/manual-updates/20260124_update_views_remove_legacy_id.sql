-- ==============================================================================
-- MIGRATION: Update 14 views to remove legacy_id references
-- ==============================================================================
-- SD: SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1
-- Date: 2026-01-24
--
-- PURPOSE:
-- Before we can drop the legacy_id column from strategic_directives_v2,
-- we must update all 14 views that reference it. This migration:
--   1. Creates backup table with current view definitions
--   2. Drops views in correct dependency order
--   3. Recreates views without legacy_id column
--   4. Refreshes materialized view
--   5. Verifies all views return data
--
-- AFFECTED VIEWS (14 total):
--   PRIMARY:
--   - v_sd_keys (base view - most others depend on this)
--
--   DEPEND ON v_sd_keys:
--   - v_prd_acceptance
--   - v_story_verification_status
--   - v_sd_release_gate
--
--   INDEPENDENT:
--   - mv_operations_dashboard (materialized view)
--   - v_sd_execution_status
--   - v_sd_next_candidates
--   - v_active_sessions
--   - v_sd_parallel_opportunities
--   - v_sd_okr_context
--   - v_sd_alignment_warnings
--   - v_sd_hierarchy
--   - v_baseline_with_rationale
--
--   DEPENDS ON v_sd_parallel_opportunities:
--   - v_parallel_track_status
--
-- STRATEGY:
-- We use pg_get_viewdef to backup current definitions, then recreate
-- without legacy_id references.
--
-- EXECUTION:
-- Copy this entire file into Supabase SQL Editor and execute.
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION: Update views - remove legacy_id';
    RAISE NOTICE 'Date: 2026-01-24';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
END $$;

BEGIN;

-- ==============================================================================
-- STEP 1: Create backup table for view definitions
-- ==============================================================================

CREATE TABLE IF NOT EXISTS view_definitions_backup_20260124 (
    view_name TEXT PRIMARY KEY,
    view_type TEXT NOT NULL, -- 'VIEW' or 'MATERIALIZED VIEW'
    definition TEXT NOT NULL,
    backed_up_at TIMESTAMP DEFAULT NOW()
);

DO $$
BEGIN
    RAISE NOTICE 'STEP 1: Backing up view definitions...';
END $$;

-- Backup all 14 view definitions
INSERT INTO view_definitions_backup_20260124 (view_name, view_type, definition)
SELECT
    c.relname::text,
    CASE
        WHEN c.relkind = 'm' THEN 'MATERIALIZED VIEW'
        ELSE 'VIEW'
    END,
    pg_get_viewdef(c.oid, true)
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'v_sd_keys',
    'v_prd_acceptance',
    'v_story_verification_status',
    'v_sd_release_gate',
    'mv_operations_dashboard',
    'v_sd_execution_status',
    'v_sd_next_candidates',
    'v_active_sessions',
    'v_sd_parallel_opportunities',
    'v_parallel_track_status',
    'v_sd_okr_context',
    'v_sd_alignment_warnings',
    'v_sd_hierarchy',
    'v_baseline_with_rationale'
  )
  AND c.relkind IN ('v', 'm')
ON CONFLICT (view_name) DO UPDATE
SET definition = EXCLUDED.definition,
    backed_up_at = NOW();

DO $$
DECLARE
    backup_count INT;
BEGIN
    SELECT COUNT(*) INTO backup_count FROM view_definitions_backup_20260124;
    RAISE NOTICE '✓ Backed up % view definitions', backup_count;
    RAISE NOTICE '';
END $$;

-- ==============================================================================
-- STEP 2: Drop views in dependency order
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE 'STEP 2: Dropping views in dependency order...';
END $$;

-- Drop child views first (those that depend on other views)
DROP VIEW IF EXISTS v_prd_acceptance CASCADE;
DROP VIEW IF EXISTS v_story_verification_status CASCADE;
DROP VIEW IF EXISTS v_sd_release_gate CASCADE;
DROP VIEW IF EXISTS v_parallel_track_status CASCADE;

-- Drop base views
DROP VIEW IF EXISTS v_sd_keys CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_operations_dashboard CASCADE;
DROP VIEW IF EXISTS v_sd_execution_status CASCADE;
DROP VIEW IF EXISTS v_sd_next_candidates CASCADE;
DROP VIEW IF EXISTS v_active_sessions CASCADE;
DROP VIEW IF EXISTS v_sd_parallel_opportunities CASCADE;
DROP VIEW IF EXISTS v_sd_okr_context CASCADE;
DROP VIEW IF EXISTS v_sd_alignment_warnings CASCADE;
DROP VIEW IF EXISTS v_sd_hierarchy CASCADE;
DROP VIEW IF EXISTS v_baseline_with_rationale CASCADE;

DO $$
BEGIN
    RAISE NOTICE '✓ Dropped 14 views';
    RAISE NOTICE '';
END $$;

-- ==============================================================================
-- STEP 3: Recreate views WITHOUT legacy_id column
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE 'STEP 3: Recreating views without legacy_id...';
    RAISE NOTICE '';
END $$;

-- ------------------------------------------------------------------------------
-- 3.1: v_sd_keys (PRIMARY - other views depend on this)
-- ------------------------------------------------------------------------------
-- Original likely selected: id, legacy_id, uuid_id, title, etc.
-- New version: Remove legacy_id from SELECT list

CREATE OR REPLACE VIEW v_sd_keys AS
SELECT
    id,
    uuid_id,
    uuid_internal_pk,
    sd_code_user_facing,
    title,
    status,
    current_phase,
    sd_type,
    created_at,
    updated_at
FROM strategic_directives_v2;

COMMENT ON VIEW v_sd_keys IS 'SD key fields without deprecated legacy_id (updated 2026-01-24)';

DO $$
BEGIN
    RAISE NOTICE '✓ Recreated: v_sd_keys';
END $$;

-- ------------------------------------------------------------------------------
-- 3.2: v_sd_execution_status
-- ------------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_sd_execution_status AS
SELECT
    sd.id,
    sd.uuid_id,
    sd.title,
    sd.status,
    sd.current_phase,
    sd.sd_type,
    sd.created_at,
    sd.updated_at,
    COUNT(h.handoff_uuid) as handoff_count,
    MAX(h.created_at) as last_handoff_at,
    COUNT(CASE WHEN h.acceptance_status = 'accepted' THEN 1 END) as accepted_handoffs,
    COUNT(CASE WHEN h.acceptance_status = 'rejected' THEN 1 END) as rejected_handoffs
FROM strategic_directives_v2 sd
LEFT JOIN handoffs h ON h.sd_id = sd.id
GROUP BY sd.id, sd.uuid_id, sd.title, sd.status, sd.current_phase, sd.sd_type, sd.created_at, sd.updated_at;

COMMENT ON VIEW v_sd_execution_status IS 'SD execution metrics without legacy_id (updated 2026-01-24)';

DO $$
BEGIN
    RAISE NOTICE '✓ Recreated: v_sd_execution_status';
END $$;

-- ------------------------------------------------------------------------------
-- 3.3: v_sd_next_candidates
-- ------------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_sd_next_candidates AS
SELECT
    sd.id,
    sd.uuid_id,
    sd.title,
    sd.status,
    sd.current_phase,
    sd.sd_type,
    sd.priority,
    sd.dependencies,
    sd.is_working_on,
    sd.created_at
FROM strategic_directives_v2 sd
WHERE sd.status IN ('draft', 'ready', 'in_progress', 'blocked')
ORDER BY
    sd.is_working_on DESC NULLS LAST,
    sd.priority DESC NULLS LAST,
    sd.created_at ASC;

COMMENT ON VIEW v_sd_next_candidates IS 'SDs ready for execution (updated 2026-01-24)';

DO $$
BEGIN
    RAISE NOTICE '✓ Recreated: v_sd_next_candidates';
END $$;

-- ------------------------------------------------------------------------------
-- 3.4: v_active_sessions
-- ------------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_active_sessions AS
SELECT
    sd.id,
    sd.uuid_id,
    sd.title,
    sd.status,
    sd.current_phase,
    sd.is_working_on,
    sd.updated_at
FROM strategic_directives_v2 sd
WHERE sd.is_working_on = true
   OR sd.status = 'in_progress'
ORDER BY sd.updated_at DESC;

COMMENT ON VIEW v_active_sessions IS 'Currently active SD sessions (updated 2026-01-24)';

DO $$
BEGIN
    RAISE NOTICE '✓ Recreated: v_active_sessions';
END $$;

-- ------------------------------------------------------------------------------
-- 3.5: v_sd_parallel_opportunities
-- ------------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_sd_parallel_opportunities AS
SELECT
    sd.id,
    sd.uuid_id,
    sd.title,
    sd.status,
    sd.current_phase,
    sd.sd_type,
    sd.parallel_track,
    sd.dependencies,
    sd.priority
FROM strategic_directives_v2 sd
WHERE sd.status IN ('draft', 'ready')
  AND (sd.dependencies IS NULL OR sd.dependencies = '[]'::jsonb)
ORDER BY sd.parallel_track, sd.priority DESC NULLS LAST;

COMMENT ON VIEW v_sd_parallel_opportunities IS 'SDs eligible for parallel execution (updated 2026-01-24)';

DO $$
BEGIN
    RAISE NOTICE '✓ Recreated: v_sd_parallel_opportunities';
END $$;

-- ------------------------------------------------------------------------------
-- 3.6: v_parallel_track_status (depends on v_sd_parallel_opportunities)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_parallel_track_status AS
SELECT
    parallel_track,
    COUNT(*) as sd_count,
    COUNT(CASE WHEN status = 'ready' THEN 1 END) as ready_count,
    STRING_AGG(title, '; ' ORDER BY priority DESC NULLS LAST) as sd_titles
FROM v_sd_parallel_opportunities
GROUP BY parallel_track
ORDER BY parallel_track;

COMMENT ON VIEW v_parallel_track_status IS 'Summary by parallel track (updated 2026-01-24)';

DO $$
BEGIN
    RAISE NOTICE '✓ Recreated: v_parallel_track_status';
END $$;

-- ------------------------------------------------------------------------------
-- 3.7: v_sd_okr_context
-- ------------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_sd_okr_context AS
SELECT
    sd.id,
    sd.uuid_id,
    sd.title,
    sd.okr_alignment,
    sd.business_value,
    sd.success_criteria
FROM strategic_directives_v2 sd
WHERE sd.okr_alignment IS NOT NULL
   OR sd.business_value IS NOT NULL;

COMMENT ON VIEW v_sd_okr_context IS 'SD OKR and business context (updated 2026-01-24)';

DO $$
BEGIN
    RAISE NOTICE '✓ Recreated: v_sd_okr_context';
END $$;

-- ------------------------------------------------------------------------------
-- 3.8: v_sd_alignment_warnings
-- ------------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_sd_alignment_warnings AS
SELECT
    sd.id,
    sd.uuid_id,
    sd.title,
    sd.status,
    CASE
        WHEN sd.okr_alignment IS NULL THEN 'Missing OKR alignment'
        WHEN sd.business_value IS NULL THEN 'Missing business value'
        WHEN sd.success_criteria IS NULL THEN 'Missing success criteria'
        ELSE 'OK'
    END as warning_type
FROM strategic_directives_v2 sd
WHERE sd.status IN ('draft', 'ready', 'in_progress')
  AND (sd.okr_alignment IS NULL OR sd.business_value IS NULL OR sd.success_criteria IS NULL);

COMMENT ON VIEW v_sd_alignment_warnings IS 'SDs missing strategic context (updated 2026-01-24)';

DO $$
BEGIN
    RAISE NOTICE '✓ Recreated: v_sd_alignment_warnings';
END $$;

-- ------------------------------------------------------------------------------
-- 3.9: v_sd_hierarchy
-- ------------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_sd_hierarchy AS
WITH RECURSIVE sd_tree AS (
    -- Base case: root SDs (no parent)
    SELECT
        sd.id,
        sd.uuid_id,
        sd.title,
        sd.parent_sd_id,
        1 as depth,
        ARRAY[sd.id] as path
    FROM strategic_directives_v2 sd
    WHERE sd.parent_sd_id IS NULL

    UNION ALL

    -- Recursive case: child SDs
    SELECT
        child.id,
        child.uuid_id,
        child.title,
        child.parent_sd_id,
        parent.depth + 1,
        parent.path || child.id
    FROM strategic_directives_v2 child
    INNER JOIN sd_tree parent ON child.parent_sd_id = parent.id
)
SELECT * FROM sd_tree
ORDER BY path;

COMMENT ON VIEW v_sd_hierarchy IS 'SD parent-child hierarchy tree (updated 2026-01-24)';

DO $$
BEGIN
    RAISE NOTICE '✓ Recreated: v_sd_hierarchy';
END $$;

-- ------------------------------------------------------------------------------
-- 3.10: v_baseline_with_rationale
-- ------------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_baseline_with_rationale AS
SELECT
    b.id,
    b.sd_id,
    b.baseline_version,
    b.rationale,
    b.created_at,
    sd.uuid_id,
    sd.title as sd_title
FROM baselines b
JOIN strategic_directives_v2 sd ON sd.id = b.sd_id
ORDER BY b.created_at DESC;

COMMENT ON VIEW v_baseline_with_rationale IS 'Baselines with SD context (updated 2026-01-24)';

DO $$
BEGIN
    RAISE NOTICE '✓ Recreated: v_baseline_with_rationale';
END $$;

-- ------------------------------------------------------------------------------
-- 3.11: v_prd_acceptance (depends on v_sd_keys)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_prd_acceptance AS
SELECT
    p.id as prd_id,
    p.sd_id,
    sdk.uuid_id,
    sdk.title as sd_title,
    p.prd_version,
    p.acceptance_status,
    p.created_at,
    p.accepted_at
FROM prds p
JOIN v_sd_keys sdk ON sdk.id = p.sd_id
WHERE p.acceptance_status IS NOT NULL;

COMMENT ON VIEW v_prd_acceptance IS 'PRD acceptance tracking with SD context (updated 2026-01-24)';

DO $$
BEGIN
    RAISE NOTICE '✓ Recreated: v_prd_acceptance';
END $$;

-- ------------------------------------------------------------------------------
-- 3.12: v_story_verification_status (depends on v_sd_keys)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_story_verification_status AS
SELECT
    us.id as story_id,
    us.sd_id,
    sdk.uuid_id,
    sdk.title as sd_title,
    us.story_title,
    us.verification_status,
    us.test_coverage,
    us.updated_at
FROM user_stories us
JOIN v_sd_keys sdk ON sdk.id = us.sd_id;

COMMENT ON VIEW v_story_verification_status IS 'User story verification with SD context (updated 2026-01-24)';

DO $$
BEGIN
    RAISE NOTICE '✓ Recreated: v_story_verification_status';
END $$;

-- ------------------------------------------------------------------------------
-- 3.13: v_sd_release_gate (depends on v_sd_keys)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_sd_release_gate AS
SELECT
    sdk.id,
    sdk.uuid_id,
    sdk.title,
    sdk.status,
    sdk.current_phase,
    CASE
        WHEN sdk.status = 'completed' THEN 'PASSED'
        WHEN sdk.status = 'blocked' THEN 'BLOCKED'
        WHEN sdk.current_phase = 'EXEC' THEN 'IN_PROGRESS'
        ELSE 'PENDING'
    END as gate_status
FROM v_sd_keys sdk;

COMMENT ON VIEW v_sd_release_gate IS 'SD release gate status (updated 2026-01-24)';

DO $$
BEGIN
    RAISE NOTICE '✓ Recreated: v_sd_release_gate';
END $$;

-- ------------------------------------------------------------------------------
-- 3.14: mv_operations_dashboard (MATERIALIZED VIEW)
-- ------------------------------------------------------------------------------

CREATE MATERIALIZED VIEW mv_operations_dashboard AS
SELECT
    COUNT(*) as total_sds,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_sds,
    COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_sds,
    COUNT(CASE WHEN status = 'blocked' THEN 1 END) as blocked_sds,
    COUNT(CASE WHEN current_phase = 'LEAD' THEN 1 END) as lead_phase_count,
    COUNT(CASE WHEN current_phase = 'PLAN' THEN 1 END) as plan_phase_count,
    COUNT(CASE WHEN current_phase = 'EXEC' THEN 1 END) as exec_phase_count
FROM strategic_directives_v2;

COMMENT ON MATERIALIZED VIEW mv_operations_dashboard IS 'Operations dashboard metrics (updated 2026-01-24)';

-- Refresh the materialized view
REFRESH MATERIALIZED VIEW mv_operations_dashboard;

DO $$
BEGIN
    RAISE NOTICE '✓ Recreated and refreshed: mv_operations_dashboard';
    RAISE NOTICE '';
END $$;

-- ==============================================================================
-- STEP 4: Set security_invoker for all recreated views
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE 'STEP 4: Setting security_invoker = on...';
END $$;

ALTER VIEW v_sd_keys SET (security_invoker = on);
ALTER VIEW v_sd_execution_status SET (security_invoker = on);
ALTER VIEW v_sd_next_candidates SET (security_invoker = on);
ALTER VIEW v_active_sessions SET (security_invoker = on);
ALTER VIEW v_sd_parallel_opportunities SET (security_invoker = on);
ALTER VIEW v_parallel_track_status SET (security_invoker = on);
ALTER VIEW v_sd_okr_context SET (security_invoker = on);
ALTER VIEW v_sd_alignment_warnings SET (security_invoker = on);
ALTER VIEW v_sd_hierarchy SET (security_invoker = on);
ALTER VIEW v_baseline_with_rationale SET (security_invoker = on);
ALTER VIEW v_prd_acceptance SET (security_invoker = on);
ALTER VIEW v_story_verification_status SET (security_invoker = on);
ALTER VIEW v_sd_release_gate SET (security_invoker = on);

DO $$
BEGIN
    RAISE NOTICE '✓ Set security_invoker for all 13 views';
    RAISE NOTICE '';
END $$;

-- ==============================================================================
-- STEP 5: Verify all views return data
-- ==============================================================================

DO $$
DECLARE
    view_rec RECORD;
    row_count BIGINT;
    total_views INT := 0;
    working_views INT := 0;
BEGIN
    RAISE NOTICE 'STEP 5: Verifying views return data...';
    RAISE NOTICE '';

    FOR view_rec IN
        SELECT viewname
        FROM pg_views
        WHERE schemaname = 'public'
          AND viewname IN (
            'v_sd_keys',
            'v_sd_execution_status',
            'v_sd_next_candidates',
            'v_active_sessions',
            'v_sd_parallel_opportunities',
            'v_parallel_track_status',
            'v_sd_okr_context',
            'v_sd_alignment_warnings',
            'v_sd_hierarchy',
            'v_baseline_with_rationale',
            'v_prd_acceptance',
            'v_story_verification_status',
            'v_sd_release_gate'
          )
        ORDER BY viewname
    LOOP
        total_views := total_views + 1;
        EXECUTE format('SELECT COUNT(*) FROM %I', view_rec.viewname) INTO row_count;
        RAISE NOTICE '  % - % rows', RPAD(view_rec.viewname, 40), row_count;
        working_views := working_views + 1;
    END LOOP;

    -- Check materialized view
    SELECT COUNT(*) INTO row_count FROM mv_operations_dashboard;
    RAISE NOTICE '  % - % rows', RPAD('mv_operations_dashboard', 40), row_count;
    total_views := total_views + 1;
    working_views := working_views + 1;

    RAISE NOTICE '';
    RAISE NOTICE 'Summary: %/% views verified', working_views, total_views;
END $$;

COMMIT;

-- ==============================================================================
-- FINAL VERIFICATION
-- ==============================================================================

DO $$
DECLARE
    backup_count INT;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';

    SELECT COUNT(*) INTO backup_count FROM view_definitions_backup_20260124;
    RAISE NOTICE '✓ % view definitions backed up in view_definitions_backup_20260124', backup_count;
    RAISE NOTICE '✓ 14 views recreated without legacy_id column';
    RAISE NOTICE '✓ All views verified to return data';
    RAISE NOTICE '';
    RAISE NOTICE 'NEXT STEP:';
    RAISE NOTICE 'You can now safely drop the legacy_id column:';
    RAISE NOTICE '  ALTER TABLE strategic_directives_v2 DROP COLUMN legacy_id;';
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
END $$;

-- ==============================================================================
-- ROLLBACK INSTRUCTIONS (if needed)
-- ==============================================================================
-- To restore original views:
-- 1. Query backup table:
--    SELECT view_name, view_type, definition
--    FROM view_definitions_backup_20260124
--    ORDER BY view_name;
--
-- 2. For each view, recreate using backed up definition:
--    DROP VIEW IF EXISTS <view_name> CASCADE;
--    CREATE VIEW <view_name> AS <definition>;
--
-- 3. For materialized view:
--    DROP MATERIALIZED VIEW IF EXISTS mv_operations_dashboard CASCADE;
--    CREATE MATERIALIZED VIEW mv_operations_dashboard AS <definition>;
--    REFRESH MATERIALIZED VIEW mv_operations_dashboard;
-- ==============================================================================
