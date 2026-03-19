-- Deep Research API Integration: Results and Budget tracking tables
-- SD-LEO-FEAT-DEEP-RESEARCH-API-001
-- NOTE: Tables may already exist from prior session. Using IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS deep_research_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('anthropic', 'google', 'openai')),
  model TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'timed_out', 'cancelled')),
  thinking TEXT,
  result TEXT,
  summary TEXT,
  tokens_used INTEGER DEFAULT 0,
  cost_estimate NUMERIC(10, 4) DEFAULT 0,
  duration_ms INTEGER,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deep_research_status ON deep_research_results (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deep_research_provider ON deep_research_results (provider, created_at DESC);

CREATE TABLE IF NOT EXISTS deep_research_budget (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  provider TEXT NOT NULL CHECK (provider IN ('anthropic', 'google', 'openai', 'aggregate')),
  tokens_used INTEGER DEFAULT 0,
  total_cost NUMERIC(10, 4) DEFAULT 0,
  request_count INTEGER DEFAULT 0,
  daily_cap NUMERIC(10, 4) DEFAULT 10.00,
  kill_switch BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (date, provider)
);

ALTER TABLE deep_research_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE deep_research_budget ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'deep_research_results' AND policyname = 'Service role access on deep_research_results') THEN
    CREATE POLICY "Service role access on deep_research_results" ON deep_research_results FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'deep_research_budget' AND policyname = 'Service role access on deep_research_budget') THEN
    CREATE POLICY "Service role access on deep_research_budget" ON deep_research_budget FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

COMMENT ON TABLE deep_research_results IS 'Deep research job results with provider, tokens, cost, and thinking traces.';
COMMENT ON TABLE deep_research_budget IS 'Daily spending tracking per provider with caps and kill-switch.';
