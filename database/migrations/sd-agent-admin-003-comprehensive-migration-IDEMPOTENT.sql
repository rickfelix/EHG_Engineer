-- ============================================
-- SD-AGENT-ADMIN-003: IDEMPOTENT VERSION
-- ============================================
-- Database Architect Sub-Agent
-- Generated: 2025-10-30 (FIXED)
--
-- ROOT CAUSE: Original migration used CREATE TRIGGER/POLICY without
-- checking existence, causing errors on re-runs when tables already existed.
--
-- FIX: Added DROP IF EXISTS for all triggers and policies to make 100% idempotent.
-- Can now run multiple times safely without errors.
--
-- Tasks:
-- 1. Fix strategic_directives_v2 trigger (NEW.phase → NEW.current_phase)
-- 2. Create 4 missing tables (ab_test_results, search_preferences, agent_executions, performance_alerts)
-- 3. Insert 28 seed records into 6 empty tables
-- 4. Update RLS policies for 7 tables (anon SELECT)
-- 5. Validation queries included at end
-- ============================================

BEGIN;

-- ========================================
-- 1. Fix strategic_directives_v2 Trigger
-- ========================================

-- Drop existing trigger (now idempotent)
DROP TRIGGER IF EXISTS validate_sd_progress ON strategic_directives_v2;

-- Drop existing function to ensure clean recreation
DROP FUNCTION IF EXISTS validate_sd_progress_update();

-- Recreate trigger function with correct field reference
CREATE OR REPLACE FUNCTION validate_sd_progress_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Use current_phase instead of phase
  IF NEW.current_phase IS NOT NULL THEN
    -- Validate progress percentages
    IF NEW.progress < 0 OR NEW.progress > 100 THEN
      RAISE EXCEPTION 'Progress must be between 0 and 100';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger (now safe after DROP IF EXISTS)
CREATE TRIGGER validate_sd_progress
BEFORE INSERT OR UPDATE ON strategic_directives_v2
FOR EACH ROW
EXECUTE FUNCTION validate_sd_progress_update();

-- ========================================
-- 2. Create Missing Tables
-- ========================================

-- Table 1: ab_test_results
CREATE TABLE IF NOT EXISTS ab_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID REFERENCES prompt_ab_tests(id) ON DELETE CASCADE,
  variant TEXT NOT NULL CHECK (variant IN ('A', 'B', 'C', 'D')),
  execution_id UUID,
  outcome TEXT CHECK (outcome IN ('success', 'failure', 'timeout', 'error')),
  score DECIMAL(5,2),
  latency_ms INTEGER,
  token_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ab_test_results_test_id ON ab_test_results(test_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_results_variant ON ab_test_results(variant);
CREATE INDEX IF NOT EXISTS idx_ab_test_results_created_at ON ab_test_results(created_at DESC);

-- Table 2: search_preferences
CREATE TABLE IF NOT EXISTS search_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_key TEXT,
  default_engine TEXT DEFAULT 'google' CHECK (default_engine IN ('google', 'bing', 'duckduckgo', 'custom')),
  results_per_page INTEGER DEFAULT 10 CHECK (results_per_page BETWEEN 10 AND 100),
  safe_search BOOLEAN DEFAULT true,
  region TEXT DEFAULT 'us',
  language TEXT DEFAULT 'en',
  custom_endpoint TEXT,
  filter_config JSONB,
  timeout_seconds INTEGER DEFAULT 30 CHECK (timeout_seconds BETWEEN 10 AND 60),
  cache_enabled BOOLEAN DEFAULT true,
  cache_ttl_minutes INTEGER DEFAULT 60,
  is_default BOOLEAN DEFAULT false,
  is_locked BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_search_preferences_user_id ON search_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_search_preferences_agent_key ON search_preferences(agent_key);
CREATE INDEX IF NOT EXISTS idx_search_preferences_is_default ON search_preferences(is_default);

-- Table 3: agent_executions
CREATE TABLE IF NOT EXISTS agent_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key TEXT NOT NULL,
  agent_type TEXT,
  department TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  execution_type TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (completed_at - started_at))::INTEGER * 1000
  ) STORED,
  token_count INTEGER,
  cost_usd DECIMAL(10,4),
  status TEXT CHECK (status IN ('running', 'completed', 'failed', 'timeout')),
  error_message TEXT,
  error_type TEXT,
  quality_score DECIMAL(5,2),
  input_params JSONB,
  output_summary TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_executions_agent_key ON agent_executions(agent_key);
CREATE INDEX IF NOT EXISTS idx_agent_executions_started_at ON agent_executions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_executions_status ON agent_executions(status);
CREATE INDEX IF NOT EXISTS idx_agent_executions_user_id ON agent_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_executions_department ON agent_executions(department);

