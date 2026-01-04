-- ============================================================================
-- LEO Protocol - Fix RLS Coverage Gaps
-- Migration: 20260104_fix_rls_coverage_gaps.sql
-- SD: SD-RLS-COVERAGE-001
-- ============================================================================
-- Purpose: Fix CI failures by adding RLS to 7 tables missing RLS entirely
--          and adding missing policies to 8 tables with partial coverage
--
-- Tables Missing RLS (7):
--   - continuous_execution_log
--   - scaffold_patterns
--   - sd_baseline_rationale
--   - sd_checkpoint_history
--   - sd_type_change_audit
--   - simulation_sessions
--   - soul_extractions
--
-- Tables with Partial Coverage (8):
--   - audit_triangulation_log: missing UPDATE, DELETE
--   - fit_gate_scores: missing DELETE
--   - retrospective_contributions: missing UPDATE, DELETE
--   - runtime_audits: missing DELETE
--   - stage_events: missing UPDATE
--   - venture_archetypes: missing INSERT, UPDATE
--   - venture_decisions: missing DELETE
--   - venture_token_ledger: missing UPDATE
-- ============================================================================

-- ============================================================================
-- PART 1: TABLES MISSING RLS ENTIRELY
-- ============================================================================

-- 1. continuous_execution_log
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'continuous_execution_log') THEN
    ALTER TABLE continuous_execution_log ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'continuous_execution_log' AND policyname = 'Allow all for authenticated') THEN
      CREATE POLICY "Allow all for authenticated" ON continuous_execution_log
        FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'continuous_execution_log' AND policyname = 'Allow select for anon') THEN
      CREATE POLICY "Allow select for anon" ON continuous_execution_log
        FOR SELECT TO anon USING (true);
    END IF;

    RAISE NOTICE 'Fixed RLS on continuous_execution_log';
  END IF;
END $$;

-- 2. scaffold_patterns
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'scaffold_patterns') THEN
    ALTER TABLE scaffold_patterns ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scaffold_patterns' AND policyname = 'Allow all for authenticated') THEN
      CREATE POLICY "Allow all for authenticated" ON scaffold_patterns
        FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scaffold_patterns' AND policyname = 'Allow select for anon') THEN
      CREATE POLICY "Allow select for anon" ON scaffold_patterns
        FOR SELECT TO anon USING (true);
    END IF;

    RAISE NOTICE 'Fixed RLS on scaffold_patterns';
  END IF;
END $$;

-- 3. sd_baseline_rationale
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sd_baseline_rationale') THEN
    ALTER TABLE sd_baseline_rationale ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sd_baseline_rationale' AND policyname = 'Allow all for authenticated') THEN
      CREATE POLICY "Allow all for authenticated" ON sd_baseline_rationale
        FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sd_baseline_rationale' AND policyname = 'Allow select for anon') THEN
      CREATE POLICY "Allow select for anon" ON sd_baseline_rationale
        FOR SELECT TO anon USING (true);
    END IF;

    RAISE NOTICE 'Fixed RLS on sd_baseline_rationale';
  END IF;
END $$;

-- 4. sd_checkpoint_history
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sd_checkpoint_history') THEN
    ALTER TABLE sd_checkpoint_history ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sd_checkpoint_history' AND policyname = 'Allow all for authenticated') THEN
      CREATE POLICY "Allow all for authenticated" ON sd_checkpoint_history
        FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sd_checkpoint_history' AND policyname = 'Allow select for anon') THEN
      CREATE POLICY "Allow select for anon" ON sd_checkpoint_history
        FOR SELECT TO anon USING (true);
    END IF;

    RAISE NOTICE 'Fixed RLS on sd_checkpoint_history';
  END IF;
END $$;

-- 5. sd_type_change_audit
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sd_type_change_audit') THEN
    ALTER TABLE sd_type_change_audit ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sd_type_change_audit' AND policyname = 'Allow all for authenticated') THEN
      CREATE POLICY "Allow all for authenticated" ON sd_type_change_audit
        FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sd_type_change_audit' AND policyname = 'Allow select for anon') THEN
      CREATE POLICY "Allow select for anon" ON sd_type_change_audit
        FOR SELECT TO anon USING (true);
    END IF;

    RAISE NOTICE 'Fixed RLS on sd_type_change_audit';
  END IF;
END $$;

-- 6. simulation_sessions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'simulation_sessions') THEN
    ALTER TABLE simulation_sessions ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'simulation_sessions' AND policyname = 'Allow all for authenticated') THEN
      CREATE POLICY "Allow all for authenticated" ON simulation_sessions
        FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'simulation_sessions' AND policyname = 'Allow select for anon') THEN
      CREATE POLICY "Allow select for anon" ON simulation_sessions
        FOR SELECT TO anon USING (true);
    END IF;

    RAISE NOTICE 'Fixed RLS on simulation_sessions';
  END IF;
END $$;

