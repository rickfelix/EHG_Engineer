-- Migration: Connection Strategy Router
-- SD: SD-LEO-INFRA-CONNECTION-STRATEGY-ROUTER-001
-- Purpose: Create connection_strategies table for smart connection method selection
-- Eliminates trial-and-error connection probing in sub-agents

-- ============================================================
-- 1. Create connection_strategies table
-- ============================================================
CREATE TABLE IF NOT EXISTS connection_strategies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service_name TEXT NOT NULL,          -- e.g., 'supabase', 'ollama', 'anthropic'
  method_name TEXT NOT NULL,           -- e.g., 'pooler_url', 'direct_password', 'service_client'
  rank INTEGER NOT NULL DEFAULT 1,     -- Lower = preferred (1 = highest priority)
  env_var_required TEXT,               -- e.g., 'SUPABASE_POOLER_URL'
  connection_type TEXT NOT NULL DEFAULT 'supabase_client',
    -- CHECK constraint for valid types
  description TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  config JSONB DEFAULT '{}'::jsonb,    -- Extra config (timeout, ssl, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint: one rank per service+method
  CONSTRAINT uq_connection_strategy UNIQUE (service_name, method_name),
  -- Valid connection types
  CONSTRAINT ck_connection_type CHECK (
    connection_type IN ('pg_client', 'supabase_client', 'supabase_service', 'http', 'grpc')
  )
);

-- Index for common query pattern: find methods for a service, ordered by rank
CREATE INDEX IF NOT EXISTS idx_connection_strategies_service_rank
  ON connection_strategies (service_name, rank)
  WHERE is_enabled = true;

-- Comment
COMMENT ON TABLE connection_strategies IS 'Ranked connection methods per service. Used by lib/connection-router.js to select optimal connection without trial-and-error.';

-- ============================================================
-- 2. Create connection_selection_log table (observability)
-- ============================================================
CREATE TABLE IF NOT EXISTS connection_selection_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service_name TEXT NOT NULL,
  method_selected TEXT NOT NULL,
  method_rank INTEGER,
  methods_skipped JSONB DEFAULT '[]'::jsonb,  -- [{method, reason}]
  selection_duration_ms INTEGER,
  caller TEXT,                                 -- e.g., 'database-agent', 'llm-factory'
  success BOOLEAN,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for monitoring queries
CREATE INDEX IF NOT EXISTS idx_connection_selection_log_service
  ON connection_selection_log (service_name, created_at DESC);

-- Auto-cleanup: keep last 30 days
COMMENT ON TABLE connection_selection_log IS 'Audit trail for connection method selection. Auto-cleanup recommended at 30 days.';

-- ============================================================
-- 3. Backfill: Supabase connection strategies
-- ============================================================
INSERT INTO connection_strategies (service_name, method_name, rank, env_var_required, connection_type, description, config)
VALUES
  -- Supabase: Pooler URL is preferred (no password needed, handles connection pooling)
  ('supabase', 'pooler_url', 1, 'SUPABASE_POOLER_URL', 'pg_client',
   'Connection via Supabase pooler URL. Preferred: no password needed, handles pooling.',
   '{"ssl": {"rejectUnauthorized": false}, "timeout_ms": 10000}'::jsonb),

  -- Supabase: Service client (REST API via supabase-js)
  ('supabase', 'service_client', 2, 'SUPABASE_SERVICE_ROLE_KEY', 'supabase_service',
   'Supabase JS client with service role key. Good for REST-style queries.',
   '{"auto_refresh": false}'::jsonb),

  -- Supabase: Direct password connection
  ('supabase', 'direct_password', 3, 'SUPABASE_DB_PASSWORD', 'pg_client',
   'Direct PostgreSQL connection with password. Fallback when pooler unavailable.',
   '{"ssl": {"rejectUnauthorized": false}, "timeout_ms": 10000, "region": "aws-1-us-east-1"}'::jsonb),

  -- Ollama: Local HTTP
  ('ollama', 'local_http', 1, NULL, 'http',
   'Local Ollama instance via HTTP. Default port 11434.',
   '{"base_url": "http://localhost:11434", "timeout_ms": 30000}'::jsonb),

  -- Anthropic: API key
  ('anthropic', 'api_key', 1, 'ANTHROPIC_API_KEY', 'http',
   'Anthropic API via HTTP with API key authentication.',
   '{"timeout_ms": 60000}'::jsonb)

ON CONFLICT (service_name, method_name) DO NOTHING;

-- ============================================================
-- 4. Updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_connection_strategies_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_connection_strategies_updated ON connection_strategies;
CREATE TRIGGER trg_connection_strategies_updated
  BEFORE UPDATE ON connection_strategies
  FOR EACH ROW
  EXECUTE FUNCTION update_connection_strategies_timestamp();

-- ============================================================
-- 5. View: Active strategies summary
-- ============================================================
CREATE OR REPLACE VIEW v_active_connection_strategies AS
SELECT
  service_name,
  method_name,
  rank,
  env_var_required,
  connection_type,
  description,
  config,
  is_enabled
FROM connection_strategies
WHERE is_enabled = true
ORDER BY service_name, rank;

-- ============================================================
-- 6. Verification
-- ============================================================
DO $$
DECLARE
  strategy_count INTEGER;
  service_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO strategy_count FROM connection_strategies;
  SELECT COUNT(DISTINCT service_name) INTO service_count FROM connection_strategies;

  RAISE NOTICE '✅ Connection strategies: % methods across % services', strategy_count, service_count;

  IF strategy_count < 3 THEN
    RAISE WARNING '⚠️  Expected at least 3 strategies, found %', strategy_count;
  END IF;
END $$;
