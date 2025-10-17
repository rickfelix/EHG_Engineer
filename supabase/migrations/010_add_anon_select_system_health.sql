-- Migration: Add ANON SELECT Policy for system_health table
-- Purpose: Allow read-only access to system_health for monitoring/health check scripts
-- Security: Write operations (INSERT/UPDATE/DELETE) remain authenticated-only
-- Database: dedlbzhpgkmetvhbkyzq (EHG_Engineer)
-- Created: 2025-10-15

-- Drop policy if it exists (idempotent)
DROP POLICY IF EXISTS "Allow anon users to read system_health" ON system_health;

-- Create ANON SELECT policy
CREATE POLICY "Allow anon users to read system_health"
  ON system_health FOR SELECT
  TO anon
  USING (true);

-- Grant SELECT permission to anon role
GRANT SELECT ON system_health TO anon;

-- Verification query (run after migration):
-- SELECT * FROM system_health WHERE service_name = 'context7';
-- Expected: 1 row with state='closed', failure_count=0
-- Should work with both authenticated AND anon roles
