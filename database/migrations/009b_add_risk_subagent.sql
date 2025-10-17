-- =====================================================
-- Add RISK Sub-Agent to leo_sub_agents Table
-- Part of BMAD Enhancement Implementation
-- =====================================================

-- Insert RISK sub-agent
INSERT INTO leo_sub_agents (
  code,
  name,
  description,
  activation_type,
  priority,
  active
) VALUES (
  'RISK',
  'Risk Assessment Sub-Agent',
  E'**BMAD Enhancement**: Multi-domain risk assessment for Strategic Directives.\n\n**Risk Domains Assessed**:\n1. Technical Complexity - Code complexity, refactoring needs, technical debt\n2. Security Risk - Auth, data exposure, RLS policies, vulnerabilities\n3. Performance Risk - Query optimization, caching, scaling concerns\n4. Integration Risk - Third-party APIs, service dependencies\n5. Data Migration Risk - Schema changes, data integrity, rollback complexity\n6. UI/UX Risk - Component complexity, accessibility, responsive design\n\n**Output**: Risk score (1-10 per domain), overall risk level (LOW/MEDIUM/HIGH/CRITICAL), critical issues, warnings, and mitigation recommendations.\n\n**Activation**: LEAD Pre-Approval (all SDs), PLAN PRD Creation (complex SDs)\n**Blocking**: HIGH or CRITICAL risk without mitigation plan',
  'automatic',
  8, -- Priority between DATABASE (6) and SECURITY (7), higher than VALIDATION (0)
  true
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  priority = EXCLUDED.priority,
  active = EXCLUDED.active;

-- Add triggers for RISK sub-agent
-- These define when RISK should auto-trigger based on content

-- Risk keywords (technical complexity)
INSERT INTO leo_sub_agent_triggers (
  sub_agent_id,
  trigger_type,
  trigger_phrase,
  trigger_context,
  priority
)
SELECT
  id,
  'keyword',
  unnest(ARRAY[
    'high risk', 'complex', 'refactor', 'migration', 'architecture',
    'sophisticated', 'advanced', 'overhaul', 'redesign', 'restructure'
  ]),
  'title,description',
  8
FROM leo_sub_agents WHERE code = 'RISK'
ON CONFLICT DO NOTHING;

-- Risk keywords (security)
INSERT INTO leo_sub_agent_triggers (
  sub_agent_id,
  trigger_type,
  trigger_phrase,
  trigger_context,
  priority
)
SELECT
  id,
  'keyword',
  unnest(ARRAY[
    'authentication', 'authorization', 'security', 'rls', 'permission',
    'access control', 'credential', 'encrypt', 'decrypt', 'sensitive'
  ]),
  'title,description',
  8
FROM leo_sub_agents WHERE code = 'RISK'
ON CONFLICT DO NOTHING;

-- Risk keywords (performance)
INSERT INTO leo_sub_agent_triggers (
  sub_agent_id,
  trigger_type,
  trigger_phrase,
  trigger_context,
  priority
)
SELECT
  id,
  'keyword',
  unnest(ARRAY[
    'performance', 'optimization', 'slow', 'latency', 'cache',
    'real-time', 'websocket', 'large dataset', 'bulk', 'scalability'
  ]),
  'title,description',
  8
FROM leo_sub_agents WHERE code = 'RISK'
ON CONFLICT DO NOTHING;

-- Risk keywords (integration)
INSERT INTO leo_sub_agent_triggers (
  sub_agent_id,
  trigger_type,
  trigger_phrase,
  trigger_context,
  priority
)
SELECT
  id,
  'keyword',
  unnest(ARRAY[
    'third-party', 'external', 'api', 'integration', 'webhook',
    'microservice', 'openai', 'stripe', 'twilio', 'aws'
  ]),
  'title,description',
  8
FROM leo_sub_agents WHERE code = 'RISK'
ON CONFLICT DO NOTHING;

-- Risk keywords (data migration)
INSERT INTO leo_sub_agent_triggers (
  sub_agent_id,
  trigger_type,
  trigger_phrase,
  trigger_context,
  priority
)
SELECT
  id,
  'keyword',
  unnest(ARRAY[
    'database', 'migration', 'schema', 'table', 'alter',
    'postgres', 'sql', 'create table', 'foreign key', 'constraint'
  ]),
  'title,description',
  8
FROM leo_sub_agents WHERE code = 'RISK'
ON CONFLICT DO NOTHING;

-- Risk keywords (UI/UX)
INSERT INTO leo_sub_agent_triggers (
  sub_agent_id,
  trigger_type,
  trigger_phrase,
  trigger_context,
  priority
)
SELECT
  id,
  'keyword',
  unnest(ARRAY[
    'ui', 'ux', 'design', 'component', 'interface',
    'dashboard', 'responsive', 'accessibility', 'a11y', 'mobile'
  ]),
  'title,description',
  8
FROM leo_sub_agents WHERE code = 'RISK'
ON CONFLICT DO NOTHING;

-- Phase triggers (using keyword type since phases are essentially keywords)
INSERT INTO leo_sub_agent_triggers (
  sub_agent_id,
  trigger_type,
  trigger_phrase,
  trigger_context,
  priority
)
SELECT
  id,
  'keyword',
  unnest(ARRAY[
    'LEAD_PRE_APPROVAL',
    'PLAN_PRD'
  ]),
  'phase',
  8
FROM leo_sub_agents WHERE code = 'RISK'
ON CONFLICT DO NOTHING;

-- Verification
DO $$
DECLARE
  risk_count INTEGER;
  trigger_count INTEGER;
BEGIN
  -- Check RISK sub-agent exists
  SELECT COUNT(*) INTO risk_count
  FROM leo_sub_agents
  WHERE code = 'RISK' AND active = true;

  -- Check triggers added
  SELECT COUNT(*) INTO trigger_count
  FROM leo_sub_agent_triggers t
  JOIN leo_sub_agents sa ON t.sub_agent_id = sa.id
  WHERE sa.code = 'RISK';

  IF risk_count = 1 THEN
    RAISE NOTICE '✅ RISK sub-agent added successfully';
  ELSE
    RAISE WARNING '⚠️ RISK sub-agent not found or not active';
  END IF;

  IF trigger_count > 0 THEN
    RAISE NOTICE '✅ % triggers added for RISK sub-agent', trigger_count;
  ELSE
    RAISE WARNING '⚠️ No triggers found for RISK sub-agent';
  END IF;
END $$;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- RISK sub-agent is now:
-- 1. Registered in leo_sub_agents table
-- 2. Configured with appropriate triggers
-- 3. Integrated with orchestrate-phase-subagents.js
-- 4. Ready for execution via lib/sub-agents/risk.js
-- =====================================================
