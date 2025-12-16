-- SD-VISION-V2-004: Agent Registry & Hierarchy
-- Vision V2: Hierarchical Agent Architecture Implementation
--
-- This migration creates the foundational database infrastructure for the
-- fractal multi-agent system: Chairman -> EVA -> Venture CEOs -> VPs -> Crews
--
-- Reference: docs/vision/specs/06-hierarchical-agent-architecture.md
--
-- Tables Created:
--   1. agent_registry - Central registry with LTREE hierarchy
--   2. agent_relationships - Explicit relationship tracking
--   3. agent_memory_stores - Persistent agent memory with embeddings
--   4. tool_registry - Shared tool catalog
--   5. tool_access_grants - Per-agent tool permissions
--   6. agent_messages - Cross-agent communication protocol
--   7. venture_tool_quotas - Per-venture tool limits
--   8. tool_usage_ledger - Tool consumption audit trail
--
-- Well-Known Agent IDs:
--   Chairman: 00000000-0000-0000-0000-000000000001
--   EVA:      00000000-0000-0000-0000-000000000002

-- ============================================================================
-- STEP 1: Enable Required Extensions
-- ============================================================================

-- LTREE extension for hierarchical path queries
CREATE EXTENSION IF NOT EXISTS ltree;

-- pgvector extension for semantic search (should already exist)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- STEP 2: Helper Functions
-- ============================================================================

-- fn_is_chairman: Check if current user is Chairman for RLS policies
CREATE OR REPLACE FUNCTION fn_is_chairman()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- For now, check if user has chairman role or is the Chairman user
  -- This will be enhanced as the auth system evolves
  RETURN (
    current_setting('request.jwt.claims', true)::json->>'role' = 'chairman'
    OR current_setting('request.jwt.claims', true)::json->>'sub' = '00000000-0000-0000-0000-000000000001'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

-- ============================================================================
-- STEP 3: Core Tables
-- ============================================================================

-- 3.1 agent_registry - Central registry of all agents
CREATE TABLE IF NOT EXISTS agent_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  agent_type VARCHAR(50) NOT NULL CHECK (agent_type IN ('chairman', 'eva', 'venture_ceo', 'executive', 'crew')),
  agent_role VARCHAR(100), -- e.g., VP_STRATEGY, MARKET_RESEARCH_CREW
  display_name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Hierarchy
  parent_agent_id UUID REFERENCES agent_registry(id) ON DELETE RESTRICT,
  hierarchy_level SMALLINT NOT NULL CHECK (hierarchy_level BETWEEN 1 AND 5),
  hierarchy_path LTREE NOT NULL,

  -- Scope
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE SET NULL,

  -- Capabilities & Authority
  capabilities TEXT[] DEFAULT '{}',
  tool_access TEXT[] DEFAULT '{}',
  delegation_authority JSONB DEFAULT '{}',

  -- Resource Management
  token_budget BIGINT DEFAULT 0,
  token_consumed BIGINT DEFAULT 0,
  context_window_id UUID,
  knowledge_base_ids UUID[] DEFAULT '{}',

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'terminated', 'standby')),

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,

  -- Constraints
  CONSTRAINT agent_registry_hierarchy_path_unique UNIQUE (hierarchy_path)
);

-- Indexes for agent_registry
CREATE INDEX IF NOT EXISTS idx_agent_registry_hierarchy ON agent_registry USING GIST(hierarchy_path);
CREATE INDEX IF NOT EXISTS idx_agent_registry_venture_status ON agent_registry(venture_id, status) WHERE venture_id IS NOT NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_agent_registry_parent ON agent_registry(parent_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_registry_type ON agent_registry(agent_type);

-- Well-known ID protection constraint
ALTER TABLE agent_registry DROP CONSTRAINT IF EXISTS agent_registry_wellknown_protection;
ALTER TABLE agent_registry ADD CONSTRAINT agent_registry_wellknown_protection CHECK (
  (id != '00000000-0000-0000-0000-000000000001'::uuid OR agent_type = 'chairman') AND
  (id != '00000000-0000-0000-0000-000000000002'::uuid OR agent_type = 'eva')
);

-- 3.2 agent_relationships - Explicit relationship tracking
CREATE TABLE IF NOT EXISTS agent_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  from_agent_id UUID NOT NULL REFERENCES agent_registry(id) ON DELETE CASCADE,
  to_agent_id UUID NOT NULL REFERENCES agent_registry(id) ON DELETE CASCADE,
  relationship_type VARCHAR(50) NOT NULL CHECK (relationship_type IN (
    'reports_to', 'delegates_to', 'coordinates_with', 'supervises', 'shares_knowledge'
  )),

  delegation_scope JSONB DEFAULT '{}',
  communication_channel VARCHAR(50) DEFAULT 'task_contract' CHECK (communication_channel IN (
    'task_contract', 'message_queue', 'direct'
  )),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_relationships_unique UNIQUE (from_agent_id, to_agent_id, relationship_type)
);

