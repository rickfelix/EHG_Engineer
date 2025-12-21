-- Migration: Register Industrial Expansion Sub-Agents
-- Created: 2025-12-20
-- Purpose: Register 9 new sub-agents for Stages 7-25 industrialization
--
-- New Sub-Agents:
-- 1. PRICING    - Pricing model development (Stage 7)
-- 2. FINANCIAL  - Financial modeling & projections (Stages 7-9)
-- 3. MARKETING  - Go-to-market & campaigns (Stage 11)
-- 4. SALES      - Sales process & playbook (Stage 12)
-- 5. CRM        - Customer relationship management (Stage 12)
-- 6. ANALYTICS  - Analytics & metrics setup (Stage 24)
-- 7. MONITORING - Monitoring & alerting (Stages 22-25)
-- 8. LAUNCH     - Production launch orchestration (Stages 22-23)
-- 9. VALUATION  - Exit valuation modeling (Stages 9, 25)
--
-- SD: SD-INDUSTRIAL-2025-001 (Sovereign Industrial Expansion)

BEGIN;

-- ============================================================================
-- 1. PRICING SUB-AGENT
-- ============================================================================

INSERT INTO leo_sub_agents (id, name, code, description, activation_type, priority, script_path, active)
VALUES (
  'a1b2c3d4-1111-4111-8111-111111111111'::uuid,
  'Pricing Strategy Sub-Agent',
  'PRICING',
  'Handles pricing model development, unit economics, pricing tiers, sensitivity analysis, and competitive pricing research. Produces pricing_model artifacts.',
  'automatic',
  75,
  'lib/sub-agents/pricing.js',
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  description = EXCLUDED.description,
  script_path = EXCLUDED.script_path,
  active = EXCLUDED.active;

INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, trigger_context, priority)
VALUES
  ('a1b2c3d4-1111-4111-8111-111111111111'::uuid, 'pricing', 'keyword', 'PRD', 80),
  ('a1b2c3d4-1111-4111-8111-111111111111'::uuid, 'price point', 'pattern', 'PRD', 75),
  ('a1b2c3d4-1111-4111-8111-111111111111'::uuid, 'pricing strategy', 'pattern', 'PRD', 85),
  ('a1b2c3d4-1111-4111-8111-111111111111'::uuid, 'unit economics', 'pattern', 'PRD', 80),
  ('a1b2c3d4-1111-4111-8111-111111111111'::uuid, 'subscription', 'keyword', 'PRD', 70),
  ('a1b2c3d4-1111-4111-8111-111111111111'::uuid, 'freemium', 'keyword', 'PRD', 75),
  ('a1b2c3d4-1111-4111-8111-111111111111'::uuid, 'tiered pricing', 'pattern', 'PRD', 80),
  ('a1b2c3d4-1111-4111-8111-111111111111'::uuid, 'CAC', 'keyword', 'PRD', 70),
  ('a1b2c3d4-1111-4111-8111-111111111111'::uuid, 'LTV', 'keyword', 'PRD', 70),
  ('a1b2c3d4-1111-4111-8111-111111111111'::uuid, 'revenue model', 'pattern', 'PRD', 80)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 2. FINANCIAL SUB-AGENT
-- ============================================================================

INSERT INTO leo_sub_agents (id, name, code, description, activation_type, priority, script_path, active)
VALUES (
  'a1b2c3d4-2222-4222-8222-222222222222'::uuid,
  'Financial Modeling Sub-Agent',
  'FINANCIAL',
  'Handles financial projections, P&L modeling, cash flow analysis, business model canvas financial sections, and exit valuation inputs. Produces financial_projection artifacts.',
  'automatic',
  80,
  'lib/sub-agents/financial.js',
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  description = EXCLUDED.description,
  script_path = EXCLUDED.script_path,
  active = EXCLUDED.active;

INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, trigger_context, priority)
VALUES
  ('a1b2c3d4-2222-4222-8222-222222222222'::uuid, 'financial', 'keyword', 'PRD', 75),
  ('a1b2c3d4-2222-4222-8222-222222222222'::uuid, 'P&L', 'keyword', 'PRD', 80),
  ('a1b2c3d4-2222-4222-8222-222222222222'::uuid, 'profit and loss', 'pattern', 'PRD', 80),
  ('a1b2c3d4-2222-4222-8222-222222222222'::uuid, 'cash flow', 'pattern', 'PRD', 80),
  ('a1b2c3d4-2222-4222-8222-222222222222'::uuid, 'burn rate', 'pattern', 'PRD', 75),
  ('a1b2c3d4-2222-4222-8222-222222222222'::uuid, 'runway', 'keyword', 'PRD', 70),
  ('a1b2c3d4-2222-4222-8222-222222222222'::uuid, 'revenue projection', 'pattern', 'PRD', 85),
  ('a1b2c3d4-2222-4222-8222-222222222222'::uuid, 'margin', 'keyword', 'PRD', 65),
  ('a1b2c3d4-2222-4222-8222-222222222222'::uuid, 'gross margin', 'pattern', 'PRD', 75),
  ('a1b2c3d4-2222-4222-8222-222222222222'::uuid, 'EBITDA', 'keyword', 'PRD', 80),
  ('a1b2c3d4-2222-4222-8222-222222222222'::uuid, 'break even', 'pattern', 'PRD', 75),
  ('a1b2c3d4-2222-4222-8222-222222222222'::uuid, 'financial model', 'pattern', 'PRD', 85)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 3. MARKETING SUB-AGENT
