-- SD-LEO-FIX-ORG-STRUCTURE-CLI-001: Agent-Centric Department View
-- Reverse of v_department_membership (department-centric).
--
-- v_department_membership answers: "Who is in this department?"
-- v_agent_departments answers: "Which departments does this agent belong to?"
--
-- Dependencies:
--   - departments table (from 20260221_department_registry_schema.sql)
--   - department_agents table (from 20260221_department_registry_schema.sql)
--   - agent_registry table (pre-existing)
--
-- RLS: Inherited from underlying tables. No view-level policies needed.
-- Indexes: All required indexes already exist (idx_department_agents_agent, PKs).

CREATE OR REPLACE VIEW v_agent_departments AS
SELECT
  ar.id AS agent_id,
  ar.display_name AS agent_name,
  ar.agent_type,
  ar.status AS agent_status,
  d.id AS department_id,
  d.name AS department_name,
  d.slug AS department_slug,
  d.hierarchy_path,
  d.parent_department_id,
  da.role_in_department,
  da.assigned_at,
  (
    SELECT COUNT(*)
    FROM department_agents da2
    JOIN departments d2 ON d2.id = da2.department_id AND d2.is_active = true
    WHERE da2.agent_id = ar.id
  ) AS department_count
FROM agent_registry ar
JOIN department_agents da ON da.agent_id = ar.id
JOIN departments d ON d.id = da.department_id
WHERE d.is_active = true
  AND ar.status = 'active'
ORDER BY ar.display_name, d.name;

COMMENT ON VIEW v_agent_departments IS
  'Agent-centric view of department memberships. Reverse of v_department_membership. '
  'Shows which departments each active agent belongs to, with role and assignment metadata. '
  'SD-LEO-FIX-ORG-STRUCTURE-CLI-001.';

-- Rollback:
-- DROP VIEW IF EXISTS v_agent_departments;
