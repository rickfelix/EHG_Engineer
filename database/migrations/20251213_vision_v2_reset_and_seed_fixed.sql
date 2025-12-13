-- ============================================================================
-- VISION V2 RESET AND SEED MIGRATION (FIXED)
-- ============================================================================
-- File: 20251213_vision_v2_reset_and_seed_fixed.sql
-- Purpose: Archive existing SDs/PRDs and seed Vision V2 Chairman's OS directives
--
-- FIX: Removed duplicate archived_at/archived_reason columns
--      (already included in LIKE ... INCLUDING ALL)
--
-- LEO Protocol Compliance: v4.3.3
-- SD Quality Rubric: 35% description, 30% objectives, 25% metrics, 10% risk
--
-- Vision Specification References:
--   - docs/vision/specs/01-database-schema.md (Database Schema)
--   - docs/vision/specs/02-api-contracts.md (API Contracts)
--   - docs/vision/specs/03-ui-components.md (UI Components)
--   - docs/vision/specs/04-eva-orchestration.md (EVA Orchestration)
--   - docs/vision/specs/06-hierarchical-agent-architecture.md (Agent Hierarchy)
--
-- Execution: psql -h <host> -U <user> -d <database> -f 20251213_vision_v2_reset_and_seed_fixed.sql
-- Rollback: SELECT governance_archive.restore_all_from_archive();
-- ============================================================================

BEGIN;

-- ============================================================================
-- PART 0: Pre-flight Checks
-- ============================================================================

DO $$
BEGIN
    -- Verify we're on the correct database (Supabase uses 'postgres' as database name)
    IF current_database() NOT LIKE '%ehg%' AND current_database() NOT LIKE '%engineer%' AND current_database() != 'postgres' THEN
        RAISE EXCEPTION 'Safety check failed: Expected EHG or postgres database, got %', current_database();
    END IF;

    -- Log migration start
    RAISE NOTICE 'Starting Vision V2 Reset and Seed Migration at %', NOW();
    RAISE NOTICE 'Database: %', current_database();
END $$;

-- ============================================================================
-- PART 1: Create Archive Schema
-- ============================================================================

-- Create governance_archive schema for soft-delete preservation
CREATE SCHEMA IF NOT EXISTS governance_archive;

COMMENT ON SCHEMA governance_archive IS
'Archive schema for Vision V2 migration. Contains pre-migration SDs and PRDs.
Created: 2025-12-13. Retention: 1 year. Query via governance_archive.* tables.';

-- ============================================================================
-- PART 2: Create Archive Tables (Mirror Structure)
-- ============================================================================

-- Archive table for strategic_directives
-- NOTE: archived_at, archived_by, archived_reason already exist in source table
--       so INCLUDING ALL will copy them. No need to re-add.
CREATE TABLE IF NOT EXISTS governance_archive.strategic_directives (
    LIKE public.strategic_directives_v2 INCLUDING ALL
);

-- Mark this as archive table in comment
COMMENT ON TABLE governance_archive.strategic_directives IS
'Archive of strategic_directives_v2 from Vision V2 migration. Contains all SDs before migration.';

-- Archive table for product_requirements
CREATE TABLE IF NOT EXISTS governance_archive.product_requirements (
    LIKE public.product_requirements_v2 INCLUDING ALL
);

COMMENT ON TABLE governance_archive.product_requirements IS
'Archive of product_requirements_v2 from Vision V2 migration. Contains all PRDs before migration.';

-- Archive table for sd_phase_tracking
CREATE TABLE IF NOT EXISTS governance_archive.sd_phase_tracking (
    LIKE public.sd_phase_tracking INCLUDING ALL
);

COMMENT ON TABLE governance_archive.sd_phase_tracking IS
'Archive of sd_phase_tracking from Vision V2 migration. Contains all phase tracking before migration.';

-- ============================================================================
-- PART 3: Create Restore Functions
-- ============================================================================

