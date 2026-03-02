-- Migration: Audit and Fix RLS Policies on Chairman-related Tables
-- SD: SD-MAN-ORCH-CHAIRMAN-REBUILD-FOUNDATION-001-F
-- Date: 2026-03-02
--
-- Audits and corrects Row Level Security policies on 5 chairman-related tables.
-- RLS is already enabled on all 5 tables. This migration:
--   1. Drops overly-permissive policies (authenticated/public write access)
--   2. Ensures service_role full access policy exists on every table
--   3. Ensures authenticated read-only (SELECT) for UI-facing tables
--   4. Removes authenticated SELECT from internal-only tables
--
-- Tables:
--   chairman_decisions   — UI-facing (service_role ALL + authenticated SELECT)
--   chairman_preferences — UI-facing (service_role ALL + authenticated SELECT)
--   ventures             — UI-facing (service_role ALL + authenticated SELECT)
--   eva_orchestration_events — internal only (service_role ALL, no other access)
--   brainstorm_sessions  — UI-facing (already correct, no changes needed)
--
-- venture_stages excluded: table does not exist.

BEGIN;

-- ============================================================
-- 1. chairman_decisions — Fix: drop authenticated write, add service_role
-- ============================================================
-- Drop overly-permissive authenticated write policies
DROP POLICY IF EXISTS "chairman_decisions_insert_policy" ON public.chairman_decisions;
DROP POLICY IF EXISTS "chairman_decisions_update_policy" ON public.chairman_decisions;
DROP POLICY IF EXISTS "chairman_decisions_delete_policy" ON public.chairman_decisions;

-- Add service_role full access (if not exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'chairman_decisions'
    AND policyname = 'service_role_all_chairman_decisions'
  ) THEN
    CREATE POLICY service_role_all_chairman_decisions
      ON public.chairman_decisions
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Keep existing authenticated SELECT policy (chairman_decisions_select_policy)

-- ============================================================
-- 2. chairman_preferences — Fix: drop public policies, add correct ones
-- ============================================================
-- Drop overly-permissive public role policies
DROP POLICY IF EXISTS "chairman_preferences_insert" ON public.chairman_preferences;
DROP POLICY IF EXISTS "chairman_preferences_update" ON public.chairman_preferences;
DROP POLICY IF EXISTS "chairman_preferences_delete" ON public.chairman_preferences;
DROP POLICY IF EXISTS "chairman_preferences_select" ON public.chairman_preferences;

-- Add service_role full access
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'chairman_preferences'
    AND policyname = 'service_role_all_chairman_preferences'
  ) THEN
    CREATE POLICY service_role_all_chairman_preferences
      ON public.chairman_preferences
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Add authenticated read-only
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'chairman_preferences'
    AND policyname = 'authenticated_read_chairman_preferences'
  ) THEN
    CREATE POLICY authenticated_read_chairman_preferences
      ON public.chairman_preferences
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- ============================================================
-- 3. ventures — Fix: drop overlapping policies, keep correct ones
-- ============================================================
-- Drop overly-permissive policies
DROP POLICY IF EXISTS "Allow authenticated users to delete ventures" ON public.ventures;
DROP POLICY IF EXISTS "Allow authenticated users to insert ventures" ON public.ventures;
DROP POLICY IF EXISTS "Allow authenticated users to update ventures" ON public.ventures;
DROP POLICY IF EXISTS "Company access ventures" ON public.ventures;
DROP POLICY IF EXISTS "ventures_delete_policy" ON public.ventures;
DROP POLICY IF EXISTS "ventures_insert_policy" ON public.ventures;
DROP POLICY IF EXISTS "ventures_update_policy" ON public.ventures;
DROP POLICY IF EXISTS "ventures_select_policy" ON public.ventures;

-- Keep "Allow service_role to manage ventures" if it exists, otherwise create
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ventures'
    AND policyname = 'service_role_all_ventures'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ventures'
    AND policyname = 'Allow service_role to manage ventures'
  ) THEN
    CREATE POLICY service_role_all_ventures
      ON public.ventures
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Add authenticated read-only
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ventures'
    AND policyname = 'authenticated_read_ventures'
  ) THEN
    CREATE POLICY authenticated_read_ventures
      ON public.ventures
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- ============================================================
-- 4. eva_orchestration_events — Fix: remove authenticated SELECT
-- ============================================================
-- Drop authenticated access (internal table, service_role only)
DROP POLICY IF EXISTS "eva_orch_events_auth_select" ON public.eva_orchestration_events;

-- Revoke any remaining grants
REVOKE ALL ON public.eva_orchestration_events FROM anon;
REVOKE ALL ON public.eva_orchestration_events FROM authenticated;

-- Service role policy already exists (eva_orch_events_service_all) — no action needed

-- ============================================================
-- 5. brainstorm_sessions — Already correct, no changes needed
-- ============================================================
-- Policies already correct:
--   manage_brainstorm_sessions (ALL, service_role)
--   select_brainstorm_sessions (SELECT, authenticated)

COMMIT;
