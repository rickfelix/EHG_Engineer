-- Stage-of-Death Predictions
-- Part of SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-J
-- Stores predicted death stage per venture × profile × archetype

CREATE TABLE IF NOT EXISTS stage_of_death_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL,
  archetype_key TEXT NOT NULL,
  profile_id UUID NOT NULL REFERENCES evaluation_profiles(id),
  predicted_death_stage INTEGER NOT NULL CHECK (predicted_death_stage BETWEEN 1 AND 25),
  predicted_probability NUMERIC(5,4) NOT NULL CHECK (predicted_probability BETWEEN 0 AND 1),
  death_factors JSONB,
  confidence_score NUMERIC(4,3) CHECK (confidence_score BETWEEN 0 AND 1),
  mortality_curve JSONB,
  actual_death_stage INTEGER CHECK (actual_death_stage IS NULL OR actual_death_stage BETWEEN 1 AND 25),
  prediction_accuracy NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(venture_id, profile_id)
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_sod_predictions_venture ON stage_of_death_predictions(venture_id);
CREATE INDEX IF NOT EXISTS idx_sod_predictions_archetype ON stage_of_death_predictions(archetype_key);
CREATE INDEX IF NOT EXISTS idx_sod_predictions_profile ON stage_of_death_predictions(profile_id);
CREATE INDEX IF NOT EXISTS idx_sod_predictions_stage ON stage_of_death_predictions(predicted_death_stage);

-- Enable RLS
ALTER TABLE stage_of_death_predictions ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
DROP POLICY IF EXISTS "service_role_full_access_sod_predictions" ON stage_of_death_predictions;
CREATE POLICY "service_role_full_access_sod_predictions"
  ON stage_of_death_predictions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_sod_predictions_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_sod_predictions_timestamp ON stage_of_death_predictions;
CREATE TRIGGER trg_update_sod_predictions_timestamp
  BEFORE UPDATE ON stage_of_death_predictions
  FOR EACH ROW
  EXECUTE FUNCTION update_sod_predictions_timestamp();
