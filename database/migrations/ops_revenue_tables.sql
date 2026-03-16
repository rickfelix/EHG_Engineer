-- =============================================================================
-- Migration: ops_revenue_tables.sql
-- Purpose: Create operations revenue monitoring tables with RLS policies
-- SD: SD-LEO-INFRA-OPERATIONS-REVENUE-MONITORING-001
-- Date: 2026-03-15
--
-- Tables created:
--   - ops_revenue_metrics: Monthly/daily revenue KPIs per venture
--   - ops_revenue_alerts: Threshold breach alerts for revenue metrics
--
-- RLS Pattern: JWT venture_id claim-based (same as SRIP tables)
--
-- Rollback:
--   DROP TABLE IF EXISTS ops_revenue_alerts;
--   DROP TABLE IF EXISTS ops_revenue_metrics;
-- =============================================================================

BEGIN;

-- ============================================================
-- 1. ops_revenue_metrics — revenue KPIs per venture per date
-- ============================================================

CREATE TABLE IF NOT EXISTS ops_revenue_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  metric_date DATE NOT NULL,
  mrr NUMERIC(12,2) DEFAULT 0,
  churn_rate NUMERIC(5,4) DEFAULT 0,
  expansion_revenue NUMERIC(12,2) DEFAULT 0,
  contraction_revenue NUMERIC(12,2) DEFAULT 0,
  failed_payments INTEGER DEFAULT 0,
  ltv_cac NUMERIC(6,2),
  target_mrr NUMERIC(12,2),
  target_churn_rate NUMERIC(5,4),
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(venture_id, metric_date)
);

COMMENT ON TABLE ops_revenue_metrics IS 'Revenue KPIs tracked per venture per date — MRR, churn, expansion/contraction, LTV/CAC';
COMMENT ON COLUMN ops_revenue_metrics.mrr IS 'Monthly Recurring Revenue in dollars';
COMMENT ON COLUMN ops_revenue_metrics.churn_rate IS 'Customer churn rate as decimal (e.g. 0.0350 = 3.5%)';
COMMENT ON COLUMN ops_revenue_metrics.expansion_revenue IS 'Revenue from upsells/cross-sells';
COMMENT ON COLUMN ops_revenue_metrics.contraction_revenue IS 'Revenue lost from downgrades (positive number)';
COMMENT ON COLUMN ops_revenue_metrics.ltv_cac IS 'Lifetime Value to Customer Acquisition Cost ratio';
COMMENT ON COLUMN ops_revenue_metrics.computed_at IS 'When these metrics were last computed/refreshed';

-- Enable RLS
ALTER TABLE ops_revenue_metrics ENABLE ROW LEVEL SECURITY;

-- Service role bypass
CREATE POLICY "ops_revenue_metrics_service_role" ON ops_revenue_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Venture-scoped access via JWT claim
CREATE POLICY "ops_revenue_metrics_venture_select" ON ops_revenue_metrics
  FOR SELECT TO authenticated
  USING (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);

CREATE POLICY "ops_revenue_metrics_venture_insert" ON ops_revenue_metrics
  FOR INSERT TO authenticated
  WITH CHECK (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);

CREATE POLICY "ops_revenue_metrics_venture_update" ON ops_revenue_metrics
  FOR UPDATE TO authenticated
  USING (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid)
  WITH CHECK (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);


-- ============================================================
-- 2. ops_revenue_alerts — threshold breach alerts
-- ============================================================

CREATE TABLE IF NOT EXISTS ops_revenue_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  metric_type TEXT NOT NULL CHECK (metric_type IN ('mrr', 'churn_rate', 'expansion', 'contraction', 'failed_payments', 'ltv_cac')),
  actual_value NUMERIC(12,2) NOT NULL,
  target_value NUMERIC(12,2) NOT NULL,
  deviation_pct NUMERIC(6,2) NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'critical', 'emergency')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed')),
  alert_date DATE NOT NULL DEFAULT CURRENT_DATE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE ops_revenue_alerts IS 'Revenue metric alerts triggered when actuals deviate from targets beyond thresholds';
COMMENT ON COLUMN ops_revenue_alerts.metric_type IS 'Which revenue metric triggered the alert';
COMMENT ON COLUMN ops_revenue_alerts.deviation_pct IS 'Percentage deviation from target (e.g. -15.50 = 15.5% below target)';
COMMENT ON COLUMN ops_revenue_alerts.severity IS 'Alert severity: warning (minor), critical (action needed), emergency (immediate)';
COMMENT ON COLUMN ops_revenue_alerts.status IS 'Alert lifecycle: open -> acknowledged -> resolved/dismissed';

-- Enable RLS
ALTER TABLE ops_revenue_alerts ENABLE ROW LEVEL SECURITY;

-- Service role bypass
CREATE POLICY "ops_revenue_alerts_service_role" ON ops_revenue_alerts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Venture-scoped access via JWT claim
CREATE POLICY "ops_revenue_alerts_venture_select" ON ops_revenue_alerts
  FOR SELECT TO authenticated
  USING (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);

CREATE POLICY "ops_revenue_alerts_venture_insert" ON ops_revenue_alerts
  FOR INSERT TO authenticated
  WITH CHECK (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);

CREATE POLICY "ops_revenue_alerts_venture_update" ON ops_revenue_alerts
  FOR UPDATE TO authenticated
  USING (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid)
  WITH CHECK (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);


-- ============================================================
-- 3. Indexes for common query patterns
-- ============================================================

-- Fast lookup by venture + date range (dashboard queries)
CREATE INDEX IF NOT EXISTS idx_ops_revenue_metrics_venture_date
  ON ops_revenue_metrics (venture_id, metric_date DESC);

-- Fast lookup for open alerts by venture
CREATE INDEX IF NOT EXISTS idx_ops_revenue_alerts_venture_status
  ON ops_revenue_alerts (venture_id, status)
  WHERE status IN ('open', 'acknowledged');

-- Alert date range queries
CREATE INDEX IF NOT EXISTS idx_ops_revenue_alerts_date
  ON ops_revenue_alerts (alert_date DESC);

COMMIT;
