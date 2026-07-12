-- SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-B: RLS fix for the 5 spine-core substrate tables
-- created by 20260712_spine_core_identity_registry_fabric.sql — org_agent_roles,
-- org_agent_identities, org_objective_registry, org_guard_registry, portfolio_evidence.
--
-- CRITICAL, live-reproduced: all 5 shipped with relrowsecurity=false and were anon-writable
-- (a real SUPABASE_ANON_KEY client INSERT SUCCEEDED into portfolio_evidence,
-- org_objective_registry, and org_guard_registry). A public-key caller could therefore
-- forge portfolio evidence (poisoning the vigilance/learning satellites that consume the
-- fabric) and inject/tamper objectives and anti-Goodhart guards — defeating the exact
-- governance registry FR-4 exists to build. This is the identical defect class fixed on
-- Child A (agent_budgets/agent_predictions, 20260712_agent_budgets_predictions_rls.sql):
-- new-table migrations omitted RLS. The sibling org tables in this domain (agent_registry,
-- agent_messages, agent_memory_stores) all enable RLS with a service_role_all_<table>
-- ALL-command policy for service_role only; this brings the 5 spine tables in line.
--
-- All application access goes through server-side code using the service-role client
-- (writer-authorization gate, factory-identity-fold, chairman-surface, and the FR-4/FR-5
-- registry modules). There is no legitimate anon/authenticated read or write path.

ALTER TABLE org_agent_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_agent_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_objective_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_guard_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_org_agent_roles ON org_agent_roles
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_org_agent_identities ON org_agent_identities
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_org_objective_registry ON org_objective_registry
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_org_guard_registry ON org_guard_registry
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_portfolio_evidence ON portfolio_evidence
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Belt-and-suspenders: RLS with policies scoped to service_role already blocks
-- anon/authenticated, but explicitly revoking direct grants is defense-in-depth against a
-- future accidental permissive policy (and matches the Child A remediation).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON org_agent_roles FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON org_agent_identities FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON org_objective_registry FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON org_guard_registry FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON portfolio_evidence FROM anon, authenticated;
REVOKE SELECT ON org_agent_roles FROM anon, authenticated;
REVOKE SELECT ON org_agent_identities FROM anon, authenticated;
REVOKE SELECT ON org_objective_registry FROM anon, authenticated;
REVOKE SELECT ON org_guard_registry FROM anon, authenticated;
REVOKE SELECT ON portfolio_evidence FROM anon, authenticated;
