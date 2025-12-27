-- ============================================================================
-- LEO Protocol - Complete RLS Coverage
-- Migration: 20251227_complete_rls_coverage.sql
-- ============================================================================
-- Purpose: Add missing RLS policies to tables with partial coverage
--
-- Tables with partial coverage (missing specific operations):
--   - cultural_design_styles: Missing INSERT, UPDATE
--   - eva_agent_communications: Missing INSERT, UPDATE
--   - financial_models: Missing DELETE
--   - intelligence_analysis: Missing UPDATE
--   - orchestration_metrics: Missing INSERT, UPDATE
--   - schema_migrations: Missing UPDATE
-- ============================================================================

-- cultural_design_styles: Add INSERT and UPDATE policies
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cultural_design_styles') THEN
    -- Ensure RLS is enabled
    ALTER TABLE cultural_design_styles ENABLE ROW LEVEL SECURITY;

    -- Add INSERT policy if missing
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'cultural_design_styles'
      AND policyname = 'Allow insert for authenticated'
    ) THEN
      CREATE POLICY "Allow insert for authenticated" ON cultural_design_styles
        FOR INSERT TO authenticated WITH CHECK (true);
      RAISE NOTICE 'Created INSERT policy on cultural_design_styles';
    END IF;

    -- Add UPDATE policy if missing
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'cultural_design_styles'
      AND policyname = 'Allow update for authenticated'
    ) THEN
      CREATE POLICY "Allow update for authenticated" ON cultural_design_styles
        FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
      RAISE NOTICE 'Created UPDATE policy on cultural_design_styles';
    END IF;
  ELSE
    RAISE NOTICE 'Table cultural_design_styles does not exist, skipping';
  END IF;
END $$;

-- eva_agent_communications: Add INSERT and UPDATE policies
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'eva_agent_communications') THEN
    ALTER TABLE eva_agent_communications ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'eva_agent_communications'
      AND policyname = 'Allow insert for authenticated'
    ) THEN
      CREATE POLICY "Allow insert for authenticated" ON eva_agent_communications
        FOR INSERT TO authenticated WITH CHECK (true);
      RAISE NOTICE 'Created INSERT policy on eva_agent_communications';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'eva_agent_communications'
      AND policyname = 'Allow update for authenticated'
    ) THEN
      CREATE POLICY "Allow update for authenticated" ON eva_agent_communications
        FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
      RAISE NOTICE 'Created UPDATE policy on eva_agent_communications';
    END IF;
  ELSE
    RAISE NOTICE 'Table eva_agent_communications does not exist, skipping';
  END IF;
END $$;

-- financial_models: Add DELETE policy
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'financial_models') THEN
    ALTER TABLE financial_models ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'financial_models'
      AND policyname = 'Allow delete for authenticated'
    ) THEN
      CREATE POLICY "Allow delete for authenticated" ON financial_models
        FOR DELETE TO authenticated USING (true);
      RAISE NOTICE 'Created DELETE policy on financial_models';
    END IF;
  ELSE
    RAISE NOTICE 'Table financial_models does not exist, skipping';
  END IF;
END $$;

-- intelligence_analysis: Add UPDATE policy
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'intelligence_analysis') THEN
    ALTER TABLE intelligence_analysis ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'intelligence_analysis'
      AND policyname = 'Allow update for authenticated'
    ) THEN
      CREATE POLICY "Allow update for authenticated" ON intelligence_analysis
        FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
      RAISE NOTICE 'Created UPDATE policy on intelligence_analysis';
    END IF;
  ELSE
    RAISE NOTICE 'Table intelligence_analysis does not exist, skipping';
  END IF;
END $$;

-- orchestration_metrics: Add INSERT and UPDATE policies
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'orchestration_metrics') THEN
    ALTER TABLE orchestration_metrics ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'orchestration_metrics'
      AND policyname = 'Allow insert for authenticated'
    ) THEN
      CREATE POLICY "Allow insert for authenticated" ON orchestration_metrics
        FOR INSERT TO authenticated WITH CHECK (true);
      RAISE NOTICE 'Created INSERT policy on orchestration_metrics';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'orchestration_metrics'
      AND policyname = 'Allow update for authenticated'
    ) THEN
      CREATE POLICY "Allow update for authenticated" ON orchestration_metrics
        FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
      RAISE NOTICE 'Created UPDATE policy on orchestration_metrics';
    END IF;
  ELSE
    RAISE NOTICE 'Table orchestration_metrics does not exist, skipping';
  END IF;
END $$;

-- schema_migrations: Add UPDATE policy (read-only table, but adding for completeness)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'schema_migrations') THEN
    ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'schema_migrations'
      AND policyname = 'Allow update for authenticated'
    ) THEN
      CREATE POLICY "Allow update for authenticated" ON schema_migrations
        FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
      RAISE NOTICE 'Created UPDATE policy on schema_migrations';
    END IF;
  ELSE
    RAISE NOTICE 'Table schema_migrations does not exist, skipping';
  END IF;
END $$;

-- Verification
DO $$
DECLARE
  tables_to_check TEXT[] := ARRAY[
    'cultural_design_styles',
    'eva_agent_communications',
    'financial_models',
    'intelligence_analysis',
    'orchestration_metrics',
    'schema_migrations'
  ];
  tbl TEXT;
  policy_count INTEGER;
BEGIN
  RAISE NOTICE 'Verification of RLS policies:';
  FOREACH tbl IN ARRAY tables_to_check
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
      SELECT COUNT(*) INTO policy_count
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl;
      RAISE NOTICE '  %: % policies', tbl, policy_count;
    ELSE
      RAISE NOTICE '  %: table does not exist', tbl;
    END IF;
  END LOOP;
END $$;
