-- ============================================================================
-- LEO Protocol - Archive Table RLS
-- Migration: 20251227_archive_table_rls.sql
-- ============================================================================
-- Purpose: Add RLS policies to archive tables missing security policies
--
-- Tables needing RLS:
--   - sub_agent_execution_results_archive: No RLS enabled
-- ============================================================================

-- sub_agent_execution_results_archive: Enable RLS and add policies
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sub_agent_execution_results_archive') THEN
    -- Enable RLS
    ALTER TABLE sub_agent_execution_results_archive ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE 'Enabled RLS on sub_agent_execution_results_archive';

    -- Add SELECT policy if missing
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'sub_agent_execution_results_archive'
      AND policyname = 'Allow select for authenticated'
    ) THEN
      CREATE POLICY "Allow select for authenticated" ON sub_agent_execution_results_archive
        FOR SELECT TO authenticated USING (true);
      RAISE NOTICE 'Created SELECT policy on sub_agent_execution_results_archive';
    END IF;

    -- Add INSERT policy if missing
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'sub_agent_execution_results_archive'
      AND policyname = 'Allow insert for authenticated'
    ) THEN
      CREATE POLICY "Allow insert for authenticated" ON sub_agent_execution_results_archive
        FOR INSERT TO authenticated WITH CHECK (true);
      RAISE NOTICE 'Created INSERT policy on sub_agent_execution_results_archive';
    END IF;

    -- Add UPDATE policy if missing
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'sub_agent_execution_results_archive'
      AND policyname = 'Allow update for authenticated'
    ) THEN
      CREATE POLICY "Allow update for authenticated" ON sub_agent_execution_results_archive
        FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
      RAISE NOTICE 'Created UPDATE policy on sub_agent_execution_results_archive';
    END IF;

    -- Add DELETE policy if missing
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'sub_agent_execution_results_archive'
      AND policyname = 'Allow delete for authenticated'
    ) THEN
      CREATE POLICY "Allow delete for authenticated" ON sub_agent_execution_results_archive
        FOR DELETE TO authenticated USING (true);
      RAISE NOTICE 'Created DELETE policy on sub_agent_execution_results_archive';
    END IF;
  ELSE
    RAISE NOTICE 'Table sub_agent_execution_results_archive does not exist, skipping';
  END IF;
END $$;

-- Verification
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sub_agent_execution_results_archive') THEN
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sub_agent_execution_results_archive';
    RAISE NOTICE 'Verification: sub_agent_execution_results_archive has % policies', policy_count;
  ELSE
    RAISE NOTICE 'Verification: sub_agent_execution_results_archive does not exist';
  END IF;
END $$;
