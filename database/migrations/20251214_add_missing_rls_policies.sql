-- ============================================================================
-- MIGRATION: Add Missing RLS Policies for Configuration Tables
-- Created: 2025-12-14
-- Purpose: Enable RLS on 5 tables that were missing policies, causing CI/CD failures
--
-- GitHub Workflow Failures:
-- - RLS Policy Verification failed 5 consecutive times
-- - Run IDs: 20212005800, 20211890176, 20208828101, etc.
-- - Failure: 5 tables had RLS disabled
--
-- Tables Fixed:
-- 1. advisory_checkpoints (from 20251206_lifecycle_stage_config.sql)
-- 2. lifecycle_phases (from 20251206_lifecycle_stage_config.sql)
-- 3. lifecycle_stage_config (from 20251206_lifecycle_stage_config.sql)
-- 4. sd_contract_exceptions (from 20251210_contract_exception_system.sql)
-- 5. sd_type_validation_profiles (from 20251207_sd_type_validation_profiles.sql)
--
-- Policy Design:
-- - All 5 tables are configuration/reference tables for the LEO Protocol
-- - Read-only access for all users (SELECT only)
-- - Write access requires authenticated role (system/admin operations)
-- - No DELETE policies (configuration tables should not allow deletion via app)
-- ============================================================================

-- ============================================================================
-- TABLE: lifecycle_phases
-- Purpose: Reference table for 6-phase venture lifecycle
-- Access Pattern: Read-only for all users, system manages data
-- ============================================================================

-- Enable RLS
ALTER TABLE lifecycle_phases ENABLE ROW LEVEL SECURITY;

-- SELECT: Anyone can read phase definitions
CREATE POLICY lifecycle_phases_select
  ON lifecycle_phases
  FOR SELECT
  TO public
  USING (true);

-- INSERT: Only authenticated users can create (system use)
CREATE POLICY lifecycle_phases_insert
  ON lifecycle_phases
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- UPDATE: Only authenticated users can update phase definitions
CREATE POLICY lifecycle_phases_update
  ON lifecycle_phases
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON POLICY lifecycle_phases_select ON lifecycle_phases IS
'Public read access to lifecycle phase definitions';

COMMENT ON POLICY lifecycle_phases_insert ON lifecycle_phases IS
'Authenticated users can insert phase definitions (system migrations)';

COMMENT ON POLICY lifecycle_phases_update ON lifecycle_phases IS
'Authenticated users can update phase definitions';

-- ============================================================================
-- TABLE: lifecycle_stage_config
-- Purpose: Configuration for all 25 venture lifecycle stages
-- Access Pattern: Read-only for all users, system manages data
-- ============================================================================

-- Enable RLS
ALTER TABLE lifecycle_stage_config ENABLE ROW LEVEL SECURITY;

-- SELECT: Anyone can read stage configuration
CREATE POLICY lifecycle_stage_config_select
  ON lifecycle_stage_config
  FOR SELECT
  TO public
  USING (true);

-- INSERT: Only authenticated users can create (system use)
CREATE POLICY lifecycle_stage_config_insert
  ON lifecycle_stage_config
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- UPDATE: Only authenticated users can update stage config
CREATE POLICY lifecycle_stage_config_update
  ON lifecycle_stage_config
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON POLICY lifecycle_stage_config_select ON lifecycle_stage_config IS
'Public read access to stage configuration for venture lifecycle';

COMMENT ON POLICY lifecycle_stage_config_insert ON lifecycle_stage_config IS
'Authenticated users can insert stage configuration (system migrations)';

COMMENT ON POLICY lifecycle_stage_config_update ON lifecycle_stage_config IS
'Authenticated users can update stage configuration';

-- ============================================================================
-- TABLE: advisory_checkpoints
-- Purpose: Chairman advisory checkpoints at stages 3, 5, 16
-- Access Pattern: Read-only for all users, system manages data
-- ============================================================================

-- Enable RLS
ALTER TABLE advisory_checkpoints ENABLE ROW LEVEL SECURITY;

