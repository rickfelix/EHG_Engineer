-- Migration: Fix Progress Trigger RLS Issues (V2)
-- Date: 2025-10-11
-- Issue: SD-SUBAGENT-IMPROVE-001 - Trigger cannot see handoffs due to RLS
-- Solution: Add SECURITY DEFINER to existing functions using ALTER FUNCTION

-- Note: Using ALTER FUNCTION instead of CREATE OR REPLACE to avoid issues
-- with function overloading (multiple signatures)

-- ============================================================================
-- Add SECURITY DEFINER to all progress-related functions
-- ============================================================================

-- 1. calculate_sd_progress (text version - OID 50334)
ALTER FUNCTION public.calculate_sd_progress(p_sd_id text)
  SECURITY DEFINER
  SET search_path = public;

COMMENT ON FUNCTION public.calculate_sd_progress(p_sd_id text) 
  IS 'Calculates SD progress. Uses SECURITY DEFINER to bypass RLS (SD-SUBAGENT-IMPROVE-001)';

-- 2. calculate_sd_progress (varchar version - OID 79073)
ALTER FUNCTION public.calculate_sd_progress(sd_id_param character varying)
  SECURITY DEFINER
  SET search_path = public;

COMMENT ON FUNCTION public.calculate_sd_progress(sd_id_param character varying)
  IS 'Calculates SD progress. Uses SECURITY DEFINER to bypass RLS (SD-SUBAGENT-IMPROVE-001)';

-- 3. get_progress_breakdown
ALTER FUNCTION public.get_progress_breakdown(sd_id_param character varying)
  SECURITY DEFINER
  SET search_path = public;

COMMENT ON FUNCTION public.get_progress_breakdown(sd_id_param character varying)
  IS 'Returns progress breakdown. Uses SECURITY DEFINER to bypass RLS (SD-SUBAGENT-IMPROVE-001)';

-- 4. enforce_progress_on_completion (trigger function)
ALTER FUNCTION public.enforce_progress_on_completion()
  SECURITY DEFINER
  SET search_path = public;

COMMENT ON FUNCTION public.enforce_progress_on_completion()
  IS 'Enforces 100% progress. Uses SECURITY DEFINER to bypass RLS (SD-SUBAGENT-IMPROVE-001)';

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
DECLARE
    rec RECORD;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '╔═══════════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║  Verification: SECURITY DEFINER Status                       ║';
    RAISE NOTICE '╚═══════════════════════════════════════════════════════════════╝';
    RAISE NOTICE '';
    
    FOR rec IN 
        SELECT 
            p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as signature,
            CASE WHEN p.prosecdef THEN '✅ ENABLED' ELSE '❌ DISABLED' END as status
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname IN ('calculate_sd_progress', 'get_progress_breakdown', 'enforce_progress_on_completion')
        AND n.nspname = 'public'
        ORDER BY p.proname, p.oid
    LOOP
        RAISE NOTICE '   %: %', rec.signature, rec.status;
    END LOOP;
    
    RAISE NOTICE '';
END $$;
