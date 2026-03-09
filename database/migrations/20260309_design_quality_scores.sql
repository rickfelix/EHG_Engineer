-- Migration: design_quality_scores table
-- SD: SD-LEO-INFRA-DESIGN-COMPETITIVE-ADVANTAGE-001
-- Created: 2026-03-09
--
-- Purpose: Aggregate per-SD design quality metrics from design-agent results
-- into a composite scorecard for trend tracking and retrospective integration.

-- Idempotent: safe to run multiple times
CREATE TABLE IF NOT EXISTS design_quality_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id VARCHAR NOT NULL REFERENCES strategic_directives_v2(id),
  accessibility_score INTEGER CHECK (accessibility_score >= 0 AND accessibility_score <= 100),
  token_compliance_score INTEGER CHECK (token_compliance_score >= 0 AND token_compliance_score <= 100),
  component_reuse_score INTEGER CHECK (component_reuse_score >= 0 AND component_reuse_score <= 100),
  visual_polish_score INTEGER CHECK (visual_polish_score >= 0 AND visual_polish_score <= 100),
  composite_score INTEGER NOT NULL CHECK (composite_score >= 0 AND composite_score <= 100),
  dimensions JSONB DEFAULT '{}',
  source_result_id UUID REFERENCES sub_agent_execution_results(id),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups by SD
CREATE INDEX IF NOT EXISTS idx_design_quality_scores_sd_id ON design_quality_scores(sd_id);

-- Index for time-series queries (trend tracking)
CREATE INDEX IF NOT EXISTS idx_design_quality_scores_calculated_at ON design_quality_scores(calculated_at DESC);

-- Comment on table
COMMENT ON TABLE design_quality_scores IS 'Aggregated per-SD design quality scores from design-agent results. Composite formula: 35% accessibility + 25% token compliance + 20% component reuse + 20% visual polish.';
COMMENT ON COLUMN design_quality_scores.dimensions IS 'Raw dimension data from design-agent findings for audit trail';
COMMENT ON COLUMN design_quality_scores.source_result_id IS 'FK to the sub_agent_execution_results row used for scoring';

-- RLS: Allow service role and anon read access (consistent with other scoring tables)
ALTER TABLE design_quality_scores ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'design_quality_scores' AND policyname = 'design_quality_scores_select_policy'
  ) THEN
    CREATE POLICY design_quality_scores_select_policy ON design_quality_scores FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'design_quality_scores' AND policyname = 'design_quality_scores_insert_policy'
  ) THEN
    CREATE POLICY design_quality_scores_insert_policy ON design_quality_scores FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'design_quality_scores' AND policyname = 'design_quality_scores_update_policy'
  ) THEN
    CREATE POLICY design_quality_scores_update_policy ON design_quality_scores FOR UPDATE USING (true);
  END IF;
END $$;
