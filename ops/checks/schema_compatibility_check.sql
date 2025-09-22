-- Schema Compatibility Check for Vision Alignment Pipeline
-- Validates that all required tables, columns, and views exist for Vision/WSJF workflows
-- Date: 2025-09-22
-- Purpose: Automated verification of schema readiness before pipeline execution

\set ON_ERROR_STOP on
\timing on

\echo '🔍 Running Schema Compatibility Check for Vision Alignment Pipeline'
\echo '=================================================================='

-- Create compatibility report as a table, then export
DROP TABLE IF EXISTS _compat_report;
CREATE TEMP TABLE _compat_report (
    check_type text,
    check_name text,
    passed boolean,
    details text,
    status_icon text
);

-- 1. Check required columns in strategic_directives_v2
\echo '📋 Checking strategic_directives_v2 table compatibility...'

INSERT INTO _compat_report (check_type, check_name, passed, details, status_icon)
SELECT
    'sd_key_column' AS check_type,
    'strategic_directives_v2.sd_key' AS check_name,
    EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='strategic_directives_v2' AND column_name='sd_key'
    ) AS passed,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='strategic_directives_v2' AND column_name='sd_key'
    ) THEN 'Column exists' ELSE 'Column missing - run migration 2025-09-22-add-sd-key.sql' END AS details,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='strategic_directives_v2' AND column_name='sd_key'
    ) THEN '✅' ELSE '❌' END AS status_icon;

-- 2. Check VH namespace tables
\echo '🏗️  Checking VH namespace table availability...'

INSERT INTO _compat_report (check_type, check_name, passed, details, status_icon)
SELECT
    'vh_tables' AS check_type,
    'vh_ventures' AS check_name,
    EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE (table_schema='public' OR table_schema='vh') AND table_name='vh_ventures'
    ) AS passed,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE (table_schema='public' OR table_schema='vh') AND table_name='vh_ventures'
    ) THEN 'Table exists' ELSE 'Table missing - run migration 2025-09-22-vh-bridge-tables.sql' END AS details,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE (table_schema='public' OR table_schema='vh') AND table_name='vh_ventures'
    ) THEN '✅' ELSE '❌' END AS status_icon;

-- 3. Check required views
\echo '👁️  Checking required views for WSJF workflows...'

INSERT INTO _compat_report (check_type, check_name, passed, details, status_icon)
SELECT
    'vh_views' AS check_type,
    'v_vh_governance_snapshot' AS check_name,
    EXISTS (
        SELECT 1 FROM information_schema.views
        WHERE (table_schema='public' OR table_schema='vh') AND table_name='v_vh_governance_snapshot'
    ) AS passed,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.views
        WHERE (table_schema='public' OR table_schema='vh') AND table_name='v_vh_governance_snapshot'
    ) THEN 'View exists' ELSE 'View missing - run migration 2025-09-22-vh-bridge-tables.sql' END AS details,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.views
        WHERE (table_schema='public' OR table_schema='vh') AND table_name='v_vh_governance_snapshot'
    ) THEN '✅' ELSE '❌' END AS status_icon;

-- 4. Export compatibility summary
\echo '📊 Generating compatibility summary...'

\copy _compat_report TO 'ops/checks/out/schema_compatibility_summary.csv' WITH CSV HEADER;

-- 5. Overall pipeline readiness assessment
DO $$
DECLARE
    sd_key_exists boolean;
    vh_tables_exist boolean;
    vh_views_exist boolean;
    pipeline_ready boolean;
    failed_checks integer;
BEGIN
    -- Check all requirements
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='strategic_directives_v2' AND column_name='sd_key'
    ) INTO sd_key_exists;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE (table_schema='public' OR table_schema='vh') AND table_name='vh_ventures'
    ) INTO vh_tables_exist;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.views
        WHERE (table_schema='public' OR table_schema='vh') AND table_name='v_vh_governance_snapshot'
    ) INTO vh_views_exist;

    pipeline_ready := sd_key_exists AND vh_tables_exist AND vh_views_exist;

    SELECT count(*) INTO failed_checks FROM _compat_report WHERE NOT passed;

    RAISE NOTICE '';
    RAISE NOTICE '=== VISION ALIGNMENT PIPELINE COMPATIBILITY REPORT ===';
    RAISE NOTICE 'Strategic Directives sd_key column: %', CASE WHEN sd_key_exists THEN '✅ PRESENT' ELSE '❌ MISSING' END;
    RAISE NOTICE 'VH namespace tables: %', CASE WHEN vh_tables_exist THEN '✅ PRESENT' ELSE '❌ MISSING' END;
    RAISE NOTICE 'VH governance snapshot view: %', CASE WHEN vh_views_exist THEN '✅ PRESENT' ELSE '❌ MISSING' END;
    RAISE NOTICE '';
    RAISE NOTICE 'OVERALL PIPELINE READINESS: %', CASE WHEN pipeline_ready THEN '✅ READY' ELSE '❌ NOT READY' END;
    RAISE NOTICE 'Failed checks: %', failed_checks;

    IF NOT pipeline_ready THEN
        RAISE NOTICE '';
        RAISE NOTICE 'ACTION REQUIRED:';
        IF NOT sd_key_exists THEN
            RAISE NOTICE '  - Run migration: database/migrations/2025-09-22-add-sd-key.sql';
        END IF;
        IF NOT vh_tables_exist OR NOT vh_views_exist THEN
            RAISE NOTICE '  - Run migration: database/migrations/2025-09-22-vh-bridge-tables.sql';
        END IF;
    ELSE
        RAISE NOTICE 'Vision Alignment Pipeline is ready for production use! 🚀';
    END IF;
    RAISE NOTICE '';

    -- Exit with error code if not ready (for CI/CD)
    IF NOT pipeline_ready THEN
        RAISE EXCEPTION 'Schema compatibility check failed. % checks failed.', failed_checks;
    END IF;
END $$;

\echo '✅ Schema compatibility check completed'
\echo '📁 Results saved to ops/checks/out/schema_compatibility_summary.csv'