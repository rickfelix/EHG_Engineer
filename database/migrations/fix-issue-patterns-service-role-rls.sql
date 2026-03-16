-- Migration: fix-issue-patterns-service-role-rls.sql
-- Date: 2026-03-16
-- Description: Add missing RLS policy for service_role on issue_patterns table
--
-- Problem: Scripts using SUPABASE_SERVICE_ROLE_KEY to query issue_patterns
--   received "Invalid API key" errors because no RLS policy existed for the
--   service_role role. Only authenticated and public role policies existed.
--
-- Fix: Grant service_role full access (SELECT, INSERT, UPDATE, DELETE) via
--   a permissive ALL policy with no row-level restrictions.
--
-- Applied to: dedlbzhpgkmetvhbkyzq (consolidated database)
-- Applied on: 2026-03-16
--
-- Idempotent: No (will error if policy already exists)
-- Pre-check: SELECT policyname FROM pg_policies WHERE tablename = 'issue_patterns' AND roles::text LIKE '%service_role%';

CREATE POLICY "Allow service_role full access to issue_patterns"
  ON public.issue_patterns
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Verification query:
-- SELECT policyname, permissive, roles, cmd
-- FROM pg_policies
-- WHERE tablename = 'issue_patterns'
-- ORDER BY policyname;

-- Rollback:
-- DROP POLICY "Allow service_role full access to issue_patterns" ON public.issue_patterns;
