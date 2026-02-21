-- SD-LEO-ORCH-EHG-ORGANIZATIONAL-STRUCTURE-001-B: Department-Agent Mapping and Message Routing
-- Builds on departments and department_agents tables from Child A.
--
-- Creates:
--   1. assign_agent_to_department() function
--   2. remove_agent_from_department() function
--   3. get_department_agents() function
--   4. v_department_membership view
--   5. department_messages table
--   6. send_department_message() function

-- ============================================================================
-- STEP 1: Agent-Department Assignment Functions
-- ============================================================================

-- Assign an agent to a department (upsert on conflict updates role)
CREATE OR REPLACE FUNCTION assign_agent_to_department(
  p_agent_id UUID,
  p_department_id UUID,
  p_role TEXT DEFAULT 'member'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO department_agents (agent_id, department_id, role_in_department)
  VALUES (p_agent_id, p_department_id, p_role)
  ON CONFLICT (department_id, agent_id)
  DO UPDATE SET role_in_department = p_role, assigned_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Remove an agent from a department
CREATE OR REPLACE FUNCTION remove_agent_from_department(
  p_agent_id UUID,
  p_department_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted BOOLEAN;
BEGIN
  DELETE FROM department_agents
  WHERE agent_id = p_agent_id AND department_id = p_department_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

-- Get all agents in a department with their roles
CREATE OR REPLACE FUNCTION get_department_agents(p_department_id UUID)
RETURNS TABLE (
  agent_id UUID,
  display_name VARCHAR(255),
  agent_type VARCHAR(50),
  role_in_department TEXT,
  assigned_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    ar.id AS agent_id,
    ar.display_name,
    ar.agent_type,
    da.role_in_department,
    da.assigned_at
  FROM department_agents da
  JOIN agent_registry ar ON ar.id = da.agent_id
  WHERE da.department_id = p_department_id
  ORDER BY da.role_in_department, ar.display_name;
$$;

-- ============================================================================
-- STEP 2: Department Membership View
-- ============================================================================

CREATE OR REPLACE VIEW v_department_membership AS
SELECT
  d.id AS department_id,
  d.name AS department_name,
  d.slug AS department_slug,
  d.hierarchy_path,
  da.agent_id,
  ar.display_name AS agent_name,
  ar.agent_type,
  da.role_in_department,
  da.assigned_at
FROM departments d
JOIN department_agents da ON da.department_id = d.id
JOIN agent_registry ar ON ar.id = da.agent_id
WHERE d.is_active = true;

-- ============================================================================
-- STEP 3: Department Messages Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS department_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  sender_agent_id UUID NOT NULL REFERENCES agent_registry(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying messages by department
CREATE INDEX IF NOT EXISTS idx_department_messages_dept
  ON department_messages(department_id, created_at DESC);

-- Index for querying messages by sender
CREATE INDEX IF NOT EXISTS idx_department_messages_sender
  ON department_messages(sender_agent_id);

-- ============================================================================
-- STEP 4: RLS for department_messages
-- ============================================================================

ALTER TABLE department_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY department_messages_select_authenticated ON department_messages
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY department_messages_all_service ON department_messages
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- STEP 5: Send Department Message Function
-- ============================================================================

CREATE OR REPLACE FUNCTION send_department_message(
  p_department_id UUID,
  p_sender_id UUID,
  p_content TEXT,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_message_id UUID;
BEGIN
  INSERT INTO department_messages (department_id, sender_agent_id, content, metadata)
  VALUES (p_department_id, p_sender_id, p_content, p_metadata)
  RETURNING id INTO v_message_id;

  RETURN v_message_id;
END;
$$;
