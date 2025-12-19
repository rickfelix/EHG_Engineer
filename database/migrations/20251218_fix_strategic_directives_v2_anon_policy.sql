-- Migration: Add missing anon SELECT policy for strategic_directives_v2
-- Issue: ANON_KEY cannot read strategic_directives_v2 table
-- Root Cause: anon_read_strategic_directives_v2 policy is missing from live database
-- Created: 2025-12-18

-- Drop policy if it exists (idempotent)
DROP POLICY IF EXISTS anon_read_strategic_directives_v2 ON strategic_directives_v2;

-- Create anon SELECT policy
CREATE POLICY anon_read_strategic_directives_v2
ON strategic_directives_v2
FOR SELECT
TO anon
USING (true);

-- Verification query (run after migration)
-- SELECT policyname, roles, cmd FROM pg_policies WHERE tablename = 'strategic_directives_v2' ORDER BY policyname;