-- Indexes for agent_relationships
CREATE INDEX IF NOT EXISTS idx_relationships_from ON agent_relationships(from_agent_id);
CREATE INDEX IF NOT EXISTS idx_relationships_to ON agent_relationships(to_agent_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type_from ON agent_relationships(relationship_type, from_agent_id);

-- 3.3 agent_memory_stores - Persistent memory for CEO/VP agents
CREATE TABLE IF NOT EXISTS agent_memory_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  agent_id UUID NOT NULL REFERENCES agent_registry(id) ON DELETE CASCADE,
  memory_type VARCHAR(50) NOT NULL CHECK (memory_type IN ('context', 'decisions', 'learnings', 'preferences')),

  content JSONB NOT NULL DEFAULT '{}',
  summary TEXT,
  embedding VECTOR(1536),

  -- Versioning
  version INTEGER NOT NULL DEFAULT 1,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  parent_version_id UUID REFERENCES agent_memory_stores(id) ON DELETE SET NULL,

  -- Lifecycle
  importance_score FLOAT DEFAULT 0.5 CHECK (importance_score BETWEEN 0 AND 1),
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for agent_memory_stores
CREATE INDEX IF NOT EXISTS idx_memory_agent_current ON agent_memory_stores(agent_id) WHERE is_current = TRUE;
CREATE INDEX IF NOT EXISTS idx_memory_importance ON agent_memory_stores(agent_id, importance_score DESC) WHERE is_current = TRUE;
CREATE INDEX IF NOT EXISTS idx_memory_embedding ON agent_memory_stores USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================================
-- STEP 4: Tool System Tables
-- ============================================================================

-- 4.1 tool_registry - Central tool catalog
CREATE TABLE IF NOT EXISTS tool_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  tool_name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,

  tool_category VARCHAR(50) NOT NULL CHECK (tool_category IN (
    'research', 'analysis', 'generation', 'communication', 'integration', 'database', 'monitoring'
  )),
  implementation_type VARCHAR(50) NOT NULL CHECK (implementation_type IN (
    'function', 'api', 'mcp_server', 'crew'
  )),
  implementation_config JSONB DEFAULT '{}',

  -- Access Control
  min_hierarchy_level SMALLINT DEFAULT 4 CHECK (min_hierarchy_level BETWEEN 1 AND 4),
  required_capabilities TEXT[] DEFAULT '{}',

  -- Cost & Limits
  cost_per_use_usd DECIMAL(10, 6) DEFAULT 0,
  rate_limit_per_minute INTEGER DEFAULT 60,
  timeout_seconds INTEGER DEFAULT 30,

  is_available BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for tool_registry
CREATE INDEX IF NOT EXISTS idx_tool_category_available ON tool_registry(tool_category, is_available);
CREATE INDEX IF NOT EXISTS idx_tool_capabilities ON tool_registry USING GIN (required_capabilities);

-- 4.2 tool_access_grants - Per-agent tool permissions
CREATE TABLE IF NOT EXISTS tool_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  agent_id UUID NOT NULL REFERENCES agent_registry(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES tool_registry(id) ON DELETE CASCADE,

  grant_type VARCHAR(20) NOT NULL DEFAULT 'direct' CHECK (grant_type IN ('direct', 'inherited', 'temporary')),
  granted_by UUID REFERENCES agent_registry(id) ON DELETE SET NULL,

  -- Usage Limits
  daily_usage_limit INTEGER,
  usage_count_today INTEGER DEFAULT 0,

  -- Temporal Validity
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT tool_access_grants_unique UNIQUE (agent_id, tool_id)
);

-- Indexes for tool_access_grants
CREATE INDEX IF NOT EXISTS idx_grants_agent ON tool_access_grants(agent_id);
CREATE INDEX IF NOT EXISTS idx_grants_tool ON tool_access_grants(tool_id);

-- ============================================================================
-- STEP 5: Communication Tables
-- ============================================================================

-- 5.1 agent_messages - Cross-agent communication protocol
CREATE TABLE IF NOT EXISTS agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  message_type VARCHAR(50) NOT NULL CHECK (message_type IN (
    'task_delegation', 'task_completion', 'status_report', 'escalation',
    'coordination', 'broadcast', 'query', 'response'
  )),

  from_agent_id UUID NOT NULL REFERENCES agent_registry(id) ON DELETE CASCADE,
  to_agent_id UUID NOT NULL REFERENCES agent_registry(id) ON DELETE CASCADE,
  correlation_id UUID, -- For request-response pairs

  subject VARCHAR(255),
  body JSONB NOT NULL DEFAULT '{}',
  attachments UUID[] DEFAULT '{}',

  priority VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),

  requires_response BOOLEAN DEFAULT FALSE,
  response_deadline TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  response_message_id UUID REFERENCES agent_messages(id) ON DELETE SET NULL,

  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'delivered', 'read', 'processing', 'completed', 'failed'
  )),

  -- Routing
  route_through UUID[] DEFAULT '{}',
  current_position INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Indexes for agent_messages
