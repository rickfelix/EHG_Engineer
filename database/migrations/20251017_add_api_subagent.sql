-- Migration: Add API Sub-Agent
-- Created: 2025-10-17
-- Purpose: Add API Architecture sub-agent for REST/GraphQL endpoint review
--
-- Features:
-- - API design quality assessment
-- - Performance evaluation (pagination, caching)
-- - Security review (auth, validation, rate limiting)
-- - Documentation completeness (OpenAPI/Swagger)
--
-- Triggers on keywords: API, REST, GraphQL, endpoint, route, controller, middleware

BEGIN;

-- ============================================================================
-- Add API Sub-Agent to leo_sub_agents table
-- ============================================================================

INSERT INTO leo_sub_agents (id, name, code, description, activation_type, priority, active)
VALUES (
  'api-sub',
  'API Architecture Sub-Agent',
  'API',
  'Handles REST/GraphQL endpoint design, API architecture, versioning, and documentation. Evaluates design quality, performance, security, and documentation completeness.',
  'automatic',
  75,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  description = EXCLUDED.description,
  activation_type = EXCLUDED.activation_type,
  priority = EXCLUDED.priority,
  active = EXCLUDED.active;

COMMENT ON TABLE leo_sub_agents IS 'Registry of all LEO Protocol sub-agents with their configurations and priorities';

-- ============================================================================
-- Add API Sub-Agent Triggers
-- ============================================================================

INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, trigger_context, priority)
VALUES
  -- Primary keywords (high confidence)
  ('api-sub', 'API', 'keyword', 'PRD', 75),
  ('api-sub', 'REST', 'keyword', 'PRD', 80),
  ('api-sub', 'RESTful', 'keyword', 'PRD', 80),
  ('api-sub', 'GraphQL', 'keyword', 'PRD', 80),
  ('api-sub', 'endpoint', 'keyword', 'PRD', 75),
  ('api-sub', 'route', 'keyword', 'PRD', 70),
  ('api-sub', 'controller', 'keyword', 'PRD', 75),
  ('api-sub', 'middleware', 'keyword', 'PRD', 70),

  -- Secondary keywords (compound matching)
  ('api-sub', 'request', 'keyword', 'PRD', 60),
  ('api-sub', 'response', 'keyword', 'PRD', 60),
  ('api-sub', 'payload', 'keyword', 'PRD', 65),
  ('api-sub', 'status code', 'pattern', 'PRD', 65),
  ('api-sub', 'HTTP method', 'pattern', 'PRD', 70),

  -- API-specific patterns
  ('api-sub', 'OpenAPI', 'keyword', 'PRD', 70),
  ('api-sub', 'Swagger', 'keyword', 'PRD', 70),
  ('api-sub', 'versioning', 'keyword', 'PRD', 65),
  ('api-sub', 'pagination', 'keyword', 'PRD', 60)
ON CONFLICT (sub_agent_id, trigger_phrase, trigger_context) DO UPDATE SET
  trigger_type = EXCLUDED.trigger_type,
  priority = EXCLUDED.priority;

COMMENT ON TABLE leo_sub_agent_triggers IS 'Keyword and pattern triggers that activate specific sub-agents based on SD/PRD content';

-- ============================================================================
-- Add API to Phase Sub-Agent Mapping
-- ============================================================================

-- Note: The PHASE_SUBAGENT_MAP in orchestrate-phase-subagents.js should be updated to include API in PLAN_VERIFY phase
-- This migration only handles the database side

COMMENT ON COLUMN leo_sub_agents.priority IS 'Priority score (0-100). Higher priority agents execute first. 90+ = CRITICAL, 70-89 = HIGH, 50-69 = MEDIUM, <50 = LOW';
COMMENT ON COLUMN leo_sub_agents.activation_type IS 'Activation mode: automatic (keyword-triggered), conditional (phase + keyword), manual (explicit invocation only)';

-- ============================================================================
-- Verification Query
-- ============================================================================

-- Verify API sub-agent was added
DO $$
DECLARE
  api_agent_count INTEGER;
  api_trigger_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO api_agent_count FROM leo_sub_agents WHERE code = 'API';
  SELECT COUNT(*) INTO api_trigger_count FROM leo_sub_agent_triggers WHERE sub_agent_id = 'api-sub';

  IF api_agent_count = 0 THEN
    RAISE EXCEPTION 'API sub-agent was not inserted correctly';
  END IF;

  IF api_trigger_count < 5 THEN
    RAISE WARNING 'API sub-agent has fewer triggers than expected (expected >= 5, got %)', api_trigger_count;
  END IF;

  RAISE NOTICE 'API sub-agent migration completed successfully';
  RAISE NOTICE '  - API agent registered: %', api_agent_count;
  RAISE NOTICE '  - API triggers configured: %', api_trigger_count;
END $$;

COMMIT;

-- ============================================================================
-- Post-Migration Notes
-- ============================================================================

-- MANUAL STEPS REQUIRED:
--
-- 1. Update orchestrate-phase-subagents.js to include API in phase mappings:
--
--    const PHASE_SUBAGENT_MAP = {
--      LEAD_PRE_APPROVAL: ['VALIDATION', 'DATABASE', 'SECURITY', 'DESIGN', 'RISK'],
--      PLAN_PRD: ['DATABASE', 'STORIES', 'RISK'],
--      EXEC_IMPL: [],
--      PLAN_VERIFY: ['TESTING', 'GITHUB', 'DATABASE', 'SECURITY', 'PERFORMANCE', 'DESIGN', 'API'],  // ← ADD API
--      LEAD_FINAL: ['RETRO']
--    };
--
-- 2. Verify API agent file exists:
--    - .claude/agents/api-agent.md
--    - lib/sub-agents/api.js
--
-- 3. Test API agent triggering:
--    node lib/sub-agent-executor.js API <SD-ID-WITH-API-KEYWORDS>
--
-- 4. Test orchestration:
--    node scripts/orchestrate-phase-subagents.js PLAN_VERIFY <SD-ID-WITH-API-KEYWORDS>
