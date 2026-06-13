-- Migration: 20260613_legal_processes_authenticated_select.sql
-- SD: SD-LEO-INFRA-PAYMENT-RAIL-FOUNDATION-001 (FR-6 — LLC slippage must be visible)
-- Purpose: legacy migration 029's admin RLS policy (legal_processes_admin_all)
--          failed to apply on the consolidated EHG_Engineer DB because it
--          references columns that do not exist here (profiles.role,
--          companies.owner_id). RLS is ENABLED on legal_processes with only a
--          service_role policy, so authenticated (dashboard) reads are blocked.
--          Add a minimal authenticated SELECT policy mirroring the
--          ops_payment_events / capital_transactions convention so milestone
--          slippage is observable. Write access stays service_role-only.
--          (The original role-gated ADMIN WRITE policy remains a backlog item.)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='legal_processes' AND policyname='legal_processes_select'
  ) THEN
    CREATE POLICY legal_processes_select ON legal_processes FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- ============================================================================
-- ROLLBACK (manual):
--   DROP POLICY IF EXISTS legal_processes_select ON legal_processes;
-- ============================================================================