CREATE INDEX IF NOT EXISTS idx_messages_inbox ON agent_messages(to_agent_id, status);
CREATE INDEX IF NOT EXISTS idx_messages_from ON agent_messages(from_agent_id);
CREATE INDEX IF NOT EXISTS idx_messages_correlation ON agent_messages(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_needs_response ON agent_messages(to_agent_id, response_deadline) WHERE requires_response = TRUE AND responded_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_pending ON agent_messages(to_agent_id, created_at) WHERE status = 'pending';

-- ============================================================================
-- STEP 6: Quota & Ledger Tables
-- ============================================================================

-- 6.1 venture_tool_quotas - Per-venture tool usage limits
CREATE TABLE IF NOT EXISTS venture_tool_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES tool_registry(id) ON DELETE CASCADE,

  -- Limits
  daily_limit INTEGER,
  monthly_limit INTEGER,
  cost_limit_usd DECIMAL(10, 2),

  -- Current Usage
  usage_today INTEGER DEFAULT 0,
  usage_this_month INTEGER DEFAULT 0,
  cost_this_month_usd DECIMAL(10, 2) DEFAULT 0,

  -- Reset Tracking
  last_daily_reset TIMESTAMPTZ DEFAULT NOW(),
  last_monthly_reset TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT venture_tool_quotas_unique UNIQUE (venture_id, tool_id)
);

-- Index for venture_tool_quotas
CREATE INDEX IF NOT EXISTS idx_venture_quotas_venture ON venture_tool_quotas(venture_id);

-- 6.2 tool_usage_ledger - Immutable audit log
CREATE TABLE IF NOT EXISTS tool_usage_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  agent_id UUID NOT NULL REFERENCES agent_registry(id) ON DELETE RESTRICT,
  venture_id UUID REFERENCES ventures(id) ON DELETE SET NULL,
  tool_id UUID NOT NULL REFERENCES tool_registry(id) ON DELETE RESTRICT,

  tokens_consumed INTEGER DEFAULT 0,
  cost_usd DECIMAL(10, 6) DEFAULT 0,
  execution_ms INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for tool_usage_ledger
CREATE INDEX IF NOT EXISTS idx_ledger_venture_cost ON tool_usage_ledger(venture_id, created_at DESC, cost_usd);
CREATE INDEX IF NOT EXISTS idx_ledger_agent ON tool_usage_ledger(agent_id, created_at DESC);

-- ============================================================================
-- STEP 7: Helper Functions
-- ============================================================================

-- fn_claim_next_message: Atomic message claiming with priority ordering
CREATE OR REPLACE FUNCTION fn_claim_next_message(p_agent_id UUID)
RETURNS agent_messages
LANGUAGE plpgsql
AS $$
DECLARE
  v_message agent_messages;