-- ============================================================================

INSERT INTO leo_sub_agents (id, name, code, description, activation_type, priority, script_path, active)
VALUES (
  'a1b2c3d4-3333-4333-8333-333333333333'::uuid,
  'Marketing & GTM Sub-Agent',
  'MARKETING',
  'Handles go-to-market strategy, channel selection, messaging, campaign planning, and positioning. Produces gtm_plan and marketing_strategy artifacts.',
  'automatic',
  70,
  'lib/sub-agents/marketing.js',
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  description = EXCLUDED.description,
  script_path = EXCLUDED.script_path,
  active = EXCLUDED.active;

INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, trigger_context, priority)
VALUES
  ('a1b2c3d4-3333-4333-8333-333333333333'::uuid, 'marketing', 'keyword', 'PRD', 75),
  ('a1b2c3d4-3333-4333-8333-333333333333'::uuid, 'go-to-market', 'pattern', 'PRD', 85),
  ('a1b2c3d4-3333-4333-8333-333333333333'::uuid, 'GTM', 'keyword', 'PRD', 85),
  ('a1b2c3d4-3333-4333-8333-333333333333'::uuid, 'campaign', 'keyword', 'PRD', 70),
  ('a1b2c3d4-3333-4333-8333-333333333333'::uuid, 'positioning', 'keyword', 'PRD', 75),
  ('a1b2c3d4-3333-4333-8333-333333333333'::uuid, 'messaging', 'keyword', 'PRD', 70),
  ('a1b2c3d4-3333-4333-8333-333333333333'::uuid, 'channel strategy', 'pattern', 'PRD', 80),
  ('a1b2c3d4-3333-4333-8333-333333333333'::uuid, 'content marketing', 'pattern', 'PRD', 70),
  ('a1b2c3d4-3333-4333-8333-333333333333'::uuid, 'SEO', 'keyword', 'PRD', 65),
  ('a1b2c3d4-3333-4333-8333-333333333333'::uuid, 'brand awareness', 'pattern', 'PRD', 70),
  ('a1b2c3d4-3333-4333-8333-333333333333'::uuid, 'lead generation', 'pattern', 'PRD', 75)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 4. SALES SUB-AGENT
-- ============================================================================

INSERT INTO leo_sub_agents (id, name, code, description, activation_type, priority, script_path, active)
VALUES (
  'a1b2c3d4-4444-4444-8444-444444444444'::uuid,
  'Sales Process Sub-Agent',
  'SALES',
  'Handles sales playbook development, deal flow optimization, pipeline management, and sales process design. Produces sales_playbook artifacts.',
  'automatic',
  70,
  'lib/sub-agents/sales.js',
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  description = EXCLUDED.description,
  script_path = EXCLUDED.script_path,
  active = EXCLUDED.active;

INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, trigger_context, priority)
VALUES
  ('a1b2c3d4-4444-4444-8444-444444444444'::uuid, 'sales', 'keyword', 'PRD', 70),
  ('a1b2c3d4-4444-4444-8444-444444444444'::uuid, 'sales playbook', 'pattern', 'PRD', 85),
  ('a1b2c3d4-4444-4444-8444-444444444444'::uuid, 'sales process', 'pattern', 'PRD', 80),
  ('a1b2c3d4-4444-4444-8444-444444444444'::uuid, 'pipeline', 'keyword', 'PRD', 70),
  ('a1b2c3d4-4444-4444-8444-444444444444'::uuid, 'deal flow', 'pattern', 'PRD', 75),
  ('a1b2c3d4-4444-4444-8444-444444444444'::uuid, 'quota', 'keyword', 'PRD', 65),
  ('a1b2c3d4-4444-4444-8444-444444444444'::uuid, 'sales cycle', 'pattern', 'PRD', 75),
  ('a1b2c3d4-4444-4444-8444-444444444444'::uuid, 'objection handling', 'pattern', 'PRD', 70),
  ('a1b2c3d4-4444-4444-8444-444444444444'::uuid, 'sales enablement', 'pattern', 'PRD', 75),
  ('a1b2c3d4-4444-4444-8444-444444444444'::uuid, 'closing', 'keyword', 'PRD', 60)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5. CRM SUB-AGENT
