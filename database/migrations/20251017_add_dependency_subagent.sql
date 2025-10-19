-- Migration: Add DEPENDENCY Sub-Agent
-- Created: 2025-10-17
-- Purpose: Add Dependency Management sub-agent for npm/package security and health review
--
-- Features:
-- - Security vulnerability scanning (CVE detection, npm audit)
-- - Outdated package detection
-- - Version conflict resolution
-- - Supply chain security assessment
--
-- Triggers on keywords: dependency, npm, package, vulnerability, CVE, upgrade, update

BEGIN;

-- ============================================================================
-- Add DEPENDENCY Sub-Agent to leo_sub_agents table
-- ============================================================================

INSERT INTO leo_sub_agents (id, name, code, description, activation_type, priority, active)
VALUES (
  'dependency-sub',
  'Dependency Management Sub-Agent',
  'DEPENDENCY',
  'Handles npm/package updates, security vulnerabilities (CVE), dependency conflicts, and version management. Evaluates security, maintenance, compatibility, and performance.',
  'automatic',
  70,
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
-- Add DEPENDENCY Sub-Agent Triggers
-- ============================================================================

INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, trigger_context, priority)
VALUES
  -- Primary keywords (high confidence)
  ('dependency-sub', 'dependency', 'keyword', 'PRD', 70),
  ('dependency-sub', 'dependencies', 'keyword', 'PRD', 70),
  ('dependency-sub', 'npm', 'keyword', 'PRD', 75),
  ('dependency-sub', 'yarn', 'keyword', 'PRD', 70),
  ('dependency-sub', 'pnpm', 'keyword', 'PRD', 65),
  ('dependency-sub', 'package', 'keyword', 'PRD', 65),
  ('dependency-sub', 'package.json', 'keyword', 'PRD', 80),
  ('dependency-sub', 'vulnerability', 'keyword', 'PRD', 85),
  ('dependency-sub', 'CVE', 'keyword', 'PRD', 90),
  ('dependency-sub', 'security advisory', 'pattern', 'PRD', 85),
  ('dependency-sub', 'outdated', 'keyword', 'PRD', 70),

  -- Secondary keywords (compound matching)
  ('dependency-sub', 'install', 'keyword', 'PRD', 50),
  ('dependency-sub', 'update', 'keyword', 'PRD', 60),
  ('dependency-sub', 'upgrade', 'keyword', 'PRD', 65),
  ('dependency-sub', 'version', 'keyword', 'PRD', 50),
  ('dependency-sub', 'semver', 'keyword', 'PRD', 60),
  ('dependency-sub', 'node_modules', 'keyword', 'PRD', 65),
  ('dependency-sub', 'patch', 'keyword', 'PRD', 55),

  -- Security-specific
  ('dependency-sub', 'CVSS', 'keyword', 'PRD', 85),
  ('dependency-sub', 'exploit', 'keyword', 'PRD', 80),
  ('dependency-sub', 'Snyk', 'keyword', 'PRD', 70),
  ('dependency-sub', 'Dependabot', 'keyword', 'PRD', 70)
ON CONFLICT (sub_agent_id, trigger_phrase, trigger_context) DO UPDATE SET
  trigger_type = EXCLUDED.trigger_type,
  priority = EXCLUDED.priority;

COMMENT ON TABLE leo_sub_agent_triggers IS 'Keyword and pattern triggers that activate specific sub-agents based on SD/PRD content';

-- ============================================================================
-- Add Comments for Priority Levels
-- ============================================================================

COMMENT ON COLUMN leo_sub_agents.priority IS 'Priority score (0-100). Higher priority agents execute first. 90+ = CRITICAL, 70-89 = HIGH, 50-69 = MEDIUM, <50 = LOW';
COMMENT ON COLUMN leo_sub_agents.activation_type IS 'Activation mode: automatic (keyword-triggered), conditional (phase + keyword), manual (explicit invocation only)';

-- ============================================================================
-- Verification Query
-- ============================================================================

-- Verify DEPENDENCY sub-agent was added
DO $$
DECLARE
  dependency_agent_count INTEGER;
  dependency_trigger_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO dependency_agent_count FROM leo_sub_agents WHERE code = 'DEPENDENCY';
  SELECT COUNT(*) INTO dependency_trigger_count FROM leo_sub_agent_triggers WHERE sub_agent_id = 'dependency-sub';

  IF dependency_agent_count = 0 THEN
    RAISE EXCEPTION 'DEPENDENCY sub-agent was not inserted correctly';
  END IF;

  IF dependency_trigger_count < 10 THEN
    RAISE WARNING 'DEPENDENCY sub-agent has fewer triggers than expected (expected >= 10, got %)', dependency_trigger_count;
  END IF;

  RAISE NOTICE 'DEPENDENCY sub-agent migration completed successfully';
  RAISE NOTICE '  - DEPENDENCY agent registered: %', dependency_agent_count;
  RAISE NOTICE '  - DEPENDENCY triggers configured: %', dependency_trigger_count;
END $$;

COMMIT;

-- ============================================================================
-- Post-Migration Notes
-- ============================================================================

-- MANUAL STEPS COMPLETED:
--
-- 1. ✅ orchestrate-phase-subagents.js already includes DEPENDENCY in PLAN_VERIFY phase:
--
--    const PHASE_SUBAGENT_MAP = {
--      LEAD_PRE_APPROVAL: ['VALIDATION', 'DATABASE', 'SECURITY', 'DESIGN', 'RISK'],
--      PLAN_PRD: ['DATABASE', 'STORIES', 'RISK'],
--      EXEC_IMPL: [],
--      PLAN_VERIFY: ['TESTING', 'GITHUB', 'DATABASE', 'SECURITY', 'PERFORMANCE', 'DESIGN', 'API', 'DEPENDENCY'],
--      LEAD_FINAL: ['RETRO']
--    };
--
-- 2. ✅ DEPENDENCY agent files created:
--    - .claude/agents/dependency-agent.md
--    - lib/sub-agents/dependency.js
--
-- NEXT STEPS:
--
-- 1. Test DEPENDENCY agent triggering:
--    node lib/sub-agent-executor.js DEPENDENCY <SD-ID-WITH-DEPENDENCY-KEYWORDS>
--
-- 2. Test orchestration:
--    node scripts/orchestrate-phase-subagents.js PLAN_VERIFY <SD-ID-WITH-DEPENDENCY-KEYWORDS>
--
-- 3. Test npm audit integration:
--    - Create test SD with "upgrade npm packages" in scope
--    - Run DEPENDENCY agent
--    - Verify CVE detection and scoring
--
-- 4. Add to context-aware selector keywords (Phase 2.3):
--    - lib/context-aware-sub-agent-selector.js
