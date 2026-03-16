-- =============================================================================
-- Migration: ops_friday_scorecard_tables.sql
-- SD: SD-LEO-INFRA-OPERATIONS-FRIDAY-SCORECARD-001
-- Date: 2026-03-16
--
-- Tables: ops_friday_scorecards, ops_quarterly_assessments
-- RLS Pattern: JWT venture_id claim-based
-- =============================================================================

BEGIN;

-- ============================================================
-- 1. ops_friday_scorecards — weekly scorecard snapshots
-- ============================================================

CREATE TABLE IF NOT EXISTS ops_friday_scorecards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  week_date DATE NOT NULL,
  revenue_status TEXT CHECK (revenue_status IN ('green', 'yellow', 'red', 'grey')),
  customer_status TEXT CHECK (customer_status IN ('green', 'yellow', 'red', 'grey')),
  product_status TEXT CHECK (product_status IN ('green', 'yellow', 'red', 'grey')),
  agent_status TEXT CHECK (agent_status IN ('green', 'yellow', 'red', 'grey')),
  cost_status TEXT CHECK (cost_status IN ('green', 'yellow', 'red', 'grey')),
  overall_status TEXT NOT NULL CHECK (overall_status IN ('green', 'yellow', 'red', 'grey')),
  alert_count INTEGER DEFAULT 0,
  decision_items JSONB DEFAULT '[]'::jsonb,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(venture_id, week_date)
);

COMMENT ON TABLE ops_friday_scorecards IS 'Weekly operations scorecard snapshots for Friday meeting with Eva';
COMMENT ON COLUMN ops_friday_scorecards.overall_status IS 'Worst status across all domains';
COMMENT ON COLUMN ops_friday_scorecards.decision_items IS 'Array of items requiring chairman decision';

ALTER TABLE ops_friday_scorecards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_friday_scorecards_service_role" ON ops_friday_scorecards
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "ops_friday_scorecards_venture_select" ON ops_friday_scorecards
  FOR SELECT TO authenticated
  USING (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);

CREATE POLICY "ops_friday_scorecards_venture_insert" ON ops_friday_scorecards
  FOR INSERT TO authenticated
  WITH CHECK (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);

CREATE POLICY "ops_friday_scorecards_venture_update" ON ops_friday_scorecards
  FOR UPDATE TO authenticated
  USING (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid)
  WITH CHECK (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);

-- ============================================================
-- 2. ops_quarterly_assessments — deep assessment scheduling
-- ============================================================

CREATE TABLE IF NOT EXISTS ops_quarterly_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  assessment_type TEXT NOT NULL CHECK (assessment_type IN ('risk_recalibration', 'exit_readiness', 'competitive_landscape', 'financial_health')),
  quarter TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'skipped')),
  scheduled_date DATE,
  completed_date DATE,
  findings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(venture_id, assessment_type, quarter)
);

COMMENT ON TABLE ops_quarterly_assessments IS 'Quarterly deep assessments surfaced through Friday meeting';

ALTER TABLE ops_quarterly_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_quarterly_assessments_service_role" ON ops_quarterly_assessments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "ops_quarterly_assessments_venture_select" ON ops_quarterly_assessments
  FOR SELECT TO authenticated
  USING (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);

CREATE POLICY "ops_quarterly_assessments_venture_insert" ON ops_quarterly_assessments
  FOR INSERT TO authenticated
  WITH CHECK (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);

CREATE POLICY "ops_quarterly_assessments_venture_update" ON ops_quarterly_assessments
  FOR UPDATE TO authenticated
  USING (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid)
  WITH CHECK (venture_id = (auth.jwt()->'app_metadata'->>'venture_id')::uuid);

-- ============================================================
-- 3. Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_ops_friday_scorecards_venture_week
  ON ops_friday_scorecards (venture_id, week_date DESC);

CREATE INDEX IF NOT EXISTS idx_ops_quarterly_assessments_venture_quarter
  ON ops_quarterly_assessments (venture_id, quarter DESC);

CREATE INDEX IF NOT EXISTS idx_ops_quarterly_assessments_status
  ON ops_quarterly_assessments (status)
  WHERE status IN ('scheduled', 'in_progress');

COMMIT;
