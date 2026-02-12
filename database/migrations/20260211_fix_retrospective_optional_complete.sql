-- ============================================================================
-- Migration: Fix Template-Based Progress for Optional Retrospectives
-- Issue: SD-LEO-FIX-REMEDIATE-LEARNING-PIPELINE-001 blocked at 90%
-- Root Cause: Template system and progress calculation didn't respect
--             requires_retrospective flag from sd_type_validation_profiles
-- Date: 2026-02-11
-- ============================================================================

-- ANALYSIS:
-- 1. get_progress_breakdown() uses templates but didn't check requires_retrospective
-- 2. calculate_sd_progress() had its own logic that also ignored requires_retrospective
-- 3. For bugfix SDs, requires_retrospective = false, so 10% retrospective weight
--    should be auto-granted even if no retrospective record exists

-- FIX:
-- 1. Update get_progress_breakdown() template evaluation for 'artifact:retrospective'
-- 2. Update get_progress_breakdown() hardcoded fallback logic
-- 3. Update calculate_sd_progress() to delegate to get_progress_breakdown()

-- ============================================================================
-- PART 1: Update get_progress_breakdown (already applied in previous migration)
-- This is documented here for completeness
-- ============================================================================

-- See migration: 20260211_fix_template_retrospective_optional.sql
-- Key changes:
-- - Line 339-346: Check requires_retrospective flag in template evaluation
-- - Line 251-270: Check requires_retrospective flag in hardcoded orchestrator logic
-- - Line 318-335: Check requires_retrospective flag in hardcoded standard SD logic

-- ============================================================================
-- PART 2: Update calculate_sd_progress to delegate to get_progress_breakdown
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_sd_progress(sd_id_param text)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  breakdown JSONB;
BEGIN
  -- Use get_progress_breakdown which has the fixed logic
  -- This ensures consistency and respects requires_retrospective flag
  breakdown := get_progress_breakdown(sd_id_param);

  -- Handle error case
  IF breakdown->>'error' IS NOT NULL THEN
    RETURN NULL;
  END IF;

  -- Return total_progress from breakdown
  RETURN (breakdown->>'total_progress')::INT;
END;
$$;

COMMENT ON FUNCTION calculate_sd_progress IS
'Calculates SD progress by delegating to get_progress_breakdown.
Ensures consistency between progress calculation and breakdown display.
Respects requires_retrospective flag from sd_type_validation_profiles - auto-grants retrospective weight for SD types that do not require it.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
  progress INT;
  breakdown JSONB;
BEGIN
  -- Test on SD-LEO-FIX-REMEDIATE-LEARNING-PIPELINE-001 (bugfix with requires_retrospective=false)
  SELECT calculate_sd_progress('f657aa24-1b7a-4af6-98ca-993e21322695') INTO progress;
  SELECT get_progress_breakdown('f657aa24-1b7a-4af6-98ca-993e21322695') INTO breakdown;

  IF progress = 100 AND (breakdown->'phase_breakdown'->'RETROSPECTIVE'->>'complete')::BOOLEAN = true THEN
    RAISE NOTICE '✓ Migration verified successfully';
    RAISE NOTICE '  - Progress: 100%%';
    RAISE NOTICE '  - RETROSPECTIVE auto-granted (requires_retrospective=false)';
  ELSE
    RAISE WARNING '⚠ Verification issue:';
    RAISE WARNING '  - Progress: %%', progress;
    RAISE WARNING '  - RETROSPECTIVE complete: %', breakdown->'phase_breakdown'->'RETROSPECTIVE'->>'complete';
  END IF;
END $$;
