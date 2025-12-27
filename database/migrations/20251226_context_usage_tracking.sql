-- ============================================================================
-- LEO Protocol - Context Usage Tracking
-- Migration: 20251226_context_usage_tracking.sql
-- ============================================================================
-- Purpose: Server-authoritative token usage tracking for context optimization
--
-- Based on research findings:
--   - current_usage field provides accurate snapshot accounting
--   - Cache tokens must be counted in context window
--   - Non-monotonic usage indicates compaction events
--
-- Tables:
--   - context_usage_log: Raw usage entries from status line
--   - context_usage_daily: Aggregated daily summaries
--
-- Functions:
--   - get_context_usage_summary(): Session-level metrics
--   - get_compaction_analysis(): Compaction pattern insights
-- ============================================================================

-- Create context usage log table
CREATE TABLE IF NOT EXISTS context_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Session identification
  session_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,

  -- Model info
  model_id TEXT,

  -- Accurate token counts (from current_usage)
  context_used INTEGER NOT NULL,       -- input + cache_creation + cache_read
  context_size INTEGER DEFAULT 200000, -- Model's context window
  usage_percent SMALLINT NOT NULL,     -- (context_used / context_size) * 100

  -- Detailed breakdown
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cache_creation_tokens INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,

  -- Status and alerts
  status TEXT CHECK (status IN ('HEALTHY', 'WARNING', 'CRITICAL', 'EMERGENCY')),
  compaction_detected BOOLEAN DEFAULT FALSE,

  -- Context
  working_directory TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate entries
  CONSTRAINT unique_session_timestamp UNIQUE (session_id, timestamp)
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_context_usage_session ON context_usage_log(session_id);
CREATE INDEX IF NOT EXISTS idx_context_usage_timestamp ON context_usage_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_context_usage_compaction ON context_usage_log(compaction_detected) WHERE compaction_detected = TRUE;
CREATE INDEX IF NOT EXISTS idx_context_usage_status ON context_usage_log(status) WHERE status != 'HEALTHY';

-- Daily aggregation table (materialized for performance)
CREATE TABLE IF NOT EXISTS context_usage_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,

  -- Session metrics
  total_sessions INTEGER DEFAULT 0,
  total_entries INTEGER DEFAULT 0,

  -- Usage metrics
  avg_usage_percent DECIMAL(5,2),
  max_usage_percent SMALLINT,
  min_usage_percent SMALLINT,

  -- Token totals
  total_input_tokens BIGINT DEFAULT 0,
  total_output_tokens BIGINT DEFAULT 0,
  total_cache_read_tokens BIGINT DEFAULT 0,
  total_cache_creation_tokens BIGINT DEFAULT 0,

  -- Event counts
  compaction_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,
  critical_count INTEGER DEFAULT 0,
  emergency_count INTEGER DEFAULT 0,

  -- Calculated metrics
  cache_hit_ratio DECIMAL(5,2),  -- cache_read / (cache_read + cache_creation)
  avg_session_duration_minutes INTEGER,

  -- Metadata
  aggregated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function: Get context usage summary
CREATE OR REPLACE FUNCTION get_context_usage_summary(
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  total_sessions BIGINT,
  total_entries BIGINT,
  avg_usage_percent DECIMAL,
  max_usage_percent SMALLINT,
  compaction_count BIGINT,
  warning_count BIGINT,
  critical_count BIGINT,
  cache_efficiency DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT session_id) AS total_sessions,
    COUNT(*) AS total_entries,
    AVG(usage_percent)::DECIMAL(5,2) AS avg_usage_percent,
    MAX(usage_percent)::SMALLINT AS max_usage_percent,
    COUNT(*) FILTER (WHERE compaction_detected = TRUE) AS compaction_count,
    COUNT(*) FILTER (WHERE status = 'WARNING') AS warning_count,
    COUNT(*) FILTER (WHERE status IN ('CRITICAL', 'EMERGENCY')) AS critical_count,
    CASE
      WHEN SUM(cache_creation_tokens + cache_read_tokens) > 0
      THEN (SUM(cache_read_tokens)::DECIMAL / SUM(cache_creation_tokens + cache_read_tokens) * 100)::DECIMAL(5,2)
      ELSE 0
    END AS cache_efficiency
  FROM context_usage_log
  WHERE timestamp >= NOW() - (p_days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function: Get compaction analysis
CREATE OR REPLACE FUNCTION get_compaction_analysis()
RETURNS TABLE (
  total_compactions BIGINT,
  avg_pre_compaction_percent DECIMAL,
  avg_post_compaction_percent DECIMAL,
  estimated_compression_ratio DECIMAL,
  common_trigger_threshold DECIMAL
) AS $$
WITH compaction_events AS (
  SELECT
    c.session_id,
    c.timestamp,
    c.usage_percent AS post_percent,
    LAG(c.usage_percent) OVER (PARTITION BY c.session_id ORDER BY c.timestamp) AS pre_percent
  FROM context_usage_log c
  WHERE c.compaction_detected = TRUE
)
SELECT
  COUNT(*) AS total_compactions,
  AVG(pre_percent)::DECIMAL(5,2) AS avg_pre_compaction_percent,
  AVG(post_percent)::DECIMAL(5,2) AS avg_post_compaction_percent,
  CASE
    WHEN AVG(post_percent) > 0
    THEN (AVG(pre_percent) / AVG(post_percent))::DECIMAL(5,2)
    ELSE 0
  END AS estimated_compression_ratio,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pre_percent)::DECIMAL(5,2) AS common_trigger_threshold