-- ============================================================================

INSERT INTO leo_sub_agents (id, name, code, description, activation_type, priority, script_path, active)
VALUES (
  'a1b2c3d4-5555-4555-8555-555555555555'::uuid,
  'CRM Integration Sub-Agent',
  'CRM',
  'Handles customer relationship management integration, contact management, lead tracking, and customer success workflows. Produces crm_integration artifacts.',
  'automatic',
  65,
  'lib/sub-agents/crm.js',
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  description = EXCLUDED.description,
  script_path = EXCLUDED.script_path,
  active = EXCLUDED.active;

INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, trigger_context, priority)
VALUES
  ('a1b2c3d4-5555-4555-8555-555555555555'::uuid, 'CRM', 'keyword', 'PRD', 85),
  ('a1b2c3d4-5555-4555-8555-555555555555'::uuid, 'customer relationship', 'pattern', 'PRD', 80),
  ('a1b2c3d4-5555-4555-8555-555555555555'::uuid, 'contact management', 'pattern', 'PRD', 75),
  ('a1b2c3d4-5555-4555-8555-555555555555'::uuid, 'lead tracking', 'pattern', 'PRD', 70),
  ('a1b2c3d4-5555-4555-8555-555555555555'::uuid, 'customer success', 'pattern', 'PRD', 75),
  ('a1b2c3d4-5555-4555-8555-555555555555'::uuid, 'Salesforce', 'keyword', 'PRD', 70),
  ('a1b2c3d4-5555-4555-8555-555555555555'::uuid, 'HubSpot', 'keyword', 'PRD', 70),
  ('a1b2c3d4-5555-4555-8555-555555555555'::uuid, 'customer data', 'pattern', 'PRD', 65)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 6. ANALYTICS SUB-AGENT
-- ============================================================================

INSERT INTO leo_sub_agents (id, name, code, description, activation_type, priority, script_path, active)
VALUES (
  'a1b2c3d4-6666-4666-8666-666666666666'::uuid,
  'Analytics & Metrics Sub-Agent',
  'ANALYTICS',
  'Handles analytics setup, metrics definition, dashboard generation, AARRR funnel analysis, and user behavior tracking. Produces analytics_dashboard artifacts.',
  'automatic',
  75,
  'lib/sub-agents/analytics.js',
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  description = EXCLUDED.description,
  script_path = EXCLUDED.script_path,
  active = EXCLUDED.active;

INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, trigger_context, priority)
VALUES
  ('a1b2c3d4-6666-4666-8666-666666666666'::uuid, 'analytics', 'keyword', 'PRD', 80),
  ('a1b2c3d4-6666-4666-8666-666666666666'::uuid, 'metrics', 'keyword', 'PRD', 75),
  ('a1b2c3d4-6666-4666-8666-666666666666'::uuid, 'dashboard', 'keyword', 'PRD', 70),
  ('a1b2c3d4-6666-4666-8666-666666666666'::uuid, 'AARRR', 'keyword', 'PRD', 80),
  ('a1b2c3d4-6666-4666-8666-666666666666'::uuid, 'funnel', 'keyword', 'PRD', 70),
  ('a1b2c3d4-6666-4666-8666-666666666666'::uuid, 'conversion rate', 'pattern', 'PRD', 75),
  ('a1b2c3d4-6666-4666-8666-666666666666'::uuid, 'user behavior', 'pattern', 'PRD', 70),
  ('a1b2c3d4-6666-4666-8666-666666666666'::uuid, 'tracking', 'keyword', 'PRD', 65),
  ('a1b2c3d4-6666-4666-8666-666666666666'::uuid, 'KPI', 'keyword', 'PRD', 75),
  ('a1b2c3d4-6666-4666-8666-666666666666'::uuid, 'retention rate', 'pattern', 'PRD', 75),
  ('a1b2c3d4-6666-4666-8666-666666666666'::uuid, 'churn rate', 'pattern', 'PRD', 75)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 7. MONITORING SUB-AGENT
-- ============================================================================

