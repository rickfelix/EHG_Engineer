-- Migration: Enable RLS on vertical_complexity_multipliers
-- Purpose: Fix CI/CD blocking issue - RLS verification workflow failing
-- Pattern: Standard configuration table RLS (authenticated SELECT, service_role ALL)
-- Reference: Similar tables (leo_complexity_thresholds, test_coverage_policies, defect_taxonomy)
-- Date: 2025-12-20

-- Enable Row Level Security
ALTER TABLE vertical_complexity_multipliers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (idempotent)
DROP POLICY IF EXISTS authenticated_read_vertical_complexity_multipliers ON vertical_complexity_multipliers;
DROP POLICY IF EXISTS service_role_all_vertical_complexity_multipliers ON vertical_complexity_multipliers;

-- Policy 1: Authenticated users can SELECT (read-only)
CREATE POLICY authenticated_read_vertical_complexity_multipliers
ON vertical_complexity_multipliers
FOR SELECT
TO authenticated
USING (true);

-- Policy 2: Service role has full access (ALL operations)
CREATE POLICY service_role_all_vertical_complexity_multipliers
ON vertical_complexity_multipliers
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Verification queries (run after migration)
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'vertical_complexity_multipliers';
-- SELECT tablename, policyname, roles, cmd FROM pg_policies WHERE tablename = 'vertical_complexity_multipliers';
