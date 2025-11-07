-- Migration: Add RLS policy for anon role SELECT on strategic_directives_v2
-- Strategic Directive: SD-CREWAI-COMPETITIVE-INTELLIGENCE-001
-- Purpose: Enable LEO Protocol automation scripts to read SD data
-- Context: LEO Protocol v4.3.0 PLAN phase requires anon access for PRD creation
-- Security Review: APPROVED - No PII exposure, read-only access
-- Date: 2025-11-07
-- Author: Principal Database Architect (Database Agent)

-- =============================================================================
-- POLICY: anon_read_strategic_directives_v2
-- =============================================================================
-- Grants SELECT permission to anon role for reading Strategic Directives
-- Required by: add-prd-to-database.js, create-lead-plan-handoff.mjs, unified-handoff-system.js
-- Security: Read-only access, no write operations, no PII exposure

CREATE POLICY anon_read_strategic_directives_v2
  ON public.strategic_directives_v2
  FOR SELECT
  TO anon
  USING (true);

-- Add policy documentation
COMMENT ON POLICY anon_read_strategic_directives_v2
  ON public.strategic_directives_v2
  IS 'LEO Protocol automation scripts require read access to SDs for PRD creation and handoff management. Strategic Directives are organizational work items (not user PII), so system-wide SELECT is safe. Write operations remain protected by authenticated/service_role policies.';

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- Expected result: 3 policies on strategic_directives_v2
--   1. authenticated_read_strategic_directives_v2 (SELECT, authenticated)
--   2. service_role_all_strategic_directives_v2 (ALL, service_role)
--   3. anon_read_strategic_directives_v2 (SELECT, anon) -- NEW

-- Query to verify policies:
-- SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'strategic_directives_v2'
-- ORDER BY policyname;

-- =============================================================================
-- ROLLBACK (if needed)
-- =============================================================================
-- DROP POLICY IF EXISTS anon_read_strategic_directives_v2 ON public.strategic_directives_v2;