INSERT INTO leo_sub_agents (id, name, code, description, activation_type, priority, script_path, active)
VALUES (
  'a1b2c3d4-7777-4777-8777-777777777777'::uuid,
  'Monitoring & Alerting Sub-Agent',
  'MONITORING',
  'Handles monitoring setup, alerting configuration, SLA definition, health checks, and incident response workflows. Produces monitoring_config artifacts.',
  'automatic',
  80,
  'lib/sub-agents/monitoring.js',
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  description = EXCLUDED.description,
  script_path = EXCLUDED.script_path,
  active = EXCLUDED.active;

INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, trigger_context, priority)
VALUES
  ('a1b2c3d4-7777-4777-8777-777777777777'::uuid, 'monitoring', 'keyword', 'PRD', 80),
  ('a1b2c3d4-7777-4777-8777-777777777777'::uuid, 'alerting', 'keyword', 'PRD', 80),
  ('a1b2c3d4-7777-4777-8777-777777777777'::uuid, 'health check', 'pattern', 'PRD', 75),
  ('a1b2c3d4-7777-4777-8777-777777777777'::uuid, 'SLA', 'keyword', 'PRD', 75),
  ('a1b2c3d4-7777-4777-8777-777777777777'::uuid, 'uptime', 'keyword', 'PRD', 70),
  ('a1b2c3d4-7777-4777-8777-777777777777'::uuid, 'incident', 'keyword', 'PRD', 70),
  ('a1b2c3d4-7777-4777-8777-777777777777'::uuid, 'observability', 'keyword', 'PRD', 80),
  ('a1b2c3d4-7777-4777-8777-777777777777'::uuid, 'logging', 'keyword', 'PRD', 65),
  ('a1b2c3d4-7777-4777-8777-777777777777'::uuid, 'tracing', 'keyword', 'PRD', 70),
  ('a1b2c3d4-7777-4777-8777-777777777777'::uuid, 'Datadog', 'keyword', 'PRD', 65),
  ('a1b2c3d4-7777-4777-8777-777777777777'::uuid, 'Prometheus', 'keyword', 'PRD', 65)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 8. LAUNCH SUB-AGENT
-- ============================================================================

INSERT INTO leo_sub_agents (id, name, code, description, activation_type, priority, script_path, active)
VALUES (
  'a1b2c3d4-8888-4888-8888-888888888888'::uuid,
  'Production Launch Sub-Agent',
  'LAUNCH',
  'Handles production launch orchestration, go-live checklists, deployment coordination, and launch readiness assessment. Produces launch_checklist artifacts.',
  'automatic',
  85,
  'lib/sub-agents/launch.js',
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  description = EXCLUDED.description,
  script_path = EXCLUDED.script_path,
  active = EXCLUDED.active;

INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, trigger_context, priority)
VALUES
  ('a1b2c3d4-8888-4888-8888-888888888888'::uuid, 'launch', 'keyword', 'PRD', 80),
  ('a1b2c3d4-8888-4888-8888-888888888888'::uuid, 'go-live', 'pattern', 'PRD', 85),
  ('a1b2c3d4-8888-4888-8888-888888888888'::uuid, 'production launch', 'pattern', 'PRD', 90),
  ('a1b2c3d4-8888-4888-8888-888888888888'::uuid, 'deployment', 'keyword', 'PRD', 75),
  ('a1b2c3d4-8888-4888-8888-888888888888'::uuid, 'release', 'keyword', 'PRD', 70),
  ('a1b2c3d4-8888-4888-8888-888888888888'::uuid, 'rollout', 'keyword', 'PRD', 75),
  ('a1b2c3d4-8888-4888-8888-888888888888'::uuid, 'cutover', 'keyword', 'PRD', 80),
  ('a1b2c3d4-8888-4888-8888-888888888888'::uuid, 'launch checklist', 'pattern', 'PRD', 85),
  ('a1b2c3d4-8888-4888-8888-888888888888'::uuid, 'beta release', 'pattern', 'PRD', 70),
  ('a1b2c3d4-8888-4888-8888-888888888888'::uuid, 'GA release', 'pattern', 'PRD', 80)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 9. VALUATION SUB-AGENT
-- ============================================================================