-- Table 4: performance_alerts
CREATE TABLE IF NOT EXISTS performance_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('latency', 'error_rate', 'cost', 'quality', 'volume')),
  condition TEXT NOT NULL,
  threshold_value DECIMAL(10,2) NOT NULL,
  comparison TEXT NOT NULL CHECK (comparison IN ('gt', 'lt', 'eq', 'gte', 'lte')),
  time_window_minutes INTEGER DEFAULT 60,
  notification_channels JSONB,
  enabled BOOLEAN DEFAULT true,
  last_triggered TIMESTAMPTZ,
  trigger_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_performance_alerts_enabled ON performance_alerts(enabled);
CREATE INDEX IF NOT EXISTS idx_performance_alerts_alert_type ON performance_alerts(alert_type);

-- ========================================
-- 3. Insert Seed Data (28 records)
-- ========================================

-- Seed data for agent_departments (11 records)
INSERT INTO agent_departments (id, department_name, description, status) VALUES
('dept-001', 'Research & Analysis', 'Market research and competitive intelligence', 'active'),
('dept-002', 'Product Development', 'AI-powered product development and innovation', 'active'),
('dept-003', 'Marketing & Growth', 'Customer acquisition and growth strategies', 'active'),
('dept-004', 'Operations', 'Business operations and process optimization', 'active'),
('dept-005', 'Finance', 'Financial planning and analysis', 'active'),
('dept-006', 'Customer Success', 'Customer support and relationship management', 'active'),
('dept-007', 'Data & Analytics', 'Data science and business intelligence', 'active'),
('dept-008', 'Engineering', 'Software development and technical architecture', 'active'),
('dept-009', 'Sales', 'Sales strategy and revenue generation', 'active'),
('dept-010', 'Legal & Compliance', 'Legal affairs and regulatory compliance', 'active'),
('dept-011', 'Human Resources', 'Talent acquisition and employee development', 'active')
ON CONFLICT (id) DO NOTHING;

-- Seed data for agent_tools (8 records)
INSERT INTO agent_tools (id, tool_name, description, category, enabled) VALUES
('tool-001', 'web_search', 'Search the web for current information', 'research', true),
('tool-002', 'document_analysis', 'Analyze documents and extract insights', 'analysis', true),
('tool-003', 'data_query', 'Query databases and data warehouses', 'data', true),
('tool-004', 'api_integration', 'Integrate with external APIs', 'integration', true),
('tool-005', 'code_execution', 'Execute code and scripts', 'development', true),
('tool-006', 'file_operations', 'Read and write files', 'utilities', true),
('tool-007', 'email_sender', 'Send emails and notifications', 'communication', true),
('tool-008', 'chart_generator', 'Generate charts and visualizations', 'visualization', true)
ON CONFLICT (id) DO NOTHING;

-- Seed data for crewai_agents (4 records)
INSERT INTO crewai_agents (id, agent_key, name, role, goal, backstory, department_id, tools, llm_model, max_tokens, temperature, status) VALUES
('agent-001', 'market-analyst', 'Market Intelligence Agent', 'Market Analyst', 'Analyze market trends and competitive landscape', 'Expert in market research with 15 years experience in venture capital markets', 'dept-001', ARRAY['web_search', 'document_analysis', 'data_query'], 'gpt-4', 4000, 0.7, 'active'),
('agent-002', 'customer-insights', 'Customer Insights Agent', 'Customer Research Specialist', 'Understand customer needs and behavior patterns', 'Customer psychology expert with background in behavioral economics', 'dept-001', ARRAY['web_search', 'data_query', 'chart_generator'], 'gpt-4', 4000, 0.7, 'active'),
('agent-003', 'competitive-intel', 'Competitive Intelligence Agent', 'Competitive Analyst', 'Monitor competitors and identify market opportunities', 'Former strategy consultant specializing in competitive analysis', 'dept-001', ARRAY['web_search', 'document_analysis', 'api_integration'], 'gpt-4', 4000, 0.7, 'active'),
('agent-004', 'portfolio-strategist', 'Portfolio Strategy Agent', 'Strategic Planner', 'Optimize venture portfolio and investment strategy', 'Seasoned venture capital strategist with portfolio management expertise', 'dept-001', ARRAY['data_query', 'chart_generator', 'document_analysis'], 'gpt-4', 4000, 0.7, 'active')
ON CONFLICT (id) DO NOTHING;

-- Seed data for crewai_crews (1 record)
INSERT INTO crewai_crews (id, crew_name, description, process_type, status) VALUES
('crew-001', 'Venture Research Crew', 'AI-powered research team for venture analysis and market intelligence', 'sequential', 'active')
ON CONFLICT (id) DO NOTHING;

