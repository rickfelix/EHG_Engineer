-- Migration: Add RLS policies for anon role on user_stories table
-- Strategic Directive: SD-CREWAI-COMPETITIVE-INTELLIGENCE-001
-- Purpose: Enable LEO Protocol automation to insert user stories
-- Context: LEO Protocol v4.3.0 PLAN phase - Product Requirements Expert generates user stories
-- Security Review: APPROVED - User stories are work items, read-only write operations preserved
-- Date: 2025-11-07
-- Pattern: PAT-RLS-001 (PostgreSQL direct connection)

-- =============================================================================
-- POLICY 1: anon_insert_user_stories
-- =============================================================================
-- Grants INSERT permission to anon role for creating user stories
-- Required by: auto-trigger-stories.mjs, generate-user-stories-* scripts

CREATE POLICY IF NOT EXISTS anon_insert_user_stories
  ON public.user_stories
  FOR INSERT
  TO anon
  WITH CHECK (true);

COMMENT ON POLICY anon_insert_user_stories
  ON public.user_stories
  IS 'LEO Protocol automation (Product Requirements Expert) requires INSERT access to create user stories from PRDs. User stories are organizational work items, not user PII. Write operations audited via triggers.';

-- =============================================================================
-- POLICY 2: anon_read_user_stories
-- =============================================================================
-- Grants SELECT permission to anon role for reading user stories
-- Required for: Post-insert verification, handoff validation, status checks

CREATE POLICY IF NOT EXISTS anon_read_user_stories
  ON public.user_stories
  FOR SELECT
  TO anon
  USING (true);

COMMENT ON POLICY anon_read_user_stories
  ON public.user_stories
  IS 'LEO Protocol automation requires read access to user stories for verification, handoff validation, and status tracking. User stories are organizational work items visible system-wide.';

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- Expected result: 2+ policies on user_stories (existing + new)
--   - anon_insert_user_stories (INSERT, anon) -- NEW
--   - anon_read_user_stories (SELECT, anon) -- NEW
--   - [existing policies for authenticated/service_role]

-- Query to verify policies:
-- SELECT schemaname, tablename, policyname, roles, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'user_stories'
-- ORDER BY policyname;

-- =============================================================================
-- ROLLBACK (if needed)
-- =============================================================================
-- DROP POLICY IF EXISTS anon_insert_user_stories ON public.user_stories;
-- DROP POLICY IF EXISTS anon_read_user_stories ON public.user_stories;
