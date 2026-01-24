-- ==============================================================================
-- MIGRATION PART 2: Remove legacy_id column (with view updates)
-- ==============================================================================
-- SD: SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D
-- Date: 2026-01-24
--
-- PURPOSE:
-- Remove legacy_id column after updating dependent views.
-- These views reference legacy_id and must be updated first:
--   - v_sd_keys
--   - v_prd_acceptance (depends on v_sd_keys)
--   - v_story_verification_status (depends on v_sd_keys)
--   - v_sd_release_gate (depends on v_sd_keys)
--   - mv_operations_dashboard
--   - v_sd_execution_status
--   - v_sd_next_candidates
--   - v_active_sessions
--   - v_sd_parallel_opportunities
--   - v_parallel_track_status (depends on v_sd_parallel_opportunities)
--   - v_sd_okr_context
--   - v_sd_alignment_warnings
--   - v_sd_hierarchy
--   - v_baseline_with_rationale
--
-- STRATEGY:
-- Since legacy_id is deprecated and rarely used, we can simply drop the views
-- and recreate them without the legacy_id column. The CASCADE approach is used
-- with a backup of all view definitions first.
--
-- EXECUTION:
-- Copy this entire file and paste into Supabase SQL Editor, then run.
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION: Remove legacy_id column';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'This migration will:';
    RAISE NOTICE '1. Backup legacy_id values';
    RAISE NOTICE '2. Drop dependent views (CASCADE)';
    RAISE NOTICE '3. Drop legacy_id column';
    RAISE NOTICE '4. Views will need to be recreated manually';
    RAISE NOTICE '';
END $$;

BEGIN;

-- Step 1: Backup legacy_id values before removal
CREATE TABLE IF NOT EXISTS strategic_directives_v2_legacy_id_backup AS
SELECT uuid_id, id, legacy_id, title
FROM strategic_directives_v2
WHERE legacy_id IS NOT NULL;

DO $$
DECLARE
    backup_count INT;
BEGIN
    SELECT COUNT(*) INTO backup_count FROM strategic_directives_v2_legacy_id_backup;
    RAISE NOTICE '✓ Backed up % legacy_id values to strategic_directives_v2_legacy_id_backup', backup_count;
END $$;

-- Step 2: List views that will be dropped
DO $$
DECLARE
    view_rec RECORD;
    view_count INT := 0;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE 'Views that depend on legacy_id (will be dropped):';
    FOR view_rec IN
        SELECT DISTINCT dependent_view.relname as view_name
        FROM pg_depend
        JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid
        JOIN pg_class as dependent_view ON pg_rewrite.ev_class = dependent_view.oid
        JOIN pg_class as source_table ON pg_depend.refobjid = source_table.oid
        JOIN pg_attribute ON pg_depend.refobjid = pg_attribute.attrelid
            AND pg_depend.refobjsubid = pg_attribute.attnum
        WHERE source_table.relname = 'strategic_directives_v2'
        AND pg_attribute.attname = 'legacy_id'
        AND dependent_view.relkind = 'v'
    LOOP
        RAISE NOTICE '  - %', view_rec.view_name;
        view_count := view_count + 1;
    END LOOP;
    RAISE NOTICE 'Total: % views will be dropped', view_count;
END $$;

-- Step 3: Drop the legacy_id column with CASCADE
-- This will drop all dependent views
ALTER TABLE strategic_directives_v2
DROP COLUMN IF EXISTS legacy_id CASCADE;

-- Step 4: Verify removal
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'strategic_directives_v2'
        AND column_name = 'legacy_id'
    ) THEN
        RAISE NOTICE '';
        RAISE NOTICE '✓ SUCCESS: legacy_id column removed';
        RAISE NOTICE '';
        RAISE NOTICE '⚠ WARNING: Dependent views have been dropped!';
        RAISE NOTICE 'You may need to recreate views that were using legacy_id.';
        RAISE NOTICE 'Check for any application errors related to missing views.';
    ELSE
        RAISE WARNING '✗ FAILED: legacy_id column still exists';
    END IF;
END $$;

COMMIT;

-- Final status check
DO $$
DECLARE
    col RECORD;
    has_legacy_id BOOLEAN := FALSE;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION COMPLETE';
    RAISE NOTICE '========================================';

    FOR col IN
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'strategic_directives_v2'
        AND column_name IN ('id', 'uuid_id', 'uuid_internal_pk', 'legacy_id', 'sd_code_user_facing')
        ORDER BY column_name
    LOOP
        IF col.column_name = 'legacy_id' THEN
            has_legacy_id := TRUE;
        END IF;
        RAISE NOTICE '  Column present: %', col.column_name;
    END LOOP;

    IF NOT has_legacy_id THEN
        RAISE NOTICE '';
        RAISE NOTICE '✓ legacy_id successfully removed';
    END IF;
END $$;
