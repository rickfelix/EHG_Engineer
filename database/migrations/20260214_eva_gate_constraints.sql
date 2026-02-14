-- Migration: EVA Kill Gate Constraints and Artifact Dependencies
-- SD Reference: SD-EVA-FIX-DB-SCHEMA-001
-- Date: 2026-02-14
-- Purpose: Enforce EVA kill gate score thresholds (70%) at DB level and track artifact dependencies
-- Audit Finding: HIGH-002 (kill gates only in app code), HIGH-003 (cross-stage dependencies)

-- ============================================================================
-- EVA STAGE GATE RESULTS TABLE
-- ============================================================================
-- Tracks all gate evaluations (entry, exit, kill) with score enforcement

CREATE TABLE IF NOT EXISTS eva_stage_gate_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  stage_number INTEGER NOT NULL CHECK (stage_number BETWEEN 1 AND 25),
  gate_type TEXT NOT NULL CHECK (gate_type IN ('entry', 'exit', 'kill')),
  overall_score NUMERIC(5,2) CHECK (overall_score >= 0 AND overall_score <= 100),
  passed BOOLEAN NOT NULL DEFAULT FALSE,
  evaluated_at TIMESTAMPTZ DEFAULT NOW(),
  evaluated_by TEXT, -- 'system', 'chairman', agent name, user email
  gate_criteria JSONB DEFAULT '{}', -- Stores individual criterion scores
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(venture_id, stage_number, gate_type, evaluated_at)
);

-- Index for venture lookups and stage queries
CREATE INDEX IF NOT EXISTS idx_eva_gate_results_venture
  ON eva_stage_gate_results(venture_id, stage_number);

CREATE INDEX IF NOT EXISTS idx_eva_gate_results_stage_type
  ON eva_stage_gate_results(stage_number, gate_type);

-- ============================================================================
-- KILL GATE ENFORCEMENT TRIGGER
-- ============================================================================
-- Prevents passing kill gates (stages 3, 5, 13, 23) with score < 70

CREATE OR REPLACE FUNCTION enforce_kill_gate_threshold()
RETURNS TRIGGER AS $$
DECLARE
  kill_gate_stages INTEGER[] := ARRAY[3, 5, 13, 23];
  min_score NUMERIC := 70.0;
BEGIN
  -- Only enforce for kill gates
  IF NEW.gate_type = 'kill' AND NEW.stage_number = ANY(kill_gate_stages) THEN
    -- Block if trying to pass with insufficient score
    IF NEW.passed = TRUE AND (NEW.overall_score IS NULL OR NEW.overall_score < min_score) THEN
      RAISE EXCEPTION
        'Kill gate failure: Stage % requires score >= % to pass (current: %)',
        NEW.stage_number,
        min_score,
        COALESCE(NEW.overall_score::TEXT, 'NULL');
    END IF;

    -- Auto-fail if score is below threshold (even if passed=FALSE explicitly)
    IF NEW.overall_score IS NOT NULL AND NEW.overall_score < min_score THEN
      NEW.passed := FALSE;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists, then create
DO $$
BEGIN
  DROP TRIGGER IF EXISTS trigger_enforce_kill_gate_threshold ON eva_stage_gate_results;
END $$;

CREATE TRIGGER trigger_enforce_kill_gate_threshold
  BEFORE INSERT OR UPDATE ON eva_stage_gate_results
  FOR EACH ROW
  EXECUTE FUNCTION enforce_kill_gate_threshold();

-- ============================================================================
-- EVA ARTIFACT DEPENDENCIES TABLE
-- ============================================================================
-- Tracks cross-stage data contracts (e.g., Stage 2 ICP → Stage 4 TAM)

CREATE TABLE IF NOT EXISTS eva_artifact_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_stage INTEGER NOT NULL CHECK (source_stage BETWEEN 1 AND 25),
  target_stage INTEGER NOT NULL CHECK (target_stage BETWEEN 1 AND 25),
  artifact_type TEXT NOT NULL, -- 'icp', 'tam', 'market_size', 'positioning', etc.
  artifact_key TEXT, -- JSON path or table column name (e.g., 'venture_metadata.icp')
  required BOOLEAN DEFAULT TRUE,
  validation_status TEXT CHECK (validation_status IN ('pending', 'validated', 'missing', 'invalid')),
  validation_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (source_stage < target_stage), -- Dependencies must flow forward
  UNIQUE(source_stage, target_stage, artifact_type)
);

-- Index for dependency lookups
CREATE INDEX IF NOT EXISTS idx_eva_artifact_deps_source
  ON eva_artifact_dependencies(source_stage);

CREATE INDEX IF NOT EXISTS idx_eva_artifact_deps_target
  ON eva_artifact_dependencies(target_stage);

