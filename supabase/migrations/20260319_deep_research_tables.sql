-- Migration: Deep Research Tables
-- SD: SD-LEO-FEAT-DEEP-RESEARCH-API-001
-- Description: Creates deep_research_results and deep_research_budget tables
--              for tracking deep research API calls and daily budget limits.
-- RLS: Disabled (service role access only)
-- Date: 2026-03-19

-- =============================================================================
-- Ensure updated_at trigger function exists (idempotent)
-- =============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Table 1: deep_research_results
-- Stores results from deep research API calls (extended thinking mode)
-- =============================================================================
CREATE TABLE IF NOT EXISTS deep_research_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('gemini', 'anthropic', 'openai', 'google', 'ollama')),
  model TEXT NOT NULL,
  response TEXT NOT NULL,
  response_format TEXT DEFAULT 'markdown',
  file_path TEXT,
  cost_usd NUMERIC(10,6) DEFAULT 0,
  duration_ms INTEGER CHECK (duration_ms >= 0),
  tokens_used JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'timeout')),
  error_message TEXT,
  research_session_id UUID,
  brainstorm_session_id UUID REFERENCES brainstorm_sessions(id),
  sd_key TEXT,
  venture_id UUID REFERENCES ventures(id),
  trigger_source TEXT CHECK (trigger_source IN ('manual', 'triangulation', 'brainstorm', 'vision')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

COMMENT ON TABLE deep_research_results IS 'Stores results from deep research API calls (extended thinking mode)';
COMMENT ON COLUMN deep_research_results.query IS 'The research query/prompt sent to the provider';
COMMENT ON COLUMN deep_research_results.provider IS 'AI provider: gemini, anthropic, or openai';
COMMENT ON COLUMN deep_research_results.tokens_used IS 'Token usage breakdown (input_tokens, output_tokens, thinking_tokens)';
COMMENT ON COLUMN deep_research_results.research_session_id IS 'Groups multiple research calls into a single session';
COMMENT ON COLUMN deep_research_results.trigger_source IS 'What initiated this research call';

-- Indexes for deep_research_results
CREATE INDEX IF NOT EXISTS idx_deep_research_session ON deep_research_results(research_session_id);
CREATE INDEX IF NOT EXISTS idx_deep_research_sd ON deep_research_results(sd_key);
CREATE INDEX IF NOT EXISTS idx_deep_research_status ON deep_research_results(status);
CREATE INDEX IF NOT EXISTS idx_deep_research_created ON deep_research_results(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deep_research_provider ON deep_research_results(provider);

-- updated_at trigger
CREATE TRIGGER set_deep_research_results_updated_at
  BEFORE UPDATE ON deep_research_results
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- Table 2: deep_research_budget
-- Daily budget tracking for deep research API calls per provider
-- =============================================================================
CREATE TABLE IF NOT EXISTS deep_research_budget (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  provider TEXT NOT NULL CHECK (provider IN ('gemini', 'anthropic', 'openai', 'google', 'ollama')),
  total_cost_usd NUMERIC(10,6) DEFAULT 0 CHECK (total_cost_usd >= 0),
  call_count INTEGER DEFAULT 0 CHECK (call_count >= 0),
  daily_cap_usd NUMERIC(10,6) DEFAULT 10.00 CHECK (daily_cap_usd >= 0),
  alert_threshold_pct NUMERIC(3,2) DEFAULT 0.80 CHECK (alert_threshold_pct >= 0 AND alert_threshold_pct <= 1.00),
  kill_switch BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, provider)
);

COMMENT ON TABLE deep_research_budget IS 'Daily budget tracking for deep research API calls per provider';
COMMENT ON COLUMN deep_research_budget.daily_cap_usd IS 'Maximum daily spend allowed per provider (default $10)';
COMMENT ON COLUMN deep_research_budget.alert_threshold_pct IS 'Percentage of daily cap that triggers an alert (default 80%)';
COMMENT ON COLUMN deep_research_budget.kill_switch IS 'Emergency stop - blocks all research calls for this provider/date';

-- updated_at trigger
CREATE TRIGGER set_deep_research_budget_updated_at
  BEFORE UPDATE ON deep_research_budget
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- Rollback SQL (for reference only - execute manually if needed)
-- =============================================================================
-- DROP TRIGGER IF EXISTS set_deep_research_budget_updated_at ON deep_research_budget;
-- DROP TRIGGER IF EXISTS set_deep_research_results_updated_at ON deep_research_results;
-- DROP TABLE IF EXISTS deep_research_budget;
-- DROP TABLE IF EXISTS deep_research_results;
