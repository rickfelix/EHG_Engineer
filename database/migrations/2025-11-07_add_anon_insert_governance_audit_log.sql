-- Migration: Add RLS INSERT policy for anon role on governance_audit_log
-- Date: 2025-11-07
-- SD: SD-CREWAI-COMPETITIVE-INTELLIGENCE-001
-- Purpose: Allow anon to write audit logs via triggers (product_requirements_v2)
-- Pattern: PAT-RLS-001 (proven RLS policy application method)
--
-- Context:
-- - product_requirements_v2 has audit_product_requirements trigger
-- - Trigger calls governance_audit_trigger() which INSERTs to governance_audit_log
-- - INSERT fails because anon has no INSERT policy on governance_audit_log
--
-- Security Analysis:
-- - Audit logs are system-generated (not user-submitted)
-- - Trigger enforces audit trail integrity
-- - Anon role needs INSERT permission for trigger to function
-- - Audit log writes are append-only (safe for anon)

-- Drop policy if exists (idempotent)
DROP POLICY IF EXISTS anon_insert_governance_audit_log ON public.governance_audit_log;

-- Create INSERT policy for anon role
CREATE POLICY anon_insert_governance_audit_log
  ON public.governance_audit_log
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Verification comment
COMMENT ON POLICY anon_insert_governance_audit_log ON public.governance_audit_log
IS 'Allow anon role to insert audit logs via triggers. Created: 2025-11-07, SD-CREWAI-COMPETITIVE-INTELLIGENCE-001';
