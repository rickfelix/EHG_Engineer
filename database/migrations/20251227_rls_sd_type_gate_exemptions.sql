-- Migration: Apply RLS to sd_type_gate_exemptions
-- Date: 2025-12-27
-- Purpose: Enable Row Level Security on sd_type_gate_exemptions table
--
-- Context: Part of broader RLS governance initiative to ensure all tables
-- have appropriate security policies. This table currently has RLS disabled.
--
-- Tables affected:
--   - sd_type_gate_exemptions (RLS enabled + 2 policies)
--
-- Policy Design:
--   1. authenticated: Full access (SELECT, INSERT, UPDATE, DELETE)
--   2. anon: Read-only access (SELECT)
--
-- Rollback: If needed, run:
--   ALTER TABLE sd_type_gate_exemptions DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS "Allow all for authenticated" ON sd_type_gate_exemptions;
--   DROP POLICY IF EXISTS "Allow select for anon" ON sd_type_gate_exemptions;

-- Enable RLS on sd_type_gate_exemptions
ALTER TABLE sd_type_gate_exemptions ENABLE ROW LEVEL SECURITY;

-- Policy 1: Allow all operations for authenticated users
DROP POLICY IF EXISTS "Allow all for authenticated" ON sd_type_gate_exemptions;
CREATE POLICY "Allow all for authenticated"
  ON sd_type_gate_exemptions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policy 2: Allow SELECT for anonymous users
DROP POLICY IF EXISTS "Allow select for anon" ON sd_type_gate_exemptions;
CREATE POLICY "Allow select for anon"
  ON sd_type_gate_exemptions
  FOR SELECT
  TO anon
  USING (true);
