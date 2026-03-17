-- Migration: Fix Defective RLS Policies
-- SD: SD-LEO-FIX-RLS-DEFECTIVE-POLICY-001
-- Date: 2026-03-17
-- Author: DATABASE-AGENT
--
-- Summary: RLS semantic audit found policies targeting {public} roles (open to all
-- including anonymous) on domain_knowledge and claude_code_releases. This migration
-- drops defective policies and creates properly scoped replacements with explicit
-- TO service_role targeting. Also proactively drops any residual anon policies on
-- directive_submissions.
--
-- IDEMPOTENT: All operations use DROP POLICY IF EXISTS before CREATE POLICY.
-- Both old (defective) and new (fixed) policy names are dropped before creation,
-- ensuring safe re-execution. Safe to run multiple times.

BEGIN;

-- ============================================================================
-- TABLE 1: domain_knowledge
-- ============================================================================
-- DEFECT: Policy "service_role_all" targeted {public} roles.
--   While qual checks auth.role()='service_role', the policy APPLIED to all roles.
--   Correct approach: target service_role directly so policy only applies to that role.
--
-- FIX: Drop defective policy, ensure properly scoped policy exists.

-- Drop the defective policy (original name from audit)
DROP POLICY IF EXISTS "service_role_all" ON public.domain_knowledge;

-- Drop and recreate the correct policy (idempotent)
DROP POLICY IF EXISTS "Allow all operations for service role" ON public.domain_knowledge;

CREATE POLICY "Allow all operations for service role"
  ON public.domain_knowledge
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- TABLE 2: claude_code_releases
-- ============================================================================
-- DEFECT: Policy "Service role full access on claude_code_releases" targeted {public}
--   with qual=true AND with_check=true. COMPLETELY OPEN - any role (including anon)
--   could SELECT, INSERT, UPDATE, DELETE with no restrictions.
--
-- FIX: Drop defective policy, ensure properly scoped policy exists.

-- Drop the defective policy (original name from audit)
DROP POLICY IF EXISTS "Service role full access on claude_code_releases" ON public.claude_code_releases;

-- Drop and recreate the correct policy (idempotent)
DROP POLICY IF EXISTS "Allow all operations for service role" ON public.claude_code_releases;

CREATE POLICY "Allow all operations for service role"
  ON public.claude_code_releases
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- TABLE 3: confidence_calibration_log
-- ============================================================================
-- FINDING: Table does NOT exist in the consolidated database (dedlbzhpgkmetvhbkyzq).
-- The RLS audit identified it but it was likely dropped or never migrated to the
-- consolidated database. No DDL action required.
-- If this table is recreated in the future, ensure RLS policies target service_role
-- explicitly from the start.

-- ============================================================================
-- TABLE 4: directive_submissions
-- ============================================================================
-- FINDING: Current policies are properly scoped:
--   - "authenticated_read_directive_submissions" (SELECT for authenticated) - CORRECT
--   - "service_role_all_directive_submissions" (ALL for service_role) - CORRECT
-- The audit identified potential anon INSERT/UPDATE policies from November 2025.
-- These appear to have been removed already, but we proactively drop them if they
-- exist as a defensive measure.

DROP POLICY IF EXISTS "anon_insert_directive_submissions" ON public.directive_submissions;
DROP POLICY IF EXISTS "anon_update_directive_submissions" ON public.directive_submissions;
DROP POLICY IF EXISTS "allow_anon_insert" ON public.directive_submissions;
DROP POLICY IF EXISTS "allow_anon_update" ON public.directive_submissions;
DROP POLICY IF EXISTS "anon_insert" ON public.directive_submissions;
DROP POLICY IF EXISTS "anon_update" ON public.directive_submissions;

COMMIT;

-- ============================================================================
-- ROLLBACK SQL (manual execution if needed)
-- ============================================================================
-- To restore the ORIGINAL (defective) policies:
--
-- DROP POLICY IF EXISTS "Allow all operations for service role" ON public.domain_knowledge;
-- CREATE POLICY "service_role_all" ON public.domain_knowledge FOR ALL TO public
--   USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
--
-- DROP POLICY IF EXISTS "Allow all operations for service role" ON public.claude_code_releases;
-- CREATE POLICY "Service role full access on claude_code_releases"
--   ON public.claude_code_releases FOR ALL TO public USING (true) WITH CHECK (true);
--
-- NOTE: Rolling back would RESTORE the security vulnerability. Only do this if
-- the fix causes unexpected application breakage.
