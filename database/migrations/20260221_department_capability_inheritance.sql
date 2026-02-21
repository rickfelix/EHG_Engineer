-- SD-LEO-ORCH-EHG-ORGANIZATIONAL-STRUCTURE-001-C: Department Capability Inheritance
-- Builds on departments, department_agents tables from Child A.
--
-- Creates:
--   1. department_capabilities table
--   2. add_department_capability() function
--   3. remove_department_capability() function
--   4. get_effective_capabilities() function (LTREE hierarchy traversal)
--   5. v_agent_effective_capabilities view

-- ============================================================================
-- STEP 1: Create department_capabilities table
-- ============================================================================

CREATE TABLE IF NOT EXISTS department_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  capability_name TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_department_capability UNIQUE (department_id, capability_name)
);

-- Index for looking up capabilities by name
CREATE INDEX IF NOT EXISTS idx_department_capabilities_name
  ON department_capabilities(capability_name);

-- ============================================================================
-- STEP 2: RLS for department_capabilities
-- ============================================================================

ALTER TABLE department_capabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY department_capabilities_select_authenticated ON department_capabilities
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY department_capabilities_all_service ON department_capabilities
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- STEP 3: Add capability to a department (upsert)
-- ============================================================================

CREATE OR REPLACE FUNCTION add_department_capability(
  p_department_id UUID,
  p_capability_name TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO department_capabilities (department_id, capability_name, description)
  VALUES (p_department_id, p_capability_name, p_description)
  ON CONFLICT ON CONSTRAINT uq_department_capability
  DO UPDATE SET description = COALESCE(p_description, department_capabilities.description)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ============================================================================
-- STEP 4: Remove capability from a department
-- ============================================================================

CREATE OR REPLACE FUNCTION remove_department_capability(
  p_department_id UUID,
  p_capability_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
BEGIN
  DELETE FROM department_capabilities
  WHERE department_id = p_department_id AND capability_name = p_capability_name;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

-- ============================================================================
-- STEP 5: Get effective capabilities for an agent (LTREE hierarchy traversal)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_effective_capabilities(p_agent_id UUID)
RETURNS TABLE (
  capability_name TEXT,
  source_department_id UUID,
  source_department_name TEXT,
  inheritance_type TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH agent_departments AS (
    -- Get all departments this agent belongs to
    SELECT d.id AS department_id, d.name, d.hierarchy_path
    FROM department_agents da
    JOIN departments d ON d.id = da.department_id
    WHERE da.agent_id = p_agent_id
      AND d.is_active = true
  ),
  ancestor_departments AS (
    -- For each agent department, find all ancestor departments via LTREE
    SELECT DISTINCT
      anc.id AS department_id,
      anc.name,
      anc.hierarchy_path,
      ad.department_id AS origin_department_id
    FROM agent_departments ad
    JOIN departments anc ON ad.hierarchy_path <@ anc.hierarchy_path
    WHERE anc.is_active = true
      AND anc.id != ad.department_id
  ),
  direct_capabilities AS (
    -- Capabilities from departments the agent directly belongs to
    SELECT
      dc.capability_name,
      dc.department_id AS source_department_id,
      ad.name AS source_department_name,
      'direct'::TEXT AS inheritance_type
    FROM agent_departments ad
    JOIN department_capabilities dc ON dc.department_id = ad.department_id
  ),
  inherited_capabilities AS (
    -- Capabilities inherited from ancestor departments
    SELECT
      dc.capability_name,
      dc.department_id AS source_department_id,
      anc.name AS source_department_name,
      'inherited'::TEXT AS inheritance_type
    FROM ancestor_departments anc
    JOIN department_capabilities dc ON dc.department_id = anc.department_id
    WHERE dc.capability_name NOT IN (
      SELECT dcap.capability_name FROM direct_capabilities dcap
    )
  )
  SELECT * FROM direct_capabilities
  UNION ALL
  SELECT * FROM inherited_capabilities
  ORDER BY inheritance_type, capability_name;
$$;

-- ============================================================================
-- STEP 6: Agent effective capabilities view
-- ============================================================================

CREATE OR REPLACE VIEW v_agent_effective_capabilities AS
SELECT
  ar.id AS agent_id,
  ar.display_name AS agent_name,
  ec.capability_name,
  ec.source_department_id,
  ec.source_department_name,
  ec.inheritance_type
FROM agent_registry ar
CROSS JOIN LATERAL get_effective_capabilities(ar.id) ec;
