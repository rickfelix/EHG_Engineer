-- Counterfactual Scores
-- Part of SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-I
-- Stores batch counterfactual re-scoring results: venture × profile comparisons

CREATE TABLE IF NOT EXISTS counterfactual_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL,
  profile_id UUID NOT NULL REFERENCES evaluation_profiles(id),
  original_score NUMERIC(6,2) NOT NULL,
  counterfactual_score NUMERIC(6,2) NOT NULL,
  delta NUMERIC(6,2) NOT NULL,
  breakdown JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(venture_id, profile_id)
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_counterfactual_scores_venture ON counterfactual_scores(venture_id);
CREATE INDEX IF NOT EXISTS idx_counterfactual_scores_profile ON counterfactual_scores(profile_id);
CREATE INDEX IF NOT EXISTS idx_counterfactual_scores_delta ON counterfactual_scores(delta DESC);

-- Enable RLS
ALTER TABLE counterfactual_scores ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
DROP POLICY IF EXISTS "service_role_full_access_counterfactual_scores" ON counterfactual_scores;
CREATE POLICY "service_role_full_access_counterfactual_scores"
  ON counterfactual_scores
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_counterfactual_scores_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_counterfactual_scores_timestamp ON counterfactual_scores;
CREATE TRIGGER trg_update_counterfactual_scores_timestamp
  BEFORE UPDATE ON counterfactual_scores
  FOR EACH ROW
  EXECUTE FUNCTION update_counterfactual_scores_timestamp();