BEGIN
  SELECT * INTO v_message
  FROM agent_messages
  WHERE to_agent_id = p_agent_id
    AND status = 'pending'
  ORDER BY
    CASE priority
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'normal' THEN 3
      WHEN 'low' THEN 4
    END,
    created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_message IS NOT NULL THEN
    UPDATE agent_messages
    SET status = 'processing',
        delivered_at = NOW()
    WHERE id = v_message.id;
  END IF;

  RETURN v_message;
END;
$$;

-- fn_check_quota_reset: Reset daily/monthly quotas when needed
CREATE OR REPLACE FUNCTION fn_check_quota_reset()
RETURNS TRIGGER AS $$
BEGIN
  -- Daily reset check
  IF NEW.last_daily_reset::date < CURRENT_DATE THEN
    NEW.usage_today := 0;
    NEW.last_daily_reset := NOW();
  END IF;

  -- Monthly reset check
  IF DATE_TRUNC('month', NEW.last_monthly_reset) < DATE_TRUNC('month', NOW()) THEN
    NEW.usage_this_month := 0;
    NEW.cost_this_month_usd := 0;
    NEW.last_monthly_reset := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for quota reset
DROP TRIGGER IF EXISTS trg_reset_quotas_on_access ON venture_tool_quotas;
CREATE TRIGGER trg_reset_quotas_on_access
BEFORE UPDATE ON venture_tool_quotas
FOR EACH ROW
EXECUTE FUNCTION fn_check_quota_reset();

-- ============================================================================
-- STEP 8: Row Level Security Policies
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE agent_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE venture_tool_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_usage_ledger ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY service_role_all_agent_registry ON agent_registry TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY service_role_all_relationships ON agent_relationships TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY service_role_all_memory ON agent_memory_stores TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY service_role_all_tools ON tool_registry TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY service_role_all_grants ON tool_access_grants TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY service_role_all_messages ON agent_messages TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY service_role_all_quotas ON venture_tool_quotas TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY service_role_all_ledger ON tool_usage_ledger TO service_role USING (TRUE) WITH CHECK (TRUE);

-- Authenticated users (Chairman) can read agents and tools
CREATE POLICY chairman_read_agents ON agent_registry FOR SELECT TO authenticated USING (fn_is_chairman());
CREATE POLICY chairman_read_tools ON tool_registry FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY chairman_read_ledger ON tool_usage_ledger FOR SELECT TO authenticated USING (fn_is_chairman());

-- Ledger is immutable (no UPDATE/DELETE for authenticated)
CREATE POLICY ledger_no_update ON tool_usage_ledger FOR UPDATE TO authenticated USING (FALSE);
CREATE POLICY ledger_no_delete ON tool_usage_ledger FOR DELETE TO authenticated USING (FALSE);

-- ============================================================================
-- STEP 9: Bootstrap Chairman and EVA Agents
-- ============================================================================

-- Insert Chairman agent (if not exists)
INSERT INTO agent_registry (
  id, agent_type, display_name, description, hierarchy_level, hierarchy_path, status
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'chairman',
  'Chairman',
  'Ecosystem governance, capital allocation, strategic direction. The human principal of the multi-agent system.',
  1,
  'chairman',
  'active'
) ON CONFLICT (id) DO NOTHING;

-- Insert EVA agent (if not exists)
INSERT INTO agent_registry (
  id, agent_type, display_name, description, parent_agent_id, hierarchy_level, hierarchy_path, status,
  capabilities, delegation_authority
) VALUES (
  '00000000-0000-0000-0000-000000000002',
  'eva',
  'EVA',
  'Executive Virtual Assistant. COO-level agent managing venture CEOs and orchestrating cross-venture operations.',
  '00000000-0000-0000-0000-000000000001',
  2,
  'chairman.eva',
  'active',
  ARRAY['venture_management', 'agent_orchestration', 'resource_allocation', 'reporting'],
  '{"can_create_ceo": true, "can_allocate_budget": true, "max_venture_budget_usd": 100000}'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- Create Chairman-EVA relationships
INSERT INTO agent_relationships (from_agent_id, to_agent_id, relationship_type)
VALUES
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'reports_to'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'supervises')
ON CONFLICT (from_agent_id, to_agent_id, relationship_type) DO NOTHING;

