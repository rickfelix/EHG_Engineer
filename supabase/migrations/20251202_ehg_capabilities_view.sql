-- Migration: EHG Capabilities VIEW
-- SD: SD-EHG-CAPABILITIES-001
-- Date: 2025-12-02
-- Purpose: Create unified VIEW aggregating crewai_agents, agent_tools, and crewai_crews
-- Following patterns from existing database VIEWs and schema-design skill guidance

-- ============================================================================
-- PHASE 1: Create ehg_capabilities VIEW
-- ============================================================================

-- Drop existing VIEW if it exists (safe re-run)
DROP VIEW IF EXISTS ehg_capabilities;

-- Create unified capabilities VIEW
CREATE VIEW ehg_capabilities AS
-- Agents
SELECT
    id::text AS id,
    agent_key AS capability_key,
    name,
    'agent'::text AS capability_type,
    COALESCE(goal, role, '') AS description,
    NULL::text AS implementation_path,
    status,
    created_at,
    updated_at,
    jsonb_build_object(
        'role', role,
        'goal', goal,
        'backstory', backstory,
        'department_id', department_id,
        'tools', tools,
        'llm_model', llm_model,
        'compatible_stages', compatible_stages,
        'success_rate', success_rate,
        'execution_count', execution_count
    ) AS metadata
FROM crewai_agents
WHERE agent_key IS NOT NULL

UNION ALL

-- Tools
SELECT
    id::text AS id,
    tool_name AS capability_key,
    tool_name AS name,
    'tool'::text AS capability_type,
    COALESCE(description, '') AS description,
    tool_class AS implementation_path,
    status,
    created_at,
    updated_at,
    jsonb_build_object(
        'tool_type', tool_type,
        'configuration', configuration,
        'parameters_schema', parameters_schema,
        'requires_auth', requires_auth,
        'rate_limit_per_minute', rate_limit_per_minute,
        'usage_count', usage_count,
        'cost_per_use_usd', cost_per_use_usd
    ) AS metadata
FROM agent_tools
WHERE tool_name IS NOT NULL

UNION ALL

-- Crews
SELECT
    id::text AS id,
    COALESCE(crew_key, crew_name) AS capability_key,
    crew_name AS name,
    'crew'::text AS capability_type,
    COALESCE(description, '') AS description,
    config_file_path AS implementation_path,
    status,
    created_at,
    updated_at,
    jsonb_build_object(
        'process_type', process_type,
        'manager_agent_id', manager_agent_id,
        'verbose', verbose,
        'memory_enabled', memory_enabled,
        'planning_enabled', planning_enabled,
        'compatible_stages', compatible_stages,
        'max_cost_usd', max_cost_usd
    ) AS metadata
FROM crewai_crews
WHERE crew_name IS NOT NULL;

-- ============================================================================
-- PHASE 2: Add comments for documentation
-- ============================================================================

COMMENT ON VIEW ehg_capabilities IS
'Unified view of all EHG capabilities including agents, tools, and crews.
Part of SD-EHG-CAPABILITIES-001. Used by CapabilitiesBrowser UI.';

-- ============================================================================
-- PHASE 3: Grant permissions (VIEW inherits from underlying tables)
-- ============================================================================

-- Grant SELECT to authenticated users
GRANT SELECT ON ehg_capabilities TO authenticated;

-- Grant SELECT to service role
GRANT SELECT ON ehg_capabilities TO service_role;

-- ============================================================================
-- Verification Query (run after migration)
-- ============================================================================
-- SELECT capability_type, COUNT(*) as count FROM ehg_capabilities GROUP BY capability_type;
