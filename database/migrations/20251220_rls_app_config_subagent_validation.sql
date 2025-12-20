-- ============================================================================
-- Migration: Enable RLS on app_config and subagent_validation_results
-- Version: LEO Protocol v4.3.3 - CI Security Fix
-- Created: 2025-12-20
--
-- Purpose:
-- Enable Row Level Security on two tables missing RLS policies:
--   1. app_config - Configuration singleton for chairman identity
--   2. subagent_validation_results - Sub-agent validation audit trail
--
-- Security Analysis:
--   - app_config: CRITICAL - stores chairman_email for privilege escalation checks
--     Policy: Read access for authenticated/anon (fn_is_chairman needs it)
--             Write access ONLY for service_role
--
--   - subagent_validation_results: SYSTEM table for validation audit
--     Policy: Read access for all (transparency/debugging)
--             Write access ONLY for service_role (automated system writes)
--
-- Follows patterns from: board_members, sub_agent_execution_results
-- ============================================================================

-- ============================================================================
-- PART 1: app_config RLS
-- ============================================================================

-- Enable RLS on app_config
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "app_config_anon_read" ON app_config;
DROP POLICY IF EXISTS "app_config_authenticated_read" ON app_config;
DROP POLICY IF EXISTS "app_config_service_role_all" ON app_config;

-- Policy: Anonymous users can SELECT (needed for fn_is_chairman in RLS checks)
CREATE POLICY "app_config_anon_read"
ON app_config FOR SELECT
TO anon
USING (true);

-- Policy: Authenticated users can SELECT
CREATE POLICY "app_config_authenticated_read"
ON app_config FOR SELECT
TO authenticated
USING (true);

-- Policy: Service role has full access (INSERT, UPDATE, DELETE)
CREATE POLICY "app_config_service_role_all"
ON app_config FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- PART 2: subagent_validation_results RLS
-- ============================================================================

-- Enable RLS on subagent_validation_results
ALTER TABLE subagent_validation_results ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "subagent_validation_anon_read" ON subagent_validation_results;
DROP POLICY IF EXISTS "subagent_validation_authenticated_read" ON subagent_validation_results;
DROP POLICY IF EXISTS "subagent_validation_service_role_all" ON subagent_validation_results;

-- Policy: Anonymous users can SELECT (for monitoring dashboards)
CREATE POLICY "subagent_validation_anon_read"
ON subagent_validation_results FOR SELECT
TO anon
USING (true);

-- Policy: Authenticated users can SELECT
CREATE POLICY "subagent_validation_authenticated_read"
ON subagent_validation_results FOR SELECT
TO authenticated
USING (true);

-- Policy: Service role has full access (automated validation writes)
CREATE POLICY "subagent_validation_service_role_all"
ON subagent_validation_results FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON POLICY "app_config_anon_read" ON app_config IS
'Allow anonymous read access for fn_is_chairman RLS checks';

COMMENT ON POLICY "app_config_authenticated_read" ON app_config IS
'Allow authenticated read access for fn_is_chairman RLS checks';

COMMENT ON POLICY "app_config_service_role_all" ON app_config IS
'Service role full access for configuration management';

COMMENT ON POLICY "subagent_validation_anon_read" ON subagent_validation_results IS
'Allow anonymous read for monitoring dashboards';

COMMENT ON POLICY "subagent_validation_authenticated_read" ON subagent_validation_results IS
'Allow authenticated read for validation transparency';

COMMENT ON POLICY "subagent_validation_service_role_all" ON subagent_validation_results IS
'Service role full access for automated validation writes';

-- ============================================================================
-- Verification Query (run manually to verify)
-- ============================================================================

-- SELECT relname, relrowsecurity
-- FROM pg_class
-- WHERE relname IN ('app_config', 'subagent_validation_results');

-- SELECT tablename, policyname, roles, cmd
-- FROM pg_policies
-- WHERE tablename IN ('app_config', 'subagent_validation_results');

-- ============================================================================
-- Migration complete
-- ============================================================================
