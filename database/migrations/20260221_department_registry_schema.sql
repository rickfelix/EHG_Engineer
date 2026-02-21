-- SD-LEO-ORCH-EHG-ORGANIZATIONAL-STRUCTURE-001-A: Department Registry Schema
-- Creates the foundational department-based organizational structure for EHG.
--
-- Tables Created:
--   1. departments - Department registry with LTREE hierarchy
--   2. department_agents - Junction table mapping agents to departments
--
-- Dependencies:
--   - LTREE extension (already enabled via agent_registry migration)
--   - agent_registry table (FK reference)

-- ============================================================================
-- STEP 1: Create departments table
-- ============================================================================

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  hierarchy_path LTREE NOT NULL,
  description TEXT,
  parent_department_id UUID REFERENCES departments(id) ON DELETE RESTRICT,
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at on modification
CREATE OR REPLACE FUNCTION update_departments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_departments_updated_at
  BEFORE UPDATE ON departments
  FOR EACH ROW
  EXECUTE FUNCTION update_departments_updated_at();

-- ============================================================================
-- STEP 2: Create department_agents junction table
-- ============================================================================

CREATE TABLE IF NOT EXISTS department_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agent_registry(id) ON DELETE CASCADE,
  role_in_department TEXT NOT NULL DEFAULT 'member'
    CHECK (role_in_department IN ('lead', 'member', 'advisor')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

-- Prevent duplicate agent-department assignments
CREATE UNIQUE INDEX IF NOT EXISTS idx_department_agents_unique
  ON department_agents(department_id, agent_id);

-- ============================================================================
-- STEP 3: Create indexes
-- ============================================================================

-- GiST index for LTREE hierarchy queries
CREATE INDEX IF NOT EXISTS idx_departments_hierarchy_path
  ON departments USING gist(hierarchy_path);

-- B-tree index on parent for tree traversal
CREATE INDEX IF NOT EXISTS idx_departments_parent
  ON departments(parent_department_id);

-- Index for looking up departments by agent
CREATE INDEX IF NOT EXISTS idx_department_agents_agent
  ON department_agents(agent_id);

-- ============================================================================
-- STEP 4: Enable RLS
-- ============================================================================

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE department_agents ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all departments
CREATE POLICY departments_select_authenticated ON departments
  FOR SELECT TO authenticated
  USING (true);

-- Service role has full access to departments
CREATE POLICY departments_all_service ON departments
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can read department_agents
CREATE POLICY department_agents_select_authenticated ON department_agents
  FOR SELECT TO authenticated
  USING (true);

-- Service role has full access to department_agents
CREATE POLICY department_agents_all_service ON department_agents
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- STEP 5: Seed initial departments
-- ============================================================================

INSERT INTO departments (name, slug, hierarchy_path, description)
VALUES
  ('Engineering', 'engineering', 'engineering', 'Software engineering, infrastructure, and technical operations'),
  ('Marketing', 'marketing', 'marketing', 'Brand strategy, content creation, and market analysis'),
  ('Finance', 'finance', 'finance', 'Financial planning, accounting, and budget management'),
  ('Operations', 'operations', 'operations', 'Business operations, HR, and organizational management')
ON CONFLICT (slug) DO NOTHING;
