-- Migration: Create venture_dependencies table
-- SD: SD-EVA-FEAT-DEPENDENCY-MANAGER-001
-- Architecture Decision #32: Inter-Venture Dependencies
--
-- Stores directed dependency edges between ventures,
-- enabling cycle detection and stage-transition blocking.

-- Create the table
CREATE TABLE IF NOT EXISTS venture_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dependent_venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  provider_venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  required_stage INT NOT NULL CHECK (required_stage BETWEEN 1 AND 25),
  dependency_type TEXT NOT NULL DEFAULT 'hard' CHECK (dependency_type IN ('hard', 'soft')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,

  -- Prevent duplicate dependency edges
  CONSTRAINT uq_venture_dependency UNIQUE (dependent_venture_id, provider_venture_id, required_stage),

  -- Prevent self-dependency
  CONSTRAINT no_self_dependency CHECK (dependent_venture_id != provider_venture_id)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_venture_deps_dependent ON venture_dependencies(dependent_venture_id);
CREATE INDEX IF NOT EXISTS idx_venture_deps_provider ON venture_dependencies(provider_venture_id);
CREATE INDEX IF NOT EXISTS idx_venture_deps_status ON venture_dependencies(status) WHERE status = 'pending';

-- RLS policies
ALTER TABLE venture_dependencies ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "service_role_full_access" ON venture_dependencies
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read
CREATE POLICY "authenticated_read" ON venture_dependencies
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE venture_dependencies IS 'Directed dependency graph between ventures for stage-transition blocking (Decision #32)';
COMMENT ON COLUMN venture_dependencies.dependent_venture_id IS 'Venture that depends on another (the one being blocked)';
COMMENT ON COLUMN venture_dependencies.provider_venture_id IS 'Venture that provides the dependency (must reach required_stage)';
COMMENT ON COLUMN venture_dependencies.required_stage IS 'Stage the provider must reach before dependent can proceed';
COMMENT ON COLUMN venture_dependencies.dependency_type IS 'hard = blocks transition, soft = warning only';
