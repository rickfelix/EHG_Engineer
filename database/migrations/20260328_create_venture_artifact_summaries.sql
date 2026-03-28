-- Migration: Create venture_artifact_summaries table
-- SD: SD-LEO-INFRA-BRIDGE-ARTIFACT-ENRICHMENT-001
-- Purpose: Cache LLM-generated artifact summaries for enrichment pipeline Pass 1

CREATE TABLE IF NOT EXISTS venture_artifact_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  artifact_id UUID NOT NULL REFERENCES venture_artifacts(id),
  artifact_type TEXT NOT NULL,
  lifecycle_stage INT NOT NULL,
  summary_text TEXT NOT NULL,
  tags JSONB DEFAULT '[]',
  llm_model TEXT,
  token_count INT,
  source_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (venture_id, artifact_id)
);

-- Indexes
CREATE INDEX idx_vas_venture_id ON venture_artifact_summaries (venture_id);
CREATE INDEX idx_vas_artifact_type ON venture_artifact_summaries (artifact_type);
CREATE INDEX idx_vas_lifecycle_stage ON venture_artifact_summaries (lifecycle_stage);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_vas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vas_updated_at
  BEFORE UPDATE ON venture_artifact_summaries
  FOR EACH ROW EXECUTE FUNCTION update_vas_updated_at();

COMMENT ON TABLE venture_artifact_summaries IS 'Cached LLM-generated summaries of venture artifacts. Used by enrichment pipeline Pass 1 to avoid redundant LLM calls.';
