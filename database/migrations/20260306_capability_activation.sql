-- Migration: Capability Infrastructure Activation
-- SD: SD-LEO-INFRA-CAPABILITY-ACTIVATION-001
-- FR-002: Add taxonomy_domain column to sd_capabilities
-- FR-003: Add sd_capabilities as 4th source to v_unified_capabilities

-- FR-002: Add taxonomy_domain column
ALTER TABLE sd_capabilities ADD COLUMN IF NOT EXISTS taxonomy_domain TEXT;

-- FR-003: Recreate v_unified_capabilities with sd_capabilities as 4th source
CREATE OR REPLACE VIEW v_unified_capabilities AS
-- Source 1: venture_capabilities
SELECT venture_capabilities.id::text AS id,
    venture_capabilities.name,
    venture_capabilities.capability_type,
    'venture'::text AS capability_source,
    venture_capabilities.reusability_score AS relevance_score,
    venture_capabilities.maturity_level,
    venture_capabilities.origin_venture_id::text AS source_id,
    venture_capabilities.origin_sd_key AS source_key
FROM venture_capabilities
UNION ALL
-- Source 2: agent_skills
SELECT agent_skills.id::text AS id,
    agent_skills.name,
    COALESCE(agent_skills.category_scope ->> 'primary'::text, 'agent_skill'::text) AS capability_type,
    'agent_skill'::text AS capability_source,
    5 AS relevance_score,
    'production'::text AS maturity_level,
    NULL::text AS source_id,
    NULL::text AS source_key
FROM agent_skills
WHERE agent_skills.active = true
UNION ALL
-- Source 3: agent_registry
SELECT agent_registry.id::text AS id,
    unnest(agent_registry.capabilities) AS name,
    'agent_capability'::text AS capability_type,
    'agent_registry'::text AS capability_source,
    5 AS relevance_score,
    'production'::text AS maturity_level,
    NULL::text AS source_id,
    agent_registry.agent_type AS source_key
FROM agent_registry
WHERE agent_registry.status::text = 'active'::text
UNION ALL
-- Source 4: sd_capabilities (142 rows of SD-delivered capabilities)
SELECT sd_capabilities.id::text AS id,
    COALESCE(sd_capabilities.name, sd_capabilities.capability_key) AS name,
    sd_capabilities.capability_type,
    'sd_capability'::text AS capability_source,
    COALESCE(sd_capabilities.extraction_score, 5) AS relevance_score,
    CASE
        WHEN sd_capabilities.maturity_score >= 8 THEN 'production'
        WHEN sd_capabilities.maturity_score >= 5 THEN 'beta'
        ELSE 'experimental'
    END AS maturity_level,
    sd_capabilities.sd_uuid::text AS source_id,
    sd_capabilities.sd_id AS source_key
FROM sd_capabilities;
