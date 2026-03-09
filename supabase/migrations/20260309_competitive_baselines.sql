-- Migration: Create competitive_baselines table
-- SD: SD-LEO-INFRA-10X-VALUE-MULTIPLIER-001
-- Purpose: Store per-venture competitor data with epistemic classification

CREATE TABLE IF NOT EXISTS competitive_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  competitor_name TEXT NOT NULL,
  baseline_type TEXT NOT NULL DEFAULT 'COMPETITOR' CHECK (baseline_type IN ('COMPETITOR', 'STATUS_QUO')),
  pricing_data JSONB DEFAULT '{}'::jsonb,
  feature_coverage JSONB DEFAULT '{}'::jsonb,
  performance_metrics JSONB DEFAULT '{}'::jsonb,
  epistemic_tag TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (epistemic_tag IN ('FACT', 'ASSUMPTION', 'SIMULATION', 'UNKNOWN')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_competitive_baselines_venture_id ON competitive_baselines(venture_id);

ALTER TABLE competitive_baselines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on competitive_baselines"
  ON competitive_baselines
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
