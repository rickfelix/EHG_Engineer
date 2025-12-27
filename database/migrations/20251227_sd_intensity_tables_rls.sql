-- Migration: Apply RLS to sd_intensity_adjustments and sd_intensity_gate_exemptions
-- Date: 2025-12-27
-- Purpose: Enable Row Level Security on intensity-based configuration tables
--
-- Context: Part of broader RLS governance initiative to ensure all tables
-- have appropriate security policies. These tables are configuration tables
-- similar to sd_type_validation_profiles and sd_type_gate_exemptions.
--
-- Tables affected:
--   - sd_intensity_adjustments (RLS enabled + 2 policies)
--   - sd_intensity_gate_exemptions (RLS enabled + 2 policies)
--
-- Policy Design:
--   1. authenticated: Full access (SELECT, INSERT, UPDATE, DELETE)
--   2. anon: Read-only access (SELECT)
--
-- Rollback: If needed, run:
--   ALTER TABLE sd_intensity_adjustments DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS "Allow all for authenticated" ON sd_intensity_adjustments;
--   DROP POLICY IF EXISTS "Allow select for anon" ON sd_intensity_adjustments;
--   ALTER TABLE sd_intensity_gate_exemptions DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS "Allow all for authenticated" ON sd_intensity_gate_exemptions;
--   DROP POLICY IF EXISTS "Allow select for anon" ON sd_intensity_gate_exemptions;

-- ============================================================================
-- SD_INTENSITY_ADJUSTMENTS TABLE
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sd_intensity_adjustments') THEN
    -- Enable RLS on sd_intensity_adjustments
    ALTER TABLE sd_intensity_adjustments ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE 'Enabled RLS on sd_intensity_adjustments';

    -- Policy 1: Allow all operations for authenticated users
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'sd_intensity_adjustments'
      AND policyname = 'Allow all for authenticated'
    ) THEN
      CREATE POLICY "Allow all for authenticated"
        ON sd_intensity_adjustments
        FOR ALL
        TO authenticated
        USING (true)
        WITH CHECK (true);
      RAISE NOTICE 'Created policy "Allow all for authenticated" on sd_intensity_adjustments';
    ELSE
      RAISE NOTICE 'Policy "Allow all for authenticated" already exists on sd_intensity_adjustments';
    END IF;

    -- Policy 2: Allow SELECT for anonymous users
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'sd_intensity_adjustments'
      AND policyname = 'Allow select for anon'
    ) THEN
      CREATE POLICY "Allow select for anon"
        ON sd_intensity_adjustments
        FOR SELECT
        TO anon
        USING (true);
      RAISE NOTICE 'Created policy "Allow select for anon" on sd_intensity_adjustments';
    ELSE
      RAISE NOTICE 'Policy "Allow select for anon" already exists on sd_intensity_adjustments';
    END IF;
  ELSE
    RAISE NOTICE 'Table sd_intensity_adjustments does not exist, skipping';
  END IF;
END $$;

-- ============================================================================
-- SD_INTENSITY_GATE_EXEMPTIONS TABLE
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sd_intensity_gate_exemptions') THEN
    -- Enable RLS on sd_intensity_gate_exemptions
    ALTER TABLE sd_intensity_gate_exemptions ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE 'Enabled RLS on sd_intensity_gate_exemptions';

    -- Policy 1: Allow all operations for authenticated users
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'sd_intensity_gate_exemptions'
      AND policyname = 'Allow all for authenticated'
    ) THEN
      CREATE POLICY "Allow all for authenticated"
        ON sd_intensity_gate_exemptions
        FOR ALL
        TO authenticated
        USING (true)
        WITH CHECK (true);
      RAISE NOTICE 'Created policy "Allow all for authenticated" on sd_intensity_gate_exemptions';
    ELSE
      RAISE NOTICE 'Policy "Allow all for authenticated" already exists on sd_intensity_gate_exemptions';
    END IF;

    -- Policy 2: Allow SELECT for anonymous users
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'sd_intensity_gate_exemptions'
      AND policyname = 'Allow select for anon'
    ) THEN
      CREATE POLICY "Allow select for anon"
        ON sd_intensity_gate_exemptions
        FOR SELECT
        TO anon
        USING (true);
      RAISE NOTICE 'Created policy "Allow select for anon" on sd_intensity_gate_exemptions';
    ELSE
      RAISE NOTICE 'Policy "Allow select for anon" already exists on sd_intensity_gate_exemptions';
    END IF;
  ELSE
    RAISE NOTICE 'Table sd_intensity_gate_exemptions does not exist, skipping';
  END IF;
END $$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
  tables_to_check TEXT[] := ARRAY[
    'sd_intensity_adjustments',
    'sd_intensity_gate_exemptions'
  ];
  tbl TEXT;
  policy_count INTEGER;
  rls_enabled BOOLEAN;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'RLS Policy Verification for Intensity Tables';
  RAISE NOTICE '============================================================';

  FOREACH tbl IN ARRAY tables_to_check
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
      -- Check if RLS is enabled
      SELECT relrowsecurity INTO rls_enabled
      FROM pg_class
      WHERE relname = tbl AND relnamespace = 'public'::regnamespace;

      -- Count policies
      SELECT COUNT(*) INTO policy_count
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl;

      RAISE NOTICE 'Table: %', tbl;
      RAISE NOTICE '  RLS Enabled: %', rls_enabled;
      RAISE NOTICE '  Policy Count: %', policy_count;

      -- List policies
      IF policy_count > 0 THEN
        RAISE NOTICE '  Policies:';
        FOR pol_name IN
          SELECT policyname FROM pg_policies
          WHERE schemaname = 'public' AND tablename = tbl
          ORDER BY policyname
        LOOP
          RAISE NOTICE '    - %', pol_name;
        END LOOP;
      END IF;
      RAISE NOTICE '';
    ELSE
      RAISE NOTICE 'Table: % - DOES NOT EXIST', tbl;
      RAISE NOTICE '';
    END IF;
  END LOOP;

  RAISE NOTICE '============================================================';
  RAISE NOTICE 'Expected Result: Each table should have:';
  RAISE NOTICE '  - RLS Enabled: true';
  RAISE NOTICE '  - Policy Count: 2';
  RAISE NOTICE '  - Policies:';
  RAISE NOTICE '    - Allow all for authenticated';
  RAISE NOTICE '    - Allow select for anon';
  RAISE NOTICE '============================================================';
END $$;