CREATE INDEX IF NOT EXISTS idx_eva_artifact_deps_status
  ON eva_artifact_dependencies(validation_status)
  WHERE validation_status IN ('missing', 'invalid');

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE eva_stage_gate_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE eva_artifact_dependencies ENABLE ROW LEVEL SECURITY;

-- Service role full access
DO $$
BEGIN
  DROP POLICY IF EXISTS service_role_all_eva_gate_results ON eva_stage_gate_results;
  DROP POLICY IF EXISTS service_role_all_eva_artifact_deps ON eva_artifact_dependencies;
END $$;

CREATE POLICY service_role_all_eva_gate_results
  ON eva_stage_gate_results
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE POLICY service_role_all_eva_artifact_deps
  ON eva_artifact_dependencies
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- Authenticated users: read gate results for their ventures
DO $$
BEGIN
  DROP POLICY IF EXISTS authenticated_read_own_gate_results ON eva_stage_gate_results;
END $$;

CREATE POLICY authenticated_read_own_gate_results
  ON eva_stage_gate_results
  FOR SELECT
  TO authenticated
  USING (
    venture_id IN (
      SELECT id FROM ventures WHERE created_by = auth.uid()
    )
  );

-- Authenticated users: read all artifact dependencies (reference data)
DO $$
BEGIN
  DROP POLICY IF EXISTS authenticated_read_artifact_deps ON eva_artifact_dependencies;
END $$;

CREATE POLICY authenticated_read_artifact_deps
  ON eva_artifact_dependencies
  FOR SELECT
  TO authenticated
  USING (TRUE);

-- ============================================================================
-- SEED DATA: Standard EVA Artifact Dependencies
-- ============================================================================
-- Reference dependencies per EVA architecture (Stage 2 ICP → Stage 4, etc.)

INSERT INTO eva_artifact_dependencies (source_stage, target_stage, artifact_type, artifact_key, required, validation_status)
VALUES
  -- Stage 2 (ICP Discovery) → Stage 4 (Market Sizing)
  (2, 4, 'icp', 'venture_metadata.icp', TRUE, 'pending'),

  -- Stage 4 (Market Sizing) → Stage 6 (Positioning)
  (4, 6, 'tam', 'venture_metadata.tam', TRUE, 'pending'),
  (4, 6, 'market_size', 'venture_metadata.market_size', TRUE, 'pending'),

  -- Stage 6 (Positioning) → Stage 8 (MVP Definition)
  (6, 8, 'positioning', 'venture_metadata.positioning', TRUE, 'pending'),

  -- Stage 8 (MVP Definition) → Stage 10 (Build)
  (8, 10, 'mvp_spec', 'venture_metadata.mvp_spec', TRUE, 'pending'),

  -- Stage 13 (Beta) → Stage 15 (Launch Prep)
  (13, 15, 'beta_results', 'venture_metadata.beta_results', TRUE, 'pending'),

  -- Stage 23 (Scale Ops) → Stage 25 (Optimization)
  (23, 25, 'scale_metrics', 'venture_metadata.scale_metrics', TRUE, 'pending')
ON CONFLICT (source_stage, target_stage, artifact_type) DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE eva_stage_gate_results IS
  'Tracks EVA gate evaluations with kill gate enforcement (stages 3,5,13,23 require 70% score)';

COMMENT ON COLUMN eva_stage_gate_results.gate_type IS
  'entry = pre-stage check, exit = post-stage check, kill = critical threshold gate';

COMMENT ON COLUMN eva_stage_gate_results.gate_criteria IS
  'JSONB storing individual criterion scores (e.g., {"market_validation": 85, "team_readiness": 65})';

COMMENT ON TABLE eva_artifact_dependencies IS
  'Cross-stage data contracts ensuring artifacts from earlier stages are validated before later stages proceed';

COMMENT ON COLUMN eva_artifact_dependencies.artifact_key IS
  'JSON path or table reference where artifact is stored (e.g., venture_metadata.icp)';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Uncomment to test after migration:

-- Test kill gate rejection (should fail):
-- INSERT INTO eva_stage_gate_results (venture_id, stage_number, gate_type, overall_score, passed)
-- VALUES ('00000000-0000-0000-0000-000000000000', 3, 'kill', 65.0, TRUE);

-- Test kill gate pass (should succeed):
-- INSERT INTO eva_stage_gate_results (venture_id, stage_number, gate_type, overall_score, passed)
-- VALUES ('00000000-0000-0000-0000-000000000000', 3, 'kill', 75.0, TRUE);

-- Test artifact dependency lookup:
-- SELECT source_stage, target_stage, artifact_type, artifact_key
-- FROM eva_artifact_dependencies
-- WHERE source_stage = 2;
