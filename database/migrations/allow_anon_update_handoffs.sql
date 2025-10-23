-- ============================================================================
-- Allow anon role to UPDATE sd_phase_handoffs (for accepting handoffs)
-- ============================================================================
-- Issue: Scripts using ANON_KEY cannot accept handoffs (UPDATE blocked by RLS)
-- Root Cause: Only authenticated and service_role have UPDATE policy
-- Solution: Add UPDATE policy for anon role
-- SD: SD-2025-1020-E2E-SELECTORS
-- ============================================================================

-- Allow anon users to UPDATE handoffs (accepting/rejecting handoffs)
DROP POLICY IF EXISTS "Allow anon update sd_phase_handoffs" ON sd_phase_handoffs;
CREATE POLICY "Allow anon update sd_phase_handoffs"
  ON sd_phase_handoffs FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Verification
SELECT
  'Policies on sd_phase_handoffs:' as info,
  policyname,
  polcmd::text as command,
  polroles::regrole[]::text[] as roles
FROM pg_policy
WHERE polrelid = 'sd_phase_handoffs'::regclass
ORDER BY policyname;
