-- Migration: Create stage_artifact_requirements table
-- SD: SD-UNIFIED-STAGE-GATE-ARTIFACTPRECONDITION-ORCH-001-A
-- Purpose: Store per-stage artifact preconditions for fn_advance_venture_stage RPC

CREATE TABLE IF NOT EXISTS stage_artifact_requirements (
  id SERIAL PRIMARY KEY,
  stage_number INTEGER NOT NULL CHECK (stage_number BETWEEN 1 AND 26),
  artifact_type TEXT NOT NULL,
  required_status TEXT NOT NULL DEFAULT 'completed',
  is_blocking BOOLEAN NOT NULL DEFAULT true,
  timeout_hours INTEGER,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (stage_number, artifact_type)
);

COMMENT ON TABLE stage_artifact_requirements IS 'Per-stage artifact preconditions checked by fn_advance_venture_stage before allowing advancement';
COMMENT ON COLUMN stage_artifact_requirements.stage_number IS 'Venture lifecycle stage (1-26)';
COMMENT ON COLUMN stage_artifact_requirements.artifact_type IS 'Required artifact type from venture_artifacts';
COMMENT ON COLUMN stage_artifact_requirements.required_status IS 'Status the artifact must have (default: completed)';
COMMENT ON COLUMN stage_artifact_requirements.is_blocking IS 'If true, missing artifact blocks advancement';
COMMENT ON COLUMN stage_artifact_requirements.timeout_hours IS 'Optional timeout for escalation (future use)';