FROM compaction_events
WHERE pre_percent IS NOT NULL;
$$ LANGUAGE sql STABLE;

-- Function: Aggregate daily metrics (run via cron or trigger)
CREATE OR REPLACE FUNCTION aggregate_context_usage_daily(p_date DATE DEFAULT CURRENT_DATE - 1)
RETURNS VOID AS $$
BEGIN
  INSERT INTO context_usage_daily (
    date,
    total_sessions,
    total_entries,
    avg_usage_percent,
    max_usage_percent,
    min_usage_percent,
    total_input_tokens,
    total_output_tokens,
    total_cache_read_tokens,
    total_cache_creation_tokens,
    compaction_count,
    warning_count,
    critical_count,
    emergency_count,
    cache_hit_ratio
  )
  SELECT
    p_date AS date,
    COUNT(DISTINCT session_id) AS total_sessions,
    COUNT(*) AS total_entries,
    AVG(usage_percent)::DECIMAL(5,2) AS avg_usage_percent,
    MAX(usage_percent)::SMALLINT AS max_usage_percent,
    MIN(usage_percent)::SMALLINT AS min_usage_percent,
    SUM(input_tokens) AS total_input_tokens,
    SUM(output_tokens) AS total_output_tokens,
    SUM(cache_read_tokens) AS total_cache_read_tokens,
    SUM(cache_creation_tokens) AS total_cache_creation_tokens,
    COUNT(*) FILTER (WHERE compaction_detected) AS compaction_count,
    COUNT(*) FILTER (WHERE status = 'WARNING') AS warning_count,
    COUNT(*) FILTER (WHERE status = 'CRITICAL') AS critical_count,
    COUNT(*) FILTER (WHERE status = 'EMERGENCY') AS emergency_count,
    CASE
      WHEN SUM(cache_creation_tokens + cache_read_tokens) > 0
      THEN (SUM(cache_read_tokens)::DECIMAL / SUM(cache_creation_tokens + cache_read_tokens) * 100)::DECIMAL(5,2)
      ELSE 0
    END AS cache_hit_ratio
  FROM context_usage_log
  WHERE DATE(timestamp) = p_date
  ON CONFLICT (date) DO UPDATE SET
    total_sessions = EXCLUDED.total_sessions,
    total_entries = EXCLUDED.total_entries,
    avg_usage_percent = EXCLUDED.avg_usage_percent,
    max_usage_percent = EXCLUDED.max_usage_percent,
    min_usage_percent = EXCLUDED.min_usage_percent,
    total_input_tokens = EXCLUDED.total_input_tokens,
    total_output_tokens = EXCLUDED.total_output_tokens,
    total_cache_read_tokens = EXCLUDED.total_cache_read_tokens,
    total_cache_creation_tokens = EXCLUDED.total_cache_creation_tokens,
    compaction_count = EXCLUDED.compaction_count,
    warning_count = EXCLUDED.warning_count,
    critical_count = EXCLUDED.critical_count,
    emergency_count = EXCLUDED.emergency_count,
    cache_hit_ratio = EXCLUDED.cache_hit_ratio,
    aggregated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- View: Recent usage summary (for dashboard)
CREATE OR REPLACE VIEW v_context_usage_recent AS
SELECT
  session_id,
  MIN(timestamp) AS session_start,
  MAX(timestamp) AS session_end,
  MAX(usage_percent) AS peak_usage,
  AVG(usage_percent)::INTEGER AS avg_usage,
  COUNT(*) FILTER (WHERE compaction_detected) AS compactions,
  MAX(model_id) AS model,
  EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))) / 60 AS duration_minutes
FROM context_usage_log
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY session_id
ORDER BY session_start DESC;

-- Comments
COMMENT ON TABLE context_usage_log IS 'Raw context usage entries from Claude Code status line (server-authoritative token counts)';
COMMENT ON TABLE context_usage_daily IS 'Aggregated daily context usage metrics for trend analysis';
COMMENT ON FUNCTION get_context_usage_summary IS 'Returns summary metrics for context usage over specified days';
COMMENT ON FUNCTION get_compaction_analysis IS 'Analyzes compaction patterns to understand trigger thresholds and compression ratios';
COMMENT ON COLUMN context_usage_log.context_used IS 'Total tokens in context window (input + cache_creation + cache_read) - the accurate metric';
COMMENT ON COLUMN context_usage_log.compaction_detected IS 'TRUE when context dropped from previous measurement, indicating compaction occurred';

-- ============================================================================
-- RLS POLICIES
-- Enable RLS for security compliance (internal tooling access)
-- ============================================================================
ALTER TABLE context_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_usage_daily ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (internal tooling)
CREATE POLICY "Allow all for authenticated" ON context_usage_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON context_usage_daily FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow read access for anon (metrics viewing)
CREATE POLICY "Allow select for anon" ON context_usage_log FOR SELECT TO anon USING (true);
CREATE POLICY "Allow select for anon" ON context_usage_daily FOR SELECT TO anon USING (true);

-- Grant permissions
GRANT SELECT, INSERT ON context_usage_log TO authenticated;
GRANT SELECT ON context_usage_daily TO authenticated;
GRANT SELECT ON v_context_usage_recent TO authenticated;
GRANT EXECUTE ON FUNCTION get_context_usage_summary TO authenticated;
GRANT EXECUTE ON FUNCTION get_compaction_analysis TO authenticated;
