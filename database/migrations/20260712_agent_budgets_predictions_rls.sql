-- SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-A: RLS fix for agent_budgets, agent_budget_logs,
-- agent_predictions — CRITICAL finding from deep-tier adversarial review (independently
-- reproduced live: relrowsecurity=false on all three, plus anon/authenticated held direct
-- DML grants and EXECUTE on increment_agent_budget). Sibling tables in this exact domain
-- (agent_registry, agent_messages, agent_memory_stores) all enable RLS with a
-- service_role_all_<table> ALL-command policy for service_role only — this migration brings
-- the three new tables in line with that established pattern. All application access to
-- these tables goes through server-side code using the service-role client
-- (createSupabaseServiceClient()); there is no legitimate anon/authenticated write path,
-- since a public-key caller mutating agent_budgets/agent_predictions defeats the entire
-- point of the budget guardrail and the truth-layer calibration record this SD wires up.

ALTER TABLE agent_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_budget_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_agent_budgets ON agent_budgets
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_agent_budget_logs ON agent_budget_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_agent_predictions ON agent_predictions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Belt-and-suspenders: RLS alone would already block anon/authenticated once policies are
-- restricted to service_role, but explicitly revoking the direct-grant DML matches the
-- review's second finding (defense-in-depth against a future accidental permissive policy).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON agent_budgets FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON agent_budget_logs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON agent_predictions FROM anon, authenticated;
REVOKE SELECT ON agent_budgets FROM anon, authenticated;
REVOKE SELECT ON agent_budget_logs FROM anon, authenticated;
REVOKE SELECT ON agent_predictions FROM anon, authenticated;

-- increment_agent_budget RPC: anon/authenticated held EXECUTE (verified live), which combined
-- with the RLS gap above let a public-key caller inflate/zero any agent's consumed budget.
-- Also pin search_path (Supabase's function_search_path_mutable lint) since the function was
-- created with no SET search_path, making it resolvable-path-hijackable in theory.
REVOKE EXECUTE ON FUNCTION increment_agent_budget(UUID, NUMERIC) FROM PUBLIC, anon, authenticated;
ALTER FUNCTION increment_agent_budget(UUID, NUMERIC) SET search_path = pg_catalog, public;