-- 7. soul_extractions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'soul_extractions') THEN
    ALTER TABLE soul_extractions ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'soul_extractions' AND policyname = 'Allow all for authenticated') THEN
      CREATE POLICY "Allow all for authenticated" ON soul_extractions
        FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'soul_extractions' AND policyname = 'Allow select for anon') THEN
      CREATE POLICY "Allow select for anon" ON soul_extractions
        FOR SELECT TO anon USING (true);
    END IF;

    RAISE NOTICE 'Fixed RLS on soul_extractions';
  END IF;
END $$;

-- ============================================================================
-- PART 2: TABLES WITH PARTIAL COVERAGE (Missing Specific Operations)
-- ============================================================================

-- 1. audit_triangulation_log: Add UPDATE and DELETE
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_triangulation_log') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_triangulation_log' AND policyname = 'Allow update for authenticated') THEN
      CREATE POLICY "Allow update for authenticated" ON audit_triangulation_log
        FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_triangulation_log' AND policyname = 'Allow delete for authenticated') THEN
      CREATE POLICY "Allow delete for authenticated" ON audit_triangulation_log
        FOR DELETE TO authenticated USING (true);
    END IF;

    RAISE NOTICE 'Fixed partial coverage on audit_triangulation_log';
  END IF;
END $$;

-- 2. fit_gate_scores: Add DELETE
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'fit_gate_scores') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'fit_gate_scores' AND policyname = 'Allow delete for authenticated') THEN
      CREATE POLICY "Allow delete for authenticated" ON fit_gate_scores
        FOR DELETE TO authenticated USING (true);
    END IF;

    RAISE NOTICE 'Fixed partial coverage on fit_gate_scores';
  END IF;
END $$;

-- 3. retrospective_contributions: Add UPDATE and DELETE
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'retrospective_contributions') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'retrospective_contributions' AND policyname = 'Allow update for authenticated') THEN
      CREATE POLICY "Allow update for authenticated" ON retrospective_contributions
        FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'retrospective_contributions' AND policyname = 'Allow delete for authenticated') THEN
      CREATE POLICY "Allow delete for authenticated" ON retrospective_contributions
        FOR DELETE TO authenticated USING (true);
    END IF;

    RAISE NOTICE 'Fixed partial coverage on retrospective_contributions';
  END IF;
END $$;

-- 4. runtime_audits: Add DELETE
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'runtime_audits') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'runtime_audits' AND policyname = 'Allow delete for authenticated') THEN
      CREATE POLICY "Allow delete for authenticated" ON runtime_audits
        FOR DELETE TO authenticated USING (true);
    END IF;

    RAISE NOTICE 'Fixed partial coverage on runtime_audits';
  END IF;
END $$;

-- 5. stage_events: Add UPDATE
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'stage_events') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stage_events' AND policyname = 'Allow update for authenticated') THEN
      CREATE POLICY "Allow update for authenticated" ON stage_events
        FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    END IF;

    RAISE NOTICE 'Fixed partial coverage on stage_events';
  END IF;
END $$;

-- 6. venture_archetypes: Add INSERT and UPDATE
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'venture_archetypes') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'venture_archetypes' AND policyname = 'Allow insert for authenticated') THEN
      CREATE POLICY "Allow insert for authenticated" ON venture_archetypes
        FOR INSERT TO authenticated WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'venture_archetypes' AND policyname = 'Allow update for authenticated') THEN
      CREATE POLICY "Allow update for authenticated" ON venture_archetypes
        FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    END IF;

    RAISE NOTICE 'Fixed partial coverage on venture_archetypes';
  END IF;
END $$;

-- 7. venture_decisions: Add DELETE
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'venture_decisions') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'venture_decisions' AND policyname = 'Allow delete for authenticated') THEN
      CREATE POLICY "Allow delete for authenticated" ON venture_decisions
        FOR DELETE TO authenticated USING (true);
    END IF;

    RAISE NOTICE 'Fixed partial coverage on venture_decisions';
  END IF;
END $$;

-- 8. venture_token_ledger: Add UPDATE
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'venture_token_ledger') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'venture_token_ledger' AND policyname = 'Allow update for authenticated') THEN
      CREATE POLICY "Allow update for authenticated" ON venture_token_ledger
        FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
    END IF;

    RAISE NOTICE 'Fixed partial coverage on venture_token_ledger';
  END IF;
END $$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
DECLARE
  fixed_count INT := 0;
  missing_rls TEXT[] := ARRAY['continuous_execution_log', 'scaffold_patterns', 'sd_baseline_rationale',
                              'sd_checkpoint_history', 'sd_type_change_audit', 'simulation_sessions', 'soul_extractions'];
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY missing_rls
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables t
      JOIN pg_class c ON c.relname = t.tablename
      WHERE t.schemaname = 'public' AND t.tablename = tbl AND c.relrowsecurity = true
    ) THEN
      fixed_count := fixed_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'RLS Coverage Fix Complete: % of 7 tables now have RLS enabled', fixed_count;
END $$;