INSERT INTO leo_sub_agents (id, name, code, description, activation_type, priority, script_path, active)
VALUES (
  'a1b2c3d4-9999-4999-8999-999999999999'::uuid,
  'Exit Valuation Sub-Agent',
  'VALUATION',
  'Handles exit valuation modeling, comparable analysis, acquisition scenario planning, and investor readiness. Produces exit_scenario artifacts.',
  'automatic',
  70,
  'lib/sub-agents/valuation.js',
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  code = EXCLUDED.code,
  description = EXCLUDED.description,
  script_path = EXCLUDED.script_path,
  active = EXCLUDED.active;

INSERT INTO leo_sub_agent_triggers (sub_agent_id, trigger_phrase, trigger_type, trigger_context, priority)
VALUES
  ('a1b2c3d4-9999-4999-8999-999999999999'::uuid, 'valuation', 'keyword', 'PRD', 80),
  ('a1b2c3d4-9999-4999-8999-999999999999'::uuid, 'exit', 'keyword', 'PRD', 75),
  ('a1b2c3d4-9999-4999-8999-999999999999'::uuid, 'exit strategy', 'pattern', 'PRD', 85),
  ('a1b2c3d4-9999-4999-8999-999999999999'::uuid, 'acquisition', 'keyword', 'PRD', 80),
  ('a1b2c3d4-9999-4999-8999-999999999999'::uuid, 'IPO', 'keyword', 'PRD', 80),
  ('a1b2c3d4-9999-4999-8999-999999999999'::uuid, 'Series A', 'pattern', 'PRD', 75),
  ('a1b2c3d4-9999-4999-8999-999999999999'::uuid, 'fundraising', 'keyword', 'PRD', 70),
  ('a1b2c3d4-9999-4999-8999-999999999999'::uuid, 'multiple', 'keyword', 'PRD', 65),
  ('a1b2c3d4-9999-4999-8999-999999999999'::uuid, 'DCF', 'keyword', 'PRD', 70),
  ('a1b2c3d4-9999-4999-8999-999999999999'::uuid, 'comparable', 'keyword', 'PRD', 70),
  ('a1b2c3d4-9999-4999-8999-999999999999'::uuid, 'investor', 'keyword', 'PRD', 65)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
  agent_count INTEGER;
  trigger_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO agent_count
  FROM leo_sub_agents
  WHERE code IN ('PRICING', 'FINANCIAL', 'MARKETING', 'SALES', 'CRM', 'ANALYTICS', 'MONITORING', 'LAUNCH', 'VALUATION');

  SELECT COUNT(*) INTO trigger_count
  FROM leo_sub_agent_triggers
  WHERE sub_agent_id IN (
    'a1b2c3d4-1111-4111-8111-111111111111'::uuid,
    'a1b2c3d4-2222-4222-8222-222222222222'::uuid,
    'a1b2c3d4-3333-4333-8333-333333333333'::uuid,
    'a1b2c3d4-4444-4444-8444-444444444444'::uuid,
    'a1b2c3d4-5555-4555-8555-555555555555'::uuid,
    'a1b2c3d4-6666-4666-8666-666666666666'::uuid,
    'a1b2c3d4-7777-4777-8777-777777777777'::uuid,
    'a1b2c3d4-8888-4888-8888-888888888888'::uuid,
    'a1b2c3d4-9999-4999-8999-999999999999'::uuid
  );

  IF agent_count < 9 THEN
    RAISE EXCEPTION 'Expected 9 new sub-agents, found %', agent_count;
  END IF;

  RAISE NOTICE 'Industrial Expansion Sub-Agents Migration Complete';
  RAISE NOTICE '  - Agents registered: %', agent_count;
  RAISE NOTICE '  - Triggers configured: %', trigger_count;
END $$;

COMMIT;

-- ============================================================================
-- POST-MIGRATION NOTES
-- ============================================================================

-- MANUAL STEPS REQUIRED:
--
-- 1. Update orchestrate-phase-subagents.js PHASE_SUBAGENT_MAP:
--
--    const PHASE_SUBAGENT_MAP = {
--      LEAD_PRE_APPROVAL: ['VALIDATION', 'DATABASE', 'SECURITY', 'DESIGN', 'RISK', 'PRICING', 'FINANCIAL'],
--      PLAN_PRD: ['DATABASE', 'STORIES', 'RISK', 'MARKETING', 'SALES'],
--      EXEC_IMPL: ['LAUNCH', 'MONITORING'],
--      PLAN_VERIFY: ['TESTING', 'GITHUB', 'DATABASE', 'SECURITY', 'PERFORMANCE', 'DESIGN', 'API', 'ANALYTICS'],
--      LEAD_FINAL: ['RETRO', 'VALUATION']
--    };
--
-- 2. Verify all JS files exist:
--    ls lib/sub-agents/{pricing,financial,marketing,sales,crm,analytics,monitoring,launch,valuation}.js
--
-- 3. Test individual agent:
--    node lib/sub-agent-executor.js PRICING <TEST-VENTURE-ID>
