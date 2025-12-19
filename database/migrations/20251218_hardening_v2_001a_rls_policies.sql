-- Migration: SD-HARDENING-V2-001A - Chairman Identity & RLS Policy Restructure
-- Issue: Missing anonymous read policies on governance tables
-- Created: 2025-12-18
-- Status: REQUIRED for US-002 and US-003 completion

-- ============================================================================
-- BOARD_MEMBERS TABLE - Add Anonymous Read Policy
-- ============================================================================

-- Drop existing policy if it exists (idempotent)
DROP POLICY IF EXISTS anon_read_board_members ON board_members;

-- Create anonymous read policy for board_members
CREATE POLICY anon_read_board_members
ON board_members
FOR SELECT
TO anon
USING (true);

COMMENT ON POLICY anon_read_board_members ON board_members IS
'Allow anonymous users to read board member information. This is safe as board members are public information.';

-- ============================================================================
-- LEO_PROTOCOL_SECTIONS TABLE - Verify Anonymous Read Policy Exists
-- ============================================================================

-- The leo_protocol_sections table already has an authenticated read policy,
-- but we need to add an anonymous read policy for consistency

DROP POLICY IF EXISTS anon_read_leo_protocol_sections ON leo_protocol_sections;

CREATE POLICY anon_read_leo_protocol_sections
ON leo_protocol_sections
FOR SELECT
TO anon
USING (true);

COMMENT ON POLICY anon_read_leo_protocol_sections ON leo_protocol_sections IS
'Allow anonymous users to read LEO Protocol sections. This is safe as protocol sections are public documentation.';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify board_members RLS policies
-- Expected: 2 policies (anon_read, service_role_all)
SELECT
  tablename,
  policyname,
  cmd,
  roles::text
FROM pg_policies
WHERE tablename = 'board_members'
ORDER BY policyname;

-- Verify leo_protocol_sections RLS policies
-- Expected: 4 policies (anon_read, authenticated_read, service_role_all x2)
SELECT
  tablename,
  policyname,
  cmd,
  roles::text
FROM pg_policies
WHERE tablename = 'leo_protocol_sections'
ORDER BY policyname;

-- Verify strategic_directives_v2 RLS policies
-- Expected: 4 policies (anon_read, authenticated_read, service_role_all x2)
SELECT
  tablename,
  policyname,
  cmd,
  roles::text
FROM pg_policies
WHERE tablename = 'strategic_directives_v2'
ORDER BY policyname;
