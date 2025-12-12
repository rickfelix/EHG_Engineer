-- Fix SECURITY DEFINER for check_sd_can_complete function
-- Date: 2025-12-11
-- Issue: SD-VISION-TRANSITION-001E - check_sd_can_complete missing SECURITY DEFINER
-- Root Cause: Migration 20251211_fix_progress_trigger_rls_access.sql included the fix
--             but it was not applied (migration may have been created after deployment)
-- Solution: Apply SECURITY DEFINER to check_sd_can_complete to match other progress functions
-- Related: 20251211_fix_progress_trigger_rls_access.sql, 20251011_fix_progress_trigger_rls_v2.sql

-- ============================================================================
-- BACKGROUND
-- ============================================================================
-- The enforce_progress_trigger on strategic_directives_v2 table was blocking
-- SD completion because it couldn't see retrospectives due to RLS policies.
--
-- RLS Policies on retrospectives table:
--   - authenticated_read_retrospectives: SELECT for authenticated users
--   - service_role_all_retrospectives: ALL for service_role
--
-- When trigger functions execute, they run with the privileges of the user
-- making the UPDATE, not the function owner. This means RLS policies apply
-- and block access to retrospectives.
--
-- Solution: SECURITY DEFINER causes functions to execute with the privileges
-- of the function owner (postgres superuser), bypassing RLS.
--
-- Pattern established in:
--   - 20251011_fix_progress_trigger_rls.sql (initial fix)
--   - 20251011_fix_progress_trigger_rls_v2.sql (ALTER FUNCTION version)
--   - 20251211_fix_progress_trigger_rls_access.sql (comprehensive fix)

-- ============================================================================
-- FUNCTION: check_sd_can_complete (add SECURITY DEFINER)
-- ============================================================================

-- This function was defined in 20251211_fix_progress_trigger_rls_access.sql
-- but the SECURITY DEFINER was not applied in production. This migration
-- ensures it has the same privileges as the other progress functions.

ALTER FUNCTION check_sd_can_complete(sd_id_param VARCHAR)
  SECURITY DEFINER
  SET search_path = public;

COMMENT ON FUNCTION check_sd_can_complete IS
'Helper function to check if SD can be completed with SECURITY DEFINER for RLS access. Returns blockers if any. (SD-VISION-TRANSITION-001E)';

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
DECLARE
  rec RECORD;
  all_secure BOOLEAN := true;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Validating SECURITY DEFINER on Progress Functions';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';

  FOR rec IN
    SELECT
      p.proname,
      p.prosecdef,
      CASE WHEN p.prosecdef THEN '✅ ENABLED' ELSE '❌ MISSING' END as status
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname IN (
      'calculate_sd_progress',
      'get_progress_breakdown',
      'auto_calculate_progress',
      'enforce_progress_on_completion',
      'check_sd_can_complete'
    )
    AND n.nspname = 'public'
    ORDER BY p.proname
  LOOP
    RAISE NOTICE '  %: %', rec.proname, rec.status;
    IF NOT rec.prosecdef THEN
      all_secure := false;
    END IF;
  END LOOP;

  RAISE NOTICE '';
  IF all_secure THEN
    RAISE NOTICE '✅ All progress functions have SECURITY DEFINER';
    RAISE NOTICE '✅ Triggers can now bypass RLS and access:';
    RAISE NOTICE '     - retrospectives table';
    RAISE NOTICE '     - product_requirements_v2 table';
    RAISE NOTICE '     - sd_scope_deliverables table';
    RAISE NOTICE '     - user_stories table';
    RAISE NOTICE '     - sd_phase_handoffs table';
  ELSE
    RAISE WARNING '⚠️  Some functions missing SECURITY DEFINER';
  END IF;
  RAISE NOTICE '============================================================';
END $$;
