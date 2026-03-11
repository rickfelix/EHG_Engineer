-- Migration: Stage Zero Experiment Engine
-- Tables: experiments, experiment_assignments, experiment_outcomes
-- Created: 2026-03-10
-- Purpose: Support A/B experimentation framework for venture stage workflows

-- ============================================================
-- Table 1: experiments
-- ============================================================
CREATE TABLE IF NOT EXISTS experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  variants JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'stopped', 'archived')),
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_by TEXT DEFAULT 'system'
);

COMMENT ON TABLE experiments IS 'Stage Zero Experiment Engine - experiment definitions with hypothesis, variants, and lifecycle status';
COMMENT ON COLUMN experiments.variants IS 'JSONB array of variant objects, each with key, name, and config';
COMMENT ON COLUMN experiments.config IS 'JSONB object for experiment-level configuration (sample size, duration, etc.)';

-- ============================================================
-- Table 2: experiment_assignments
-- ============================================================
CREATE TABLE IF NOT EXISTS experiment_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES experiments(id),
  venture_id UUID NOT NULL,
  variant_key TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(experiment_id, venture_id)
);

COMMENT ON TABLE experiment_assignments IS 'Maps ventures to experiment variants - one assignment per venture per experiment';

-- ============================================================
-- Table 3: experiment_outcomes
-- ============================================================
CREATE TABLE IF NOT EXISTS experiment_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES experiment_assignments(id),
  variant_key TEXT NOT NULL,
  scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE experiment_outcomes IS 'Recorded outcome scores for each experiment assignment evaluation';

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_exp_assignments_experiment_id ON experiment_assignments(experiment_id);
CREATE INDEX IF NOT EXISTS idx_exp_assignments_venture_id ON experiment_assignments(venture_id);
CREATE INDEX IF NOT EXISTS idx_exp_outcomes_assignment_id ON experiment_outcomes(assignment_id);
CREATE INDEX IF NOT EXISTS idx_experiments_status ON experiments(status);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_outcomes ENABLE ROW LEVEL SECURITY;

-- Service role bypass policies (full access for service_role)
CREATE POLICY service_role_experiments ON experiments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_experiment_assignments ON experiment_assignments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_experiment_outcomes ON experiment_outcomes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Rollback SQL (if needed):
-- DROP POLICY IF EXISTS service_role_experiment_outcomes ON experiment_outcomes;
-- DROP POLICY IF EXISTS service_role_experiment_assignments ON experiment_assignments;
-- DROP POLICY IF EXISTS service_role_experiments ON experiments;
-- DROP TABLE IF EXISTS experiment_outcomes;
-- DROP TABLE IF EXISTS experiment_assignments;
-- DROP TABLE IF EXISTS experiments;
