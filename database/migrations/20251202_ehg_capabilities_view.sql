-- Migration: Create ehg_capabilities VIEW
-- SD: SD-EHG-CAPABILITIES-001
-- Purpose: Unified view aggregating CrewAI agents, tools, and crews for capability discovery
-- Date: 2025-12-02

-- Drop existing view if exists
DROP VIEW IF EXISTS ehg_capabilities;

-- Create unified capabilities view
CREATE OR REPLACE VIEW ehg_capabilities AS
-- CrewAI Agents
SELECT
    id::text AS capability_id,
    agent_key AS capability_key,
    name AS capability_name,
    'agent' AS capability_type,
    COALESCE(role, 'N/A') AS capability_role,
    COALESCE(goal, backstory, 'No description available') AS description,
    status,
    tools AS implementation_tools,
    llm_model AS implementation_model,
    compatible_stages,
    created_at,
    updated_at
FROM crewai_agents
WHERE status = 'active'

UNION ALL

-- Agent Tools
SELECT
    id::text AS capability_id,
    tool_name AS capability_key,
    tool_name AS capability_name,
    'tool' AS capability_type,
    tool_type AS capability_role,
    COALESCE(description, 'No description available') AS description,
    status,
    NULL::text[] AS implementation_tools,
    NULL AS implementation_model,
    NULL::text[] AS compatible_stages,
    created_at,
    updated_at
FROM agent_tools
WHERE status = 'active'

UNION ALL

-- CrewAI Crews
SELECT
    id::text AS capability_id,
    crew_key AS capability_key,
    crew_name AS capability_name,
    'crew' AS capability_type,
    process_type AS capability_role,
    COALESCE(description, 'No description available') AS description,
    status,
    NULL::text[] AS implementation_tools,
    manager_llm AS implementation_model,
    compatible_stages,
    created_at,
    updated_at
FROM crewai_crews
WHERE status = 'active';

-- Add comment to the view
COMMENT ON VIEW ehg_capabilities IS 'Unified view of all EHG platform capabilities including CrewAI agents, tools, and crews. Used by Blueprint Generation for capability discovery.';

-- Create index on source tables if not exists (for better VIEW performance)
CREATE INDEX IF NOT EXISTS idx_crewai_agents_status ON crewai_agents(status);
CREATE INDEX IF NOT EXISTS idx_agent_tools_status ON agent_tools(status);
CREATE INDEX IF NOT EXISTS idx_crewai_crews_status ON crewai_crews(status);

-- Verify the VIEW works
-- SELECT capability_type, COUNT(*) FROM ehg_capabilities GROUP BY capability_type;