-- Function to restore a single SD from archive
CREATE OR REPLACE FUNCTION governance_archive.restore_sd_from_archive(p_sd_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_restored BOOLEAN := FALSE;
    v_columns TEXT;
BEGIN
    -- Get column list from target table
    SELECT string_agg(quote_ident(column_name), ', ')
    INTO v_columns
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'strategic_directives_v2';

    -- Restore the SD using dynamic SQL
    EXECUTE format(
        'INSERT INTO public.strategic_directives_v2 (%s)
         SELECT %s FROM governance_archive.strategic_directives
         WHERE id = $1 OR legacy_id = $1
         ON CONFLICT (id) DO NOTHING',
        v_columns, v_columns
    ) USING p_sd_id;

    IF FOUND THEN
        -- Get PRD columns
        SELECT string_agg(quote_ident(column_name), ', ')
        INTO v_columns
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'product_requirements_v2';

        -- Restore associated PRDs using dynamic SQL
        EXECUTE format(
            'INSERT INTO public.product_requirements_v2 (%s)
             SELECT %s FROM governance_archive.product_requirements
             WHERE sd_id = $1 OR sd_id IN (
                 SELECT id FROM governance_archive.strategic_directives WHERE legacy_id = $1
             )
             ON CONFLICT (id) DO NOTHING',
            v_columns, v_columns
        ) USING p_sd_id;

        v_restored := TRUE;
        RAISE NOTICE 'Restored SD % from archive', p_sd_id;
    ELSE
        RAISE WARNING 'SD % not found in archive', p_sd_id;
    END IF;

    RETURN v_restored;
END;
$$ LANGUAGE plpgsql;

-- Function to restore ALL from archive (full rollback)
CREATE OR REPLACE FUNCTION governance_archive.restore_all_from_archive()
RETURNS TABLE(sds_restored INT, prds_restored INT, progress_restored INT) AS $$
DECLARE
    v_sds INT := 0;
    v_prds INT := 0;
    v_progress INT := 0;
    v_columns TEXT;
BEGIN
    -- Get SD column list from target table
    SELECT string_agg(quote_ident(column_name), ', ')
    INTO v_columns
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'strategic_directives_v2';

    -- Restore all SDs using dynamic SQL
    EXECUTE format(
        'INSERT INTO public.strategic_directives_v2 (%s)
         SELECT %s FROM governance_archive.strategic_directives
         ON CONFLICT (id) DO NOTHING',
        v_columns, v_columns
    );
    GET DIAGNOSTICS v_sds = ROW_COUNT;

    -- Get PRD column list from target table
    SELECT string_agg(quote_ident(column_name), ', ')
    INTO v_columns
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'product_requirements_v2';

    -- Restore all PRDs using dynamic SQL
    EXECUTE format(
        'INSERT INTO public.product_requirements_v2 (%s)
         SELECT %s FROM governance_archive.product_requirements
         ON CONFLICT (id) DO NOTHING',
        v_columns, v_columns
    );
    GET DIAGNOSTICS v_prds = ROW_COUNT;

    -- Phase tracking restore skipped (can be added if needed)
    v_progress := 0;

    RAISE NOTICE 'Full restore complete: % SDs, % PRDs, % progress records', v_sds, v_prds, v_progress;

    RETURN QUERY SELECT v_sds, v_prds, v_progress;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 4: Archive Existing Data
-- ============================================================================

-- Archive all existing strategic_directives (except Vision V2)
INSERT INTO governance_archive.strategic_directives
SELECT *
FROM public.strategic_directives_v2
WHERE id NOT LIKE 'SD-VISION-V2-%';

-- Archive all existing product_requirements (except Vision V2)
INSERT INTO governance_archive.product_requirements
SELECT *
FROM public.product_requirements_v2
WHERE sd_id NOT LIKE 'SD-VISION-V2-%'
  AND sd_id NOT IN (SELECT id FROM public.strategic_directives_v2 WHERE id LIKE 'SD-VISION-V2-%');

-- Archive all existing sd_phase_tracking (except Vision V2)
INSERT INTO governance_archive.sd_phase_tracking
SELECT *
FROM public.sd_phase_tracking
WHERE sd_id NOT LIKE 'SD-VISION-V2-%';

-- Log archive counts
DO $$
DECLARE
    v_sd_count INT;
    v_prd_count INT;
    v_progress_count INT;
BEGIN
    SELECT COUNT(*) INTO v_sd_count FROM governance_archive.strategic_directives;
    SELECT COUNT(*) INTO v_prd_count FROM governance_archive.product_requirements;
    SELECT COUNT(*) INTO v_progress_count FROM governance_archive.sd_phase_tracking;

    RAISE NOTICE 'Archived: % SDs, % PRDs, % progress records', v_sd_count, v_prd_count, v_progress_count;
END $$;

-- ============================================================================
-- PART 5: Delete Archived Data from Main Tables
-- ============================================================================

-- Delete phase progress first (FK dependency)
DELETE FROM public.sd_phase_tracking
WHERE sd_id NOT LIKE 'SD-VISION-V2-%';

-- Delete PRDs (FK dependency)
DELETE FROM public.product_requirements_v2
WHERE sd_id NOT LIKE 'SD-VISION-V2-%'
  AND sd_id NOT IN (SELECT id FROM public.strategic_directives_v2 WHERE id LIKE 'SD-VISION-V2-%');

-- Delete SDs (preserve any existing Vision V2 SDs)
DELETE FROM public.strategic_directives_v2
WHERE id NOT LIKE 'SD-VISION-V2-%';

-- Log deletion counts
DO $$
DECLARE
    v_remaining INT;
BEGIN
    SELECT COUNT(*) INTO v_remaining FROM public.strategic_directives_v2;
    RAISE NOTICE 'Main tables cleared. Remaining SDs: %', v_remaining;
END $$;