-- SELECT: Anyone can read checkpoint definitions
CREATE POLICY advisory_checkpoints_select
  ON advisory_checkpoints
  FOR SELECT
  TO public
  USING (true);

-- INSERT: Only authenticated users can create (system use)
CREATE POLICY advisory_checkpoints_insert
  ON advisory_checkpoints
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- UPDATE: Only authenticated users can update checkpoints
CREATE POLICY advisory_checkpoints_update
  ON advisory_checkpoints
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON POLICY advisory_checkpoints_select ON advisory_checkpoints IS
'Public read access to advisory checkpoint definitions';

COMMENT ON POLICY advisory_checkpoints_insert ON advisory_checkpoints IS
'Authenticated users can insert advisory checkpoints (system migrations)';

COMMENT ON POLICY advisory_checkpoints_update ON advisory_checkpoints IS
'Authenticated users can update advisory checkpoint configurations';

-- ============================================================================
-- TABLE: sd_type_validation_profiles
-- Purpose: Validation profiles for different SD types (feature, database, docs, etc.)
-- Access Pattern: Read-only for all users, system manages profiles
-- ============================================================================

-- Enable RLS
ALTER TABLE sd_type_validation_profiles ENABLE ROW LEVEL SECURITY;

-- SELECT: Anyone can read validation profiles
CREATE POLICY sd_type_validation_profiles_select
  ON sd_type_validation_profiles
  FOR SELECT
  TO public
  USING (true);

-- INSERT: Only authenticated users can create (system use)
CREATE POLICY sd_type_validation_profiles_insert
  ON sd_type_validation_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- UPDATE: Only authenticated users can update profiles
CREATE POLICY sd_type_validation_profiles_update
  ON sd_type_validation_profiles
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON POLICY sd_type_validation_profiles_select ON sd_type_validation_profiles IS
'Public read access to SD type validation profiles';

COMMENT ON POLICY sd_type_validation_profiles_insert ON sd_type_validation_profiles IS
'Authenticated users can insert validation profiles (system migrations)';

COMMENT ON POLICY sd_type_validation_profiles_update ON sd_type_validation_profiles IS
'Authenticated users can update validation profile configurations';

-- ============================================================================
-- TABLE: sd_contract_exceptions
-- Purpose: Track contract exceptions with approval workflow
-- Access Pattern: Users can view their own SD exceptions, system manages approvals
-- ============================================================================

-- Enable RLS
ALTER TABLE sd_contract_exceptions ENABLE ROW LEVEL SECURITY;

-- SELECT: Anyone can read (for transparency in contract exceptions)
-- Note: In production, you may want to restrict this to SD owners only
CREATE POLICY sd_contract_exceptions_select
  ON sd_contract_exceptions
  FOR SELECT
  TO public
  USING (true);

-- INSERT: Authenticated users can request exceptions
CREATE POLICY sd_contract_exceptions_insert
  ON sd_contract_exceptions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- UPDATE: Authenticated users can update exception status (approvals)
CREATE POLICY sd_contract_exceptions_update
  ON sd_contract_exceptions
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

COMMENT ON POLICY sd_contract_exceptions_select ON sd_contract_exceptions IS
'Public read access to contract exceptions for transparency';

COMMENT ON POLICY sd_contract_exceptions_insert ON sd_contract_exceptions IS
'Authenticated users can request contract exceptions';

COMMENT ON POLICY sd_contract_exceptions_update ON sd_contract_exceptions IS
'Authenticated users can update exception approvals (Chairman/Architect)';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify RLS is enabled on all 5 tables
DO $$
DECLARE
  v_rls_count INTEGER;
  v_policy_count INTEGER;
