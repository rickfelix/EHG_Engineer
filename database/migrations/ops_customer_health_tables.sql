-- =============================================================================
-- Migration: ops_customer_health_tables.sql
-- Purpose: Create customer health scoring and persona behavioral data tables
-- SD: SD-LEO-INFRA-OPERATIONS-CUSTOMER-HEALTH-001
-- Date: 2026-03-16
--
-- Tables created:
--   - ops_customer_health_scores: Per-customer health scores (4 dimensions + composite)
--   - persona_behavioral_data: Anonymized behavioral pattern aggregations
--
-- RLS Pattern: JWT venture_id claim-based (same as ops_revenue_metrics)
--
-- Rollback:
--   DROP TABLE IF EXISTS persona_behavioral_data;
--   DROP TABLE IF EXISTS ops_customer_health_scores;
-- =============================================================================

BEGIN;

-- ============================================================
-- 1. ops_customer_health_scores — per-customer health scoring
-- ============================================================

CREATE TABLE IF NOT EXISTS ops_customer_health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  customer_id TEXT NOT NULL,
  dimension_scores JSONB NOT NULL DEFAULT '{}',
  overall_score NUMERIC(5,2) NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  at_risk BOOLEAN DEFAULT FALSE,
  trigger_type TEXT,
  recommended_action TEXT,
  metadata JSONB,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'ops-health-service'
);

COMMENT ON TABLE ops_customer_health_scores IS 'Per-customer health scores across 4 dimensions: login_frequency, feature_adoption, sentiment, payment';
COMMENT ON COLUMN ops_customer_health_scores.customer_id IS 'Customer identifier (venture-scoped, not globally unique)';
COMMENT ON COLUMN ops_customer_health_scores.dimension_scores IS 'JSONB with keys: login_frequency, feature_adoption, sentiment, payment (each 0-100)';
COMMENT ON COLUMN ops_customer_health_scores.overall_score IS 'Weighted composite score 0-100';
COMMENT ON COLUMN ops_customer_health_scores.at_risk IS 'Whether customer is flagged as at-risk based on threshold or rapid decline';
COMMENT ON COLUMN ops_customer_health_scores.trigger_type IS 'What triggered at-risk flag: threshold_breach, rapid_decline, low_<dimension>';
COMMENT ON COLUMN ops_customer_health_scores.recommended_action IS 'Suggested action: urgent_outreach, engagement_campaign, onboarding_refresh, support_followup, billing_review';
COMMENT ON COLUMN ops_customer_health_scores.computed_at IS 'When this score was computed (for time-series ordering)';

-- Enable RLS
ALTER TABLE ops_customer_health_scores ENABLE ROW LEVEL SECURITY;

-- Service role bypass
CREATE POLICY "ops_customer_health_scores_service_role" ON ops_customer_health_scores
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Venture-scoped access via JWT claim
CREATE POLICY "ops_customer_health_scores_venture_select" ON ops_customer_health_scores
  FOR SELECT TO authenticated
  USING (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);

CREATE POLICY "ops_customer_health_scores_venture_insert" ON ops_customer_health_scores
  FOR INSERT TO authenticated
  WITH CHECK (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);

CREATE POLICY "ops_customer_health_scores_venture_update" ON ops_customer_health_scores
  FOR UPDATE TO authenticated
  USING (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid)
  WITH CHECK (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);


-- ============================================================
-- 2. persona_behavioral_data — anonymized behavioral patterns
-- ============================================================

CREATE TABLE IF NOT EXISTS persona_behavioral_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  persona_type TEXT NOT NULL,
  behavioral_patterns JSONB NOT NULL DEFAULT '{}',
  sample_size INTEGER NOT NULL DEFAULT 0 CHECK (sample_size >= 0),
  aggregation_period TEXT DEFAULT 'daily',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'ops-health-service'
);

COMMENT ON TABLE persona_behavioral_data IS 'Anonymized behavioral pattern aggregations per persona segment for Portfolio Intelligence Phase 2';
COMMENT ON COLUMN persona_behavioral_data.persona_type IS 'Persona segment category (e.g. power_user, casual, churning)';
COMMENT ON COLUMN persona_behavioral_data.behavioral_patterns IS 'JSONB with aggregated anonymized patterns — no PII or customer-identifiable data';
COMMENT ON COLUMN persona_behavioral_data.sample_size IS 'Number of customers in this aggregation';
COMMENT ON COLUMN persona_behavioral_data.aggregation_period IS 'How often this feed is refreshed: daily, weekly, monthly';

-- Enable RLS
ALTER TABLE persona_behavioral_data ENABLE ROW LEVEL SECURITY;

-- Service role bypass
CREATE POLICY "persona_behavioral_data_service_role" ON persona_behavioral_data
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Venture-scoped access via JWT claim
CREATE POLICY "persona_behavioral_data_venture_select" ON persona_behavioral_data
  FOR SELECT TO authenticated
  USING (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);

CREATE POLICY "persona_behavioral_data_venture_insert" ON persona_behavioral_data
  FOR INSERT TO authenticated
  WITH CHECK (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);

CREATE POLICY "persona_behavioral_data_venture_update" ON persona_behavioral_data
  FOR UPDATE TO authenticated
  USING (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid)
  WITH CHECK (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);


-- ============================================================
-- 3. Indexes for common query patterns
-- ============================================================

-- Fast lookup by venture + customer (get latest score)
CREATE INDEX IF NOT EXISTS idx_ops_health_venture_customer
  ON ops_customer_health_scores (venture_id, customer_id, computed_at DESC);

-- Fast at-risk detection queries
CREATE INDEX IF NOT EXISTS idx_ops_health_venture_atrisk
  ON ops_customer_health_scores (venture_id, overall_score)
  WHERE at_risk = TRUE;

-- Time-series queries by venture
CREATE INDEX IF NOT EXISTS idx_ops_health_venture_time
  ON ops_customer_health_scores (venture_id, computed_at DESC);

-- Persona feed by venture and type
CREATE INDEX IF NOT EXISTS idx_persona_feed_venture_type
  ON persona_behavioral_data (venture_id, persona_type, created_at DESC);

COMMIT;
