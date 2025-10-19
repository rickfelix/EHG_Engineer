-- Migration: Fix system_health RLS Policy
-- SD-KNOWLEDGE-001: Add missing INSERT policy for system_health
-- Created: 2025-10-15
-- Root Cause: Original migration missing INSERT policy, blocking context7 initialization
-- Solution: Add "authenticated full access patterns" from SD-AGENT-ADMIN-003 retrospective

-- =====================================================================
-- ADD MISSING INSERT POLICY
-- Pattern from SD-AGENT-ADMIN-003: "authenticated full access patterns"
-- =====================================================================

-- Drop if exists first (since IF NOT EXISTS not supported)
DROP POLICY IF EXISTS "Allow authenticated users to insert system_health" ON system_health;

-- Create the INSERT policy
CREATE POLICY "Allow authenticated users to insert system_health"
  ON system_health FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- =====================================================================
-- ADD MISSING INSERT GRANT
-- =====================================================================

GRANT INSERT ON system_health TO authenticated;

-- =====================================================================
-- VERIFY: Re-insert context7 row (should succeed now)
-- =====================================================================

-- Delete any partial rows first (in case previous attempts created incomplete data)
DELETE FROM system_health WHERE service_name = 'context7';

-- Insert context7 with proper initialization
INSERT INTO system_health (service_name, circuit_breaker_state, failure_count, last_success_at)
VALUES ('context7', 'closed', 0, NOW())
ON CONFLICT (service_name) DO UPDATE
SET circuit_breaker_state = 'closed',
    failure_count = 0,
    last_success_at = NOW(),
    updated_at = NOW();

-- =====================================================================
-- Migration Complete
-- =====================================================================
-- Policies added: 1 (INSERT for system_health)
-- Grants added: 1 (INSERT for authenticated role)
-- Rows inserted: 1 (context7 initialization)
-- Expected outcome: All 3 tables now support full CRUD for authenticated users
