-- =============================================================================
-- Migration: Venture Capability Scores
-- SD: SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-E
-- Date: 2026-03-04
-- Description: Creates venture_capability_scores table for the Capability
--   Contribution Score (CCS) system. Stores per-stage dimension scores with
--   rationale and cumulative aggregation. Supports cross-venture comparison.
--
-- Pre-requisites:
--   - ventures table exists with id UUID PK
--   - venture_artifacts table exists with id UUID PK
--
-- Rollback:
--   DROP TABLE IF EXISTS venture_capability_scores;
-- =============================================================================

-- Phase 1: Create table
CREATE TABLE IF NOT EXISTS venture_capability_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  stage_number INTEGER NOT NULL CHECK (stage_number BETWEEN 0 AND 25),
  dimension TEXT NOT NULL CHECK (dimension IN (
    'technical_depth',
    'market_validation',
    'financial_rigor',
    'operational_readiness',
    'strategic_alignment'
  )),
  score NUMERIC(5,2) CHECK (score >= 0 AND score <= 100),
  rationale TEXT CHECK (char_length(rationale) <= 200),
  cumulative_score NUMERIC(5,2) CHECK (cumulative_score >= 0 AND cumulative_score <= 100),
  artifact_id UUID REFERENCES venture_artifacts(id) ON DELETE SET NULL,
  scored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Phase 2: Unique constraint for idempotent upserts
-- Re-scoring the same venture/stage/dimension replaces the previous score
ALTER TABLE venture_capability_scores
  DROP CONSTRAINT IF EXISTS uq_venture_stage_dimension;
ALTER TABLE venture_capability_scores
  ADD CONSTRAINT uq_venture_stage_dimension
  UNIQUE (venture_id, stage_number, dimension);

-- Phase 3: Indexes for query patterns
CREATE INDEX IF NOT EXISTS idx_vcs_venture_dimension
  ON venture_capability_scores (venture_id, dimension);

CREATE INDEX IF NOT EXISTS idx_vcs_venture_stage
  ON venture_capability_scores (venture_id, stage_number);

CREATE INDEX IF NOT EXISTS idx_vcs_scored_at
  ON venture_capability_scores (scored_at DESC);

-- Phase 4: Enable RLS
ALTER TABLE venture_capability_scores ENABLE ROW LEVEL SECURITY;

-- Phase 5: RLS policies (matching venture_artifacts access pattern)
DROP POLICY IF EXISTS vcs_select_policy ON venture_capability_scores;
CREATE POLICY vcs_select_policy ON venture_capability_scores
  FOR SELECT USING (true);

DROP POLICY IF EXISTS vcs_insert_policy ON venture_capability_scores;
CREATE POLICY vcs_insert_policy ON venture_capability_scores
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS vcs_update_policy ON venture_capability_scores;
CREATE POLICY vcs_update_policy ON venture_capability_scores
  FOR UPDATE USING (true);

-- Phase 6: Updated_at trigger
CREATE OR REPLACE FUNCTION fn_update_vcs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vcs_updated_at ON venture_capability_scores;
CREATE TRIGGER trg_vcs_updated_at
  BEFORE UPDATE ON venture_capability_scores
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_vcs_updated_at();

-- Phase 7: Comment
COMMENT ON TABLE venture_capability_scores IS
  'Per-stage capability dimension scores for the CCS system. Each stage contributes weighted scores across 5 dimensions: technical_depth, market_validation, financial_rigor, operational_readiness, strategic_alignment.';
