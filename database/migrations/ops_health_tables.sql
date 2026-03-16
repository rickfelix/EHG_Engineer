-- =============================================================================
-- Migration: ops_health_tables.sql
-- Purpose: Create operations health monitoring tables with RLS policies
-- SD: SD-LEO-INFRA-OPERATIONS-PRODUCT-AGENT-001
-- Date: 2026-03-16
--
-- Tables created:
--   - ops_product_health: Daily product health snapshots per venture
--   - ops_agent_health: Daily AI agent health snapshots per venture
--   - ops_health_alerts: Threshold breach alerts for health metrics
--
-- RLS Pattern: JWT venture_id claim-based (same as ops_revenue_* tables)
--
-- Rollback:
--   DROP TABLE IF EXISTS ops_health_alerts;
--   DROP TABLE IF EXISTS ops_agent_health;
--   DROP TABLE IF EXISTS ops_product_health;
-- =============================================================================

BEGIN;

-- ============================================================
-- 1. ops_product_health — product health KPIs per venture per date
-- ============================================================

CREATE TABLE IF NOT EXISTS ops_product_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  metric_date DATE NOT NULL,
  uptime_pct NUMERIC(5,2),
  p95_latency_ms NUMERIC(10,2),
  error_rate NUMERIC(5,4),
  infra_cost_usd NUMERIC(12,2),
  total_requests INTEGER DEFAULT 0,
  successful_requests INTEGER DEFAULT 0,
  error_requests INTEGER DEFAULT 0,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(venture_id, metric_date)
);

COMMENT ON TABLE ops_product_health IS 'Daily product health snapshots — uptime, latency, error rates per venture';
COMMENT ON COLUMN ops_product_health.uptime_pct IS 'Percentage of successful requests (e.g. 99.50 = 99.5%)';
COMMENT ON COLUMN ops_product_health.p95_latency_ms IS '95th percentile response latency in milliseconds';
COMMENT ON COLUMN ops_product_health.error_rate IS 'Error rate as decimal (e.g. 0.0100 = 1%)';
COMMENT ON COLUMN ops_product_health.infra_cost_usd IS 'Estimated infrastructure cost for the day';

ALTER TABLE ops_product_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_product_health_service_role" ON ops_product_health
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "ops_product_health_venture_select" ON ops_product_health
  FOR SELECT TO authenticated
  USING (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);

CREATE POLICY "ops_product_health_venture_insert" ON ops_product_health
  FOR INSERT TO authenticated
  WITH CHECK (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);

CREATE POLICY "ops_product_health_venture_update" ON ops_product_health
  FOR UPDATE TO authenticated
  USING (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid)
  WITH CHECK (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);


-- ============================================================
-- 2. ops_agent_health — AI agent health KPIs per agent per venture per date
-- ============================================================

CREATE TABLE IF NOT EXISTS ops_agent_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  agent_id UUID NOT NULL,
  metric_date DATE NOT NULL,
  response_quality_score NUMERIC(5,2),
  decision_accuracy_pct NUMERIC(5,2),
  cost_per_action_usd NUMERIC(10,4),
  quota_utilization_pct NUMERIC(5,2),
  total_actions INTEGER DEFAULT 0,
  successful_actions INTEGER DEFAULT 0,
  budget_remaining_pct NUMERIC(5,2),
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(venture_id, agent_id, metric_date)
);

COMMENT ON TABLE ops_agent_health IS 'Daily AI agent health snapshots — quality, accuracy, cost, quota per agent per venture';
COMMENT ON COLUMN ops_agent_health.agent_id IS 'Tool/agent UUID from venture_tool_quotas.tool_id';
COMMENT ON COLUMN ops_agent_health.response_quality_score IS 'Quality score 0-100 derived from outcome success rate';
COMMENT ON COLUMN ops_agent_health.decision_accuracy_pct IS 'Percentage of successful decisions/outcomes';
COMMENT ON COLUMN ops_agent_health.cost_per_action_usd IS 'Average cost per action (cost / usage)';
COMMENT ON COLUMN ops_agent_health.quota_utilization_pct IS 'Percentage of monthly quota used';
COMMENT ON COLUMN ops_agent_health.budget_remaining_pct IS 'Percentage of token budget remaining';

ALTER TABLE ops_agent_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_agent_health_service_role" ON ops_agent_health
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "ops_agent_health_venture_select" ON ops_agent_health
  FOR SELECT TO authenticated
  USING (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);

CREATE POLICY "ops_agent_health_venture_insert" ON ops_agent_health
  FOR INSERT TO authenticated
  WITH CHECK (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);

CREATE POLICY "ops_agent_health_venture_update" ON ops_agent_health
  FOR UPDATE TO authenticated
  USING (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid)
  WITH CHECK (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);


-- ============================================================
-- 3. ops_health_alerts — threshold breach alerts for health metrics
-- ============================================================

CREATE TABLE IF NOT EXISTS ops_health_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  layer TEXT NOT NULL CHECK (layer IN ('product', 'agent')),
  metric_type TEXT NOT NULL CHECK (metric_type IN ('uptime', 'p95_latency', 'error_rate', 'infra_cost', 'response_quality', 'decision_accuracy', 'cost_per_action', 'quota_utilization', 'budget_remaining')),
  actual_value NUMERIC(12,4) NOT NULL,
  threshold_value NUMERIC(12,4) NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'critical', 'emergency')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed')),
  agent_id UUID,
  alert_date DATE NOT NULL DEFAULT CURRENT_DATE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE ops_health_alerts IS 'Health metric alerts triggered when thresholds are breached';
COMMENT ON COLUMN ops_health_alerts.layer IS 'Which monitoring layer: product or agent';
COMMENT ON COLUMN ops_health_alerts.metric_type IS 'Which health metric triggered the alert';
COMMENT ON COLUMN ops_health_alerts.severity IS 'Alert severity: warning, critical, emergency';
COMMENT ON COLUMN ops_health_alerts.status IS 'Alert lifecycle: open -> acknowledged -> resolved/dismissed';
COMMENT ON COLUMN ops_health_alerts.agent_id IS 'For agent-layer alerts, the specific agent that triggered it';

ALTER TABLE ops_health_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_health_alerts_service_role" ON ops_health_alerts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "ops_health_alerts_venture_select" ON ops_health_alerts
  FOR SELECT TO authenticated
  USING (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);

CREATE POLICY "ops_health_alerts_venture_insert" ON ops_health_alerts
  FOR INSERT TO authenticated
  WITH CHECK (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);

CREATE POLICY "ops_health_alerts_venture_update" ON ops_health_alerts
  FOR UPDATE TO authenticated
  USING (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid)
  WITH CHECK (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);


-- ============================================================
-- 4. Indexes for common query patterns
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_ops_product_health_venture_date
  ON ops_product_health (venture_id, metric_date DESC);

CREATE INDEX IF NOT EXISTS idx_ops_agent_health_venture_date
  ON ops_agent_health (venture_id, agent_id, metric_date DESC);

CREATE INDEX IF NOT EXISTS idx_ops_health_alerts_venture_status
  ON ops_health_alerts (venture_id, status)
  WHERE status IN ('open', 'acknowledged');

CREATE INDEX IF NOT EXISTS idx_ops_health_alerts_date
  ON ops_health_alerts (alert_date DESC);

COMMIT;
