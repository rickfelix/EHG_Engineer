-- Migration: Evaluation Profiles for EVA Stage 0
-- SD: SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-B
-- Purpose: Create evaluation_profiles table for configurable synthesis weights
--
-- Evaluation profiles allow different weighting strategies for Stage 0
-- venture scoring. Each profile defines weights for synthesis components
-- (virality, moat, cost, time_horizon, portfolio_fit, etc.)

-- Create evaluation_profiles table
CREATE TABLE IF NOT EXISTS evaluation_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  weights JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT DEFAULT 'system',

  -- Unique constraint: no duplicate name+version
  CONSTRAINT uq_evaluation_profiles_name_version UNIQUE (name, version)
);

-- Ensure at most one active profile via trigger
-- (Activating a profile deactivates all others)
CREATE OR REPLACE FUNCTION enforce_single_active_profile()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = true THEN
    UPDATE evaluation_profiles
    SET is_active = false, updated_at = now()
    WHERE id != NEW.id AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_single_active_profile ON evaluation_profiles;
CREATE TRIGGER trg_enforce_single_active_profile
  BEFORE INSERT OR UPDATE OF is_active ON evaluation_profiles
  FOR EACH ROW
  EXECUTE FUNCTION enforce_single_active_profile();

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_evaluation_profiles_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_evaluation_profiles_timestamp ON evaluation_profiles;
CREATE TRIGGER trg_update_evaluation_profiles_timestamp
  BEFORE UPDATE ON evaluation_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_evaluation_profiles_timestamp();

-- RLS policies
ALTER TABLE evaluation_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evaluation_profiles_read_all"
  ON evaluation_profiles FOR SELECT
  USING (true);

CREATE POLICY "evaluation_profiles_write_service"
  ON evaluation_profiles FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for quick active profile lookup
CREATE INDEX IF NOT EXISTS idx_evaluation_profiles_active
  ON evaluation_profiles (is_active) WHERE is_active = true;

-- Seed default "balanced" profile (equal weights across all synthesis components)
INSERT INTO evaluation_profiles (name, version, description, weights, is_active, created_by)
VALUES (
  'balanced', 1,
  'Equal weighting across all synthesis dimensions. Good default for general-purpose evaluation.',
  '{
    "cross_reference": 0.10,
    "portfolio_evaluation": 0.10,
    "problem_reframing": 0.05,
    "moat_architecture": 0.15,
    "chairman_constraints": 0.15,
    "time_horizon": 0.10,
    "archetypes": 0.10,
    "build_cost": 0.10,
    "virality": 0.15
  }'::jsonb,
  true,
  'migration'
)
ON CONFLICT (name, version) DO NOTHING;

-- Seed "aggressive_growth" profile (virality + moat heavy)
INSERT INTO evaluation_profiles (name, version, description, weights, is_active, created_by)
VALUES (
  'aggressive_growth', 1,
  'Heavily weights viral potential and moat strength. For ventures targeting rapid market capture.',
  '{
    "cross_reference": 0.05,
    "portfolio_evaluation": 0.05,
    "problem_reframing": 0.05,
    "moat_architecture": 0.20,
    "chairman_constraints": 0.10,
    "time_horizon": 0.05,
    "archetypes": 0.05,
    "build_cost": 0.10,
    "virality": 0.35
  }'::jsonb,
  false,
  'migration'
)
ON CONFLICT (name, version) DO NOTHING;

-- Seed "capital_efficient" profile (build cost + time horizon heavy)
INSERT INTO evaluation_profiles (name, version, description, weights, is_active, created_by)
VALUES (
  'capital_efficient', 1,
  'Prioritizes low build cost and favorable time horizon. For bootstrapped or resource-constrained evaluation.',
  '{
    "cross_reference": 0.10,
    "portfolio_evaluation": 0.10,
    "problem_reframing": 0.05,
    "moat_architecture": 0.10,
    "chairman_constraints": 0.15,
    "time_horizon": 0.15,
    "archetypes": 0.05,
    "build_cost": 0.25,
    "virality": 0.05
  }'::jsonb,
  false,
  'migration'
)
ON CONFLICT (name, version) DO NOTHING;

COMMENT ON TABLE evaluation_profiles IS 'Configurable evaluation weight profiles for EVA Stage 0 synthesis scoring';
COMMENT ON COLUMN evaluation_profiles.weights IS 'JSONB mapping synthesis component names to weight values (0-1, should sum to 1.0)';
COMMENT ON COLUMN evaluation_profiles.is_active IS 'Only one profile can be active at a time (enforced by trigger)';
