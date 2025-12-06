-- Model Usage Tracking for LEO Protocol
-- Purpose: Track actual model usage per sub-agent invocation via self-identification
-- Created: 2025-12-04
-- Part of: LEO Protocol Model Routing Verification

-- ============================================================================
-- TABLE: model_usage_log
-- Purpose: Time-series log of model usage during SD execution
-- ============================================================================
CREATE TABLE IF NOT EXISTS model_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Context
  session_id TEXT REFERENCES claude_sessions(session_id) ON DELETE SET NULL,
  sd_id TEXT,                                    -- Strategic Directive ID
  phase TEXT CHECK (phase IN ('LEAD', 'PLAN', 'EXEC', 'UNKNOWN')),

  -- Sub-agent info
  subagent_type TEXT,                            -- e.g., 'testing-agent', 'validation-agent'
  subagent_configured_model TEXT,                -- What .claude/agents/*.md says (sonnet/opus)

  -- Self-reported model info (ground truth)
  reported_model_name TEXT NOT NULL,             -- e.g., 'Sonnet 4.5', 'Claude Opus 4.5'
  reported_model_id TEXT NOT NULL,               -- e.g., 'claude-sonnet-4-5-20250929'

  -- Verification
  config_matches_reported BOOLEAN GENERATED ALWAYS AS (
    CASE
      WHEN subagent_configured_model IS NULL THEN NULL
      WHEN subagent_configured_model = 'sonnet' AND reported_model_id LIKE '%sonnet%' THEN TRUE
      WHEN subagent_configured_model = 'opus' AND reported_model_id LIKE '%opus%' THEN TRUE
      WHEN subagent_configured_model = 'haiku' AND reported_model_id LIKE '%haiku%' THEN TRUE
      ELSE FALSE
    END
  ) STORED,

  -- Timestamps
  captured_at TIMESTAMPTZ DEFAULT NOW(),

  -- Additional context
  metadata JSONB DEFAULT '{}'::jsonb             -- For extensibility (context usage, etc.)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_model_usage_session ON model_usage_log(session_id);
CREATE INDEX IF NOT EXISTS idx_model_usage_sd ON model_usage_log(sd_id);
CREATE INDEX IF NOT EXISTS idx_model_usage_subagent ON model_usage_log(subagent_type);
CREATE INDEX IF NOT EXISTS idx_model_usage_model ON model_usage_log(reported_model_id);
CREATE INDEX IF NOT EXISTS idx_model_usage_time ON model_usage_log(captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_model_usage_mismatch ON model_usage_log(config_matches_reported) WHERE config_matches_reported = FALSE;

-- ============================================================================
-- VIEW: v_model_usage_summary
-- Purpose: Aggregate model usage statistics
-- ============================================================================
CREATE OR REPLACE VIEW v_model_usage_summary AS
SELECT
  subagent_type,
  phase,
  reported_model_name,
  reported_model_id,
  subagent_configured_model,
  COUNT(*) as invocation_count,
  COUNT(*) FILTER (WHERE config_matches_reported = TRUE) as config_matched,
  COUNT(*) FILTER (WHERE config_matches_reported = FALSE) as config_mismatched,
  MIN(captured_at) as first_seen,
  MAX(captured_at) as last_seen
FROM model_usage_log
GROUP BY subagent_type, phase, reported_model_name, reported_model_id, subagent_configured_model
ORDER BY invocation_count DESC;

-- ============================================================================
-- VIEW: v_model_routing_verification
-- Purpose: Verify that model routing is working as configured
-- ============================================================================
CREATE OR REPLACE VIEW v_model_routing_verification AS
SELECT
  subagent_type,
  subagent_configured_model as expected_model,
  reported_model_name as actual_model,
  config_matches_reported as routing_working,
  COUNT(*) as sample_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE config_matches_reported) / NULLIF(COUNT(*), 0), 1) as success_rate_pct
FROM model_usage_log
WHERE subagent_configured_model IS NOT NULL
GROUP BY subagent_type, subagent_configured_model, reported_model_name, config_matches_reported
ORDER BY subagent_type, sample_count DESC;

-- ============================================================================
-- VIEW: v_sd_model_timeline
-- Purpose: See model usage over time for a specific SD
-- ============================================================================
CREATE OR REPLACE VIEW v_sd_model_timeline AS
SELECT
  sd_id,
  phase,
  subagent_type,
  reported_model_name,
  captured_at,
  LAG(reported_model_name) OVER (PARTITION BY sd_id ORDER BY captured_at) as previous_model,
  CASE
    WHEN LAG(reported_model_name) OVER (PARTITION BY sd_id ORDER BY captured_at) IS NULL THEN 'start'
    WHEN LAG(reported_model_name) OVER (PARTITION BY sd_id ORDER BY captured_at) != reported_model_name THEN 'model_switch'
    ELSE 'same_model'
  END as transition_type
FROM model_usage_log
ORDER BY sd_id, captured_at;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE model_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for anon" ON model_usage_log FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON model_usage_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE model_usage_log IS 'Tracks actual model usage via self-identification. Each row represents one sub-agent invocation with the model reporting its own identity.';
COMMENT ON COLUMN model_usage_log.reported_model_id IS 'The exact model ID as reported by the model itself (e.g., claude-sonnet-4-5-20250929). This is the ground truth.';
COMMENT ON COLUMN model_usage_log.config_matches_reported IS 'Computed column: TRUE if the configured model matches the reported model type.';
COMMENT ON VIEW v_model_routing_verification IS 'Use this view to verify that model routing is actually working. Success rate should be ~100% if routing is functional.';
