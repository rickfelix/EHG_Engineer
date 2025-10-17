-- ============================================================================
-- Fix RLS Policies on sd_phase_handoffs Table
-- Issue: Authenticated users cannot INSERT/UPDATE/DELETE handoffs
-- Root Cause: Only SELECT and service_role ALL policies exist
-- Solution: Add INSERT, UPDATE, DELETE policies for authenticated role
-- ============================================================================

-- Context: During SD-AGENT-MIGRATION-001, tried to insert handoff via authenticated
-- user and got: "new row violates row-level security policy for table sd_phase_handoffs"

-- Current policies:
-- ✅ Allow authenticated read (SELECT)
-- ✅ Allow service_role all operations
-- ❌ MISSING: Allow authenticated INSERT/UPDATE/DELETE

-- Fix: Add missing policies (idempotent with DROP IF EXISTS)

-- Allow authenticated users to INSERT handoffs (LEO agents creating handoffs)
DROP POLICY IF EXISTS "Allow authenticated insert sd_phase_handoffs" ON sd_phase_handoffs;
CREATE POLICY "Allow authenticated insert sd_phase_handoffs"
  ON sd_phase_handoffs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to UPDATE handoffs (accepting/rejecting handoffs)
DROP POLICY IF EXISTS "Allow authenticated update sd_phase_handoffs" ON sd_phase_handoffs;
CREATE POLICY "Allow authenticated update sd_phase_handoffs"
  ON sd_phase_handoffs FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to DELETE handoffs (cleanup/corrections)
DROP POLICY IF EXISTS "Allow authenticated delete sd_phase_handoffs" ON sd_phase_handoffs;
CREATE POLICY "Allow authenticated delete sd_phase_handoffs"
  ON sd_phase_handoffs FOR DELETE
  TO authenticated
  USING (true);

-- Verification query (run after applying migration)
-- SELECT policyname, polcmd, polroles::regrole[]
-- FROM pg_policy
-- WHERE polrelid = 'sd_phase_handoffs'::regclass
-- ORDER BY policyname;

-- Expected result: 5 policies
-- 1. Allow authenticated delete sd_phase_handoffs (DELETE, authenticated)
-- 2. Allow authenticated insert sd_phase_handoffs (INSERT, authenticated)
-- 3. Allow authenticated read sd_phase_handoffs (SELECT, authenticated)
-- 4. Allow authenticated update sd_phase_handoffs (UPDATE, authenticated)
-- 5. Allow service role all sd_phase_handoffs (ALL, service_role)
