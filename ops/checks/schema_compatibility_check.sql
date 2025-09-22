-- Schema Compatibility Check for Vision Alignment Pipeline
-- Validates that all required tables, columns, and views exist for Vision/WSJF workflows
-- Date: 2025-09-22
-- Purpose: Automated verification of schema readiness before pipeline execution

\set ON_ERROR_STOP on
\timing on

-- Create output directory
\! mkdir -p ops/checks/out

\echo '🔍 Running Schema Compatibility Check for Vision Alignment Pipeline'
\echo '=================================================================='

-- 1. Check required columns in strategic_directives_v2
\echo '📋 Checking strategic_directives_v2 table compatibility...'

\copy (
    SELECT
        'strategic_directives_v2' AS table_name,
        'sd_key' AS column_name,
        data_type,
        is_nullable,
        column_default,
        EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='strategic_directives_v2'
            AND column_name='sd_key'
        ) AS present
    FROM information_schema.columns
    WHERE table_name='strategic_directives_v2' AND column_name='sd_key'
    UNION ALL
    SELECT
        'strategic_directives_v2' AS table_name,
        'sd_key' AS column_name,
        'MISSING' AS data_type,
        'MISSING' AS is_nullable,
        'MISSING' AS column_default,
        false AS present
    WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='strategic_directives_v2' AND column_name='sd_key'
    )
) TO 'ops/checks/out/schema_columns_check.csv' WITH CSV HEADER;

-- 2. Check VH namespace tables
\echo '🏗️  Checking VH namespace table availability...'

\copy (
    SELECT
        table_name,
        table_schema,
        table_type,
        EXISTS (
            SELECT 1 FROM information_schema.tables t
            WHERE t.table_schema = tables_to_check.table_schema
            AND t.table_name = tables_to_check.table_name
        ) AS present
    FROM (VALUES
        ('vh_ventures', 'public', 'BASE TABLE'),
        ('vh_ventures', 'vh', 'BASE TABLE'),
        ('vh_stage_catalog', 'public', 'BASE TABLE'),
        ('vh_stage_catalog', 'vh', 'BASE TABLE')
    ) AS tables_to_check(table_name, table_schema, table_type)
) TO 'ops/checks/out/schema_tables_check.csv' WITH CSV HEADER;

-- 3. Check required views
\echo '👁️  Checking required views for WSJF workflows...'

\copy (
    SELECT
        view_name,
        view_schema,
        EXISTS (
            SELECT 1 FROM information_schema.views v
            WHERE v.table_schema = views_to_check.view_schema
            AND v.table_name = views_to_check.view_name
        ) AS present,
        CASE
            WHEN EXISTS (
                SELECT 1 FROM information_schema.views v
                WHERE v.table_schema = views_to_check.view_schema
                AND v.table_name = views_to_check.view_name
            ) THEN 'AVAILABLE'
            ELSE 'MISSING'
        END AS status
    FROM (VALUES
        ('v_vh_governance_snapshot', 'public'),
        ('v_vh_governance_snapshot', 'vh')
    ) AS views_to_check(view_name, view_schema)
) TO 'ops/checks/out/schema_views_check.csv' WITH CSV HEADER;

-- 4. Check view functionality (if v_vh_governance_snapshot exists)
\echo '🔧 Testing view functionality...'

DO $$
DECLARE
    view_exists boolean;
    sample_count integer := 0;
    view_schema text;
BEGIN
    -- Check if view exists in public schema
    SELECT EXISTS (
        SELECT 1 FROM information_schema.views
        WHERE table_schema='public' AND table_name='v_vh_governance_snapshot'
    ) INTO view_exists;

    IF view_exists THEN
        view_schema := 'public';
    ELSE
        -- Check if view exists in vh schema
        SELECT EXISTS (
            SELECT 1 FROM information_schema.views
            WHERE table_schema='vh' AND table_name='v_vh_governance_snapshot'
        ) INTO view_exists;

        IF view_exists THEN
            view_schema := 'vh';
        END IF;
    END IF;

    IF view_exists THEN
        EXECUTE format('SELECT count(*) FROM %I.v_vh_governance_snapshot', view_schema) INTO sample_count;
        RAISE NOTICE 'View v_vh_governance_snapshot found in schema % with % records', view_schema, sample_count;
    ELSE
        RAISE NOTICE 'View v_vh_governance_snapshot not found in any schema';
    END IF;
END $$;

-- 5. Generate compatibility summary
\echo '📊 Generating compatibility summary...'

\copy (
    WITH compatibility_check AS (
        -- Column checks
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
            ) THEN 'Column exists' ELSE 'Column missing - run migration 2025-09-22-add-sd-key.sql' END AS details

        UNION ALL

        -- VH tables check
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
            ) THEN 'Table exists' ELSE 'Table missing - run migration 2025-09-22-vh-bridge-tables.sql' END AS details

        UNION ALL

        -- Views check
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
            ) THEN 'View exists' ELSE 'View missing - run migration 2025-09-22-vh-bridge-tables.sql' END AS details
    )
    SELECT
        check_type,
        check_name,
        passed,
        details,
        CASE WHEN passed THEN '✅' ELSE '❌' END AS status_icon
    FROM compatibility_check
    ORDER BY check_type, check_name
) TO 'ops/checks/out/schema_compatibility_summary.csv' WITH CSV HEADER;

-- 6. Overall pipeline readiness assessment
DO $$
DECLARE
    sd_key_exists boolean;
    vh_tables_exist boolean;
    vh_views_exist boolean;
    pipeline_ready boolean;
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

    RAISE NOTICE '';
    RAISE NOTICE '=== VISION ALIGNMENT PIPELINE COMPATIBILITY REPORT ===';
    RAISE NOTICE 'Strategic Directives sd_key column: %', CASE WHEN sd_key_exists THEN '✅ PRESENT' ELSE '❌ MISSING' END;
    RAISE NOTICE 'VH namespace tables: %', CASE WHEN vh_tables_exist THEN '✅ PRESENT' ELSE '❌ MISSING' END;
    RAISE NOTICE 'VH governance snapshot view: %', CASE WHEN vh_views_exist THEN '✅ PRESENT' ELSE '❌ MISSING' END;
    RAISE NOTICE '';
    RAISE NOTICE 'OVERALL PIPELINE READINESS: %', CASE WHEN pipeline_ready THEN '✅ READY' ELSE '❌ NOT READY' END;

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
END $$;

\echo '✅ Schema compatibility check completed'
\echo '📁 Results saved to ops/checks/out/schema_*.csv'
\echo '📋 Run this check after migrations to verify pipeline readiness'