-- SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-A: agent_budgets + agent_budget_logs
-- Matches lib/agents/venture-ceo/budget-manager.js's EXISTING query contract exactly
-- (checkBudgetOrThrow reads agent_budgets.{daily_limit,daily_consumed,monthly_limit,monthly_consumed}
--  by agent_id; _logBudgetCheck inserts into agent_budget_logs; recordConsumption calls
--  increment_agent_budget). Neither table nor the RPC existed prior to this migration
--  (confirmed absent via information_schema + mcp__supabase__list_tables by both
--  validation-agent and risk-agent independently during LEAD phase grounding).
-- Additive only: CREATE TABLE IF NOT EXISTS, no ALTER on any existing table. Rollback = DROP.

CREATE TABLE IF NOT EXISTS agent_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL UNIQUE REFERENCES agent_registry(id) ON DELETE CASCADE,
  daily_limit NUMERIC NOT NULL DEFAULT 0,
  daily_consumed NUMERIC NOT NULL DEFAULT 0,
  monthly_limit NUMERIC NOT NULL DEFAULT 0,
  monthly_consumed NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_budget_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agent_registry(id) ON DELETE CASCADE,
  venture_id UUID REFERENCES ventures(id) ON DELETE SET NULL,
  operation_type TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('ALLOWED', 'BLOCKED')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_budget_logs_agent_id ON agent_budget_logs(agent_id);

-- Matches BudgetManager.recordConsumption()'s call shape exactly:
--   supabase.rpc('increment_agent_budget', { p_agent_id, p_tokens })
CREATE OR REPLACE FUNCTION increment_agent_budget(p_agent_id UUID, p_tokens NUMERIC)
RETURNS VOID
LANGUAGE sql
AS $$
  UPDATE agent_budgets
  SET daily_consumed = daily_consumed + p_tokens,
      monthly_consumed = monthly_consumed + p_tokens,
      updated_at = now()
  WHERE agent_id = p_agent_id;
$$;
