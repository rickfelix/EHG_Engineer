-- Migration: Create venture_sd_artifact_mapping table
-- SD: SD-LEO-INFRA-BRIDGE-ARTIFACT-ENRICHMENT-001
-- Purpose: Deterministic mapping of artifact types to SD architecture layers per venture type

CREATE TABLE IF NOT EXISTS venture_sd_artifact_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_type TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  sd_layer TEXT NOT NULL CHECK (sd_layer IN ('data', 'api', 'ui', 'tests', 'all')),
  classification TEXT NOT NULL CHECK (classification IN ('universal', 'layer_specific', 'supplemental')),
  is_required BOOLEAN NOT NULL DEFAULT false,
  lifecycle_stage INT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (venture_type, artifact_type, sd_layer)
);

-- Indexes for efficient lookups
CREATE INDEX idx_vsam_venture_type ON venture_sd_artifact_mapping (venture_type);
CREATE INDEX idx_vsam_artifact_type ON venture_sd_artifact_mapping (artifact_type);
CREATE INDEX idx_vsam_classification ON venture_sd_artifact_mapping (classification);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_vsam_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vsam_updated_at
  BEFORE UPDATE ON venture_sd_artifact_mapping
  FOR EACH ROW EXECUTE FUNCTION update_vsam_updated_at();

COMMENT ON TABLE venture_sd_artifact_mapping IS 'Deterministic mapping of EVA artifact types to SD architecture layers, keyed by venture_type. Used by lifecycle-sd-bridge enrichment pipeline.';