-- ============================================================================
-- STEP 10: Seed Core Tools
-- ============================================================================

INSERT INTO tool_registry (tool_name, display_name, description, tool_category, implementation_type, min_hierarchy_level, cost_per_use_usd) VALUES
  ('web_search', 'Web Search', 'Search the internet for information', 'research', 'api', 4, 0.001),
  ('company_lookup', 'Company Lookup', 'Look up company information from databases', 'research', 'api', 4, 0.01),
  ('market_data', 'Market Data', 'Access financial market data and trends', 'research', 'api', 3, 0.02),
  ('financial_model', 'Financial Model', 'Generate financial projections and models', 'analysis', 'function', 3, 0.05),
  ('sentiment_analyzer', 'Sentiment Analyzer', 'Analyze text sentiment', 'analysis', 'function', 4, 0.001),
  ('tam_calculator', 'TAM Calculator', 'Calculate Total Addressable Market', 'analysis', 'function', 3, 0.01),
  ('code_generator', 'Code Generator', 'Generate code from specifications', 'generation', 'api', 4, 0.02),
  ('document_writer', 'Document Writer', 'Generate documents and reports', 'generation', 'api', 4, 0.01),
  ('image_generator', 'Image Generator', 'Generate images from prompts', 'generation', 'api', 4, 0.05),
  ('venture_query', 'Venture Query', 'Query venture database for information', 'database', 'function', 3, 0.001),
  ('artifact_store', 'Artifact Store', 'Store and retrieve artifacts', 'database', 'function', 4, 0.0001),
  ('email_sender', 'Email Sender', 'Send emails to stakeholders', 'communication', 'api', 2, 0.001),
  ('slack_notifier', 'Slack Notifier', 'Send Slack notifications', 'communication', 'api', 3, 0.0001)
ON CONFLICT (tool_name) DO NOTHING;

-- Grant EVA access to all tools with min_hierarchy_level <= 2
INSERT INTO tool_access_grants (agent_id, tool_id, grant_type, granted_by)
SELECT
  '00000000-0000-0000-0000-000000000002'::uuid,
  t.id,
  'direct',
  '00000000-0000-0000-0000-000000000001'::uuid
FROM tool_registry t
WHERE t.min_hierarchy_level <= 2
ON CONFLICT (agent_id, tool_id) DO NOTHING;

-- ============================================================================
-- STEP 11: Update Triggers
-- ============================================================================

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
DROP TRIGGER IF EXISTS trg_agent_registry_updated ON agent_registry;
CREATE TRIGGER trg_agent_registry_updated BEFORE UPDATE ON agent_registry FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

DROP TRIGGER IF EXISTS trg_memory_updated ON agent_memory_stores;
CREATE TRIGGER trg_memory_updated BEFORE UPDATE ON agent_memory_stores FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

DROP TRIGGER IF EXISTS trg_tool_registry_updated ON tool_registry;
CREATE TRIGGER trg_tool_registry_updated BEFORE UPDATE ON tool_registry FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

DROP TRIGGER IF EXISTS trg_quotas_updated ON venture_tool_quotas;
CREATE TRIGGER trg_quotas_updated BEFORE UPDATE ON venture_tool_quotas FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- ============================================================================
-- VERIFICATION QUERIES (Run manually to verify)
-- ============================================================================

-- Verify LTREE extension
-- SELECT * FROM pg_extension WHERE extname = 'ltree';

-- Verify Chairman and EVA
-- SELECT id, agent_type, display_name, hierarchy_path FROM agent_registry WHERE id IN ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');

-- Verify relationships
-- SELECT r.*, f.display_name as from_name, t.display_name as to_name FROM agent_relationships r JOIN agent_registry f ON r.from_agent_id = f.id JOIN agent_registry t ON r.to_agent_id = t.id;

-- Verify tools
-- SELECT tool_name, display_name, min_hierarchy_level, cost_per_use_usd FROM tool_registry ORDER BY tool_name;

-- Verify EVA tool grants
-- SELECT t.tool_name FROM tool_access_grants g JOIN tool_registry t ON g.tool_id = t.id WHERE g.agent_id = '00000000-0000-0000-0000-000000000002';

-- Test LTREE hierarchy query
-- SELECT * FROM agent_registry WHERE hierarchy_path <@ 'chairman';
