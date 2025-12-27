-- ============================================================================
-- LEO Protocol - Missing RLS Policies Hotfix
-- Migration: 20251227_missing_rls_policies.sql
-- ============================================================================
-- Purpose: Enable RLS and add policies for tables identified as missing them
--
-- Tables:
--   - sd_type_gate_exemptions
--   - story_manual_tests
--   - system_components
--   - task_triggers
--   - type_gate_exemptions
--   - ui_components
--   - user_story_tests
--   - ux_research_library
-- ============================================================================

-- Helper function to safely add RLS and policies
DO $$
DECLARE
  tables_to_fix TEXT[] := ARRAY[
    'sd_type_gate_exemptions',
    'story_manual_tests',
    'system_components',
    'task_triggers',
    'type_gate_exemptions',
    'ui_components',
    'user_story_tests',
    'ux_research_library'
  ];
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY tables_to_fix
  LOOP
    -- Check if table exists
    IF EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = tbl
    ) THEN
      -- Enable RLS
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
      RAISE NOTICE 'Enabled RLS on %', tbl;

      -- Create authenticated policy if not exists
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = tbl
        AND policyname = 'Allow all for authenticated'
      ) THEN
        EXECUTE format(
          'CREATE POLICY "Allow all for authenticated" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
          tbl
        );
        RAISE NOTICE 'Created authenticated policy on %', tbl;
      END IF;

      -- Create anon select policy if not exists
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = tbl
        AND policyname = 'Allow select for anon'
      ) THEN
        EXECUTE format(
          'CREATE POLICY "Allow select for anon" ON %I FOR SELECT TO anon USING (true)',
          tbl
        );
        RAISE NOTICE 'Created anon policy on %', tbl;
      END IF;
    ELSE
      RAISE NOTICE 'Table % does not exist, skipping', tbl;
    END IF;
  END LOOP;
END $$;

-- Verify all tables have RLS enabled
DO $$
DECLARE
  missing_rls TEXT[];
BEGIN
  SELECT array_agg(tablename) INTO missing_rls
  FROM pg_tables t
  JOIN pg_class c ON c.relname = t.tablename
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.schemaname
  WHERE t.schemaname = 'public'
  AND t.tablename IN (
    'sd_type_gate_exemptions',
    'story_manual_tests',
    'system_components',
    'task_triggers',
    'type_gate_exemptions',
    'ui_components',
    'user_story_tests',
    'ux_research_library'
  )
  AND NOT c.relrowsecurity;

  IF missing_rls IS NOT NULL AND array_length(missing_rls, 1) > 0 THEN
    RAISE EXCEPTION 'RLS not enabled on tables: %', array_to_string(missing_rls, ', ');
  ELSE
    RAISE NOTICE 'SUCCESS: All specified tables have RLS enabled';
  END IF;
END $$;