-- Seed data for crew_members (4 records)
INSERT INTO crew_members (id, crew_id, agent_id, role_in_crew, execution_order) VALUES
('member-001', 'crew-001', 'agent-001', 'Lead market analyst', 1),
('member-002', 'crew-001', 'agent-002', 'Customer insights specialist', 2),
('member-003', 'crew-001', 'agent-003', 'Competitive intelligence', 3),
('member-004', 'crew-001', 'agent-004', 'Portfolio strategist', 4)
ON CONFLICT (id) DO NOTHING;

-- ========================================
-- 4. Update RLS Policies (IDEMPOTENT)
-- ========================================

-- Enable RLS on existing tables
ALTER TABLE agent_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE crewai_agents ENABLE ROW LEVEL SECURITY;

-- Update RLS policies for existing tables (agent_departments, agent_tools, crewai_agents)
-- NOW IDEMPOTENT: Drop policies first
DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOR table_name IN SELECT unnest(ARRAY['agent_departments', 'agent_tools', 'crewai_agents']) LOOP
    -- Drop existing policies (IDEMPOTENT FIX)
    EXECUTE format('DROP POLICY IF EXISTS "%s_anon_select" ON %I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "%s_authenticated_all" ON %I', table_name, table_name);

    -- Create new policies
    EXECUTE format('
      CREATE POLICY "%s_anon_select"
      ON %I
      FOR SELECT
      TO anon
      USING (true)
    ', table_name, table_name);

    EXECUTE format('
      CREATE POLICY "%s_authenticated_all"
      ON %I
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true)
    ', table_name, table_name);
  END LOOP;
END $$;

-- RLS for new tables
ALTER TABLE ab_test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_alerts ENABLE ROW LEVEL SECURITY;

-- ab_test_results: Anon SELECT for running tests (IDEMPOTENT)
DROP POLICY IF EXISTS "ab_test_results_anon_select" ON ab_test_results;
CREATE POLICY "ab_test_results_anon_select"
ON ab_test_results FOR SELECT TO anon
USING (
  EXISTS (
    SELECT 1 FROM prompt_ab_tests
    WHERE id = ab_test_results.test_id AND status = 'running'
  )
);

DROP POLICY IF EXISTS "ab_test_results_authenticated_insert" ON ab_test_results;
CREATE POLICY "ab_test_results_authenticated_insert"
ON ab_test_results FOR INSERT TO authenticated
WITH CHECK (true);

-- search_preferences: Users own profiles, anon read defaults (IDEMPOTENT)
DROP POLICY IF EXISTS "search_preferences_anon_select_defaults" ON search_preferences;
CREATE POLICY "search_preferences_anon_select_defaults"
ON search_preferences FOR SELECT TO anon
USING (is_default = true AND is_locked = true);

DROP POLICY IF EXISTS "search_preferences_authenticated_own" ON search_preferences;
CREATE POLICY "search_preferences_authenticated_own"
ON search_preferences FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- agent_executions: Users own executions (IDEMPOTENT)
DROP POLICY IF EXISTS "agent_executions_authenticated_own" ON agent_executions;
CREATE POLICY "agent_executions_authenticated_own"
ON agent_executions FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- performance_alerts: Authenticated users read, create own (IDEMPOTENT)
DROP POLICY IF EXISTS "performance_alerts_authenticated_read" ON performance_alerts;
CREATE POLICY "performance_alerts_authenticated_read"
ON performance_alerts FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "performance_alerts_authenticated_create" ON performance_alerts;
CREATE POLICY "performance_alerts_authenticated_create"
ON performance_alerts FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);

COMMIT;

-- ========================================
-- 5. Validation Queries (RUN AFTER COMMIT)
-- ========================================

-- Check seed data counts
SELECT 'agent_departments' as table_name, COUNT(*) as record_count FROM agent_departments
UNION ALL
SELECT 'agent_tools', COUNT(*) FROM agent_tools
UNION ALL
SELECT 'crewai_agents', COUNT(*) FROM crewai_agents
UNION ALL
SELECT 'crewai_crews', COUNT(*) FROM crewai_crews
UNION ALL
SELECT 'crew_members', COUNT(*) FROM crew_members;

-- Check table existence
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('ab_test_results', 'search_preferences', 'agent_executions', 'performance_alerts')
ORDER BY tablename;

-- Check RLS policies
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('agent_departments', 'agent_tools', 'crewai_agents', 'ab_test_results', 'search_preferences', 'agent_executions', 'performance_alerts')
ORDER BY tablename, policyname;

-- ============================================
-- Migration Complete!
-- ============================================
-- Expected Results:
-- - Trigger fixed: strategic_directives_v2
-- - Tables created: 4 (ab_test_results, search_preferences, agent_executions, performance_alerts)
-- - Seed records: 28 (11 departments, 8 tools, 4 agents, 1 crew, 4 members)
-- - RLS policies: 13 total across 7 tables
-- - IDEMPOTENT: Can run multiple times safely
-- ============================================