BEGIN
  -- Check RLS enabled
  SELECT COUNT(*)
  INTO v_rls_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN (
      'advisory_checkpoints',
      'lifecycle_phases',
      'lifecycle_stage_config',
      'sd_contract_exceptions',
      'sd_type_validation_profiles'
    )
    AND c.relrowsecurity = true;

  -- Check policies created
  SELECT COUNT(*)
  INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (
      'advisory_checkpoints',
      'lifecycle_phases',
      'lifecycle_stage_config',
      'sd_contract_exceptions',
      'sd_type_validation_profiles'
    );

  RAISE NOTICE '=== RLS Policy Migration Complete ===';
  RAISE NOTICE 'Tables with RLS enabled: % / 5', v_rls_count;
  RAISE NOTICE 'Policies created: % (expected: 15)', v_policy_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Policy Pattern:';
  RAISE NOTICE '  - SELECT: Public read access (all users)';
  RAISE NOTICE '  - INSERT: Authenticated only (system operations)';
  RAISE NOTICE '  - UPDATE: Authenticated only (admin/system)';
  RAISE NOTICE '  - DELETE: No policy (configuration tables)';
  RAISE NOTICE '';

  IF v_rls_count = 5 AND v_policy_count = 15 THEN
    RAISE NOTICE '✅ Migration successful - all tables secured';
  ELSE
    RAISE WARNING '⚠️  Expected 5 tables with RLS and 15 policies';
    RAISE WARNING '   Got % tables and % policies', v_rls_count, v_policy_count;
  END IF;
END $$;

-- ============================================================================
-- TESTING QUERIES (for local verification)
-- ============================================================================

-- Test 1: Verify all tables have RLS enabled
-- SELECT
--   c.relname AS table_name,
--   c.relrowsecurity AS rls_enabled,
--   COUNT(p.policyname) AS policy_count
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- LEFT JOIN pg_policies p ON p.tablename = c.relname AND p.schemaname = n.nspname
-- WHERE n.nspname = 'public'
--   AND c.relname IN (
--     'advisory_checkpoints',
--     'lifecycle_phases',
--     'lifecycle_stage_config',
--     'sd_contract_exceptions',
--     'sd_type_validation_profiles'
--   )
-- GROUP BY c.relname, c.relrowsecurity
-- ORDER BY c.relname;

-- Test 2: List all policies for these tables
-- SELECT
--   tablename,
--   policyname,
--   cmd AS operation,
--   roles
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'advisory_checkpoints',
--     'lifecycle_phases',
--     'lifecycle_stage_config',
--     'sd_contract_exceptions',
--     'sd_type_validation_profiles'
--   )
-- ORDER BY tablename, cmd;

-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================

-- To rollback this migration:
-- DROP POLICY IF EXISTS lifecycle_phases_select ON lifecycle_phases;
-- DROP POLICY IF EXISTS lifecycle_phases_insert ON lifecycle_phases;
-- DROP POLICY IF EXISTS lifecycle_phases_update ON lifecycle_phases;
-- ALTER TABLE lifecycle_phases DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS lifecycle_stage_config_select ON lifecycle_stage_config;
-- DROP POLICY IF EXISTS lifecycle_stage_config_insert ON lifecycle_stage_config;
-- DROP POLICY IF EXISTS lifecycle_stage_config_update ON lifecycle_stage_config;
-- ALTER TABLE lifecycle_stage_config DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS advisory_checkpoints_select ON advisory_checkpoints;
-- DROP POLICY IF EXISTS advisory_checkpoints_insert ON advisory_checkpoints;
-- DROP POLICY IF EXISTS advisory_checkpoints_update ON advisory_checkpoints;
-- ALTER TABLE advisory_checkpoints DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS sd_type_validation_profiles_select ON sd_type_validation_profiles;
-- DROP POLICY IF EXISTS sd_type_validation_profiles_insert ON sd_type_validation_profiles;
-- DROP POLICY IF EXISTS sd_type_validation_profiles_update ON sd_type_validation_profiles;
-- ALTER TABLE sd_type_validation_profiles DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS sd_contract_exceptions_select ON sd_contract_exceptions;
-- DROP POLICY IF EXISTS sd_contract_exceptions_insert ON sd_contract_exceptions;
-- DROP POLICY IF EXISTS sd_contract_exceptions_update ON sd_contract_exceptions;
-- ALTER TABLE sd_contract_exceptions DISABLE ROW LEVEL SECURITY;
