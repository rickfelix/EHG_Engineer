-- ============================================================================
-- Migration: Create subagent_validation_results Table
-- Version: LEO Protocol v4.4 - PATCH 005 Sub-Agent Output Validation
-- Created: 2025-12-18
--
-- Purpose:
-- Stores validation results from hallucination detection on sub-agent outputs.
-- Enables audit trail, retry tracking, and quality trend analysis.
--
-- Part of LEO-PATCH-005-SubAgentOutputValidation implementation.
-- ============================================================================

-- Create validation results table
CREATE TABLE IF NOT EXISTS subagent_validation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to sub-agent execution
  execution_id UUID REFERENCES sub_agent_execution_results(id) ON DELETE CASCADE,

  -- Context
  sd_id TEXT NOT NULL,
  sub_agent_code TEXT NOT NULL,

  -- Validation outcome
  validation_passed BOOLEAN NOT NULL,
  validation_score INTEGER CHECK (validation_score >= 0 AND validation_score <= 100),

  -- Validation details
  levels_checked TEXT[], -- Array of HallucinationLevel values checked

  -- Reference validation results (JSONB for flexible storage)
  file_references JSONB DEFAULT '{}'::jsonb,
  symbol_references JSONB DEFAULT '{}'::jsonb,
  table_references JSONB DEFAULT '{}'::jsonb,
  code_snippets JSONB DEFAULT '{}'::jsonb,

  -- Issues and warnings
  issues JSONB DEFAULT '[]'::jsonb,
  warnings JSONB DEFAULT '[]'::jsonb,

  -- Retry tracking
  retry_count INTEGER DEFAULT 0,
  retry_reason TEXT,
  previous_validation_id UUID REFERENCES subagent_validation_results(id),

  -- Metadata
  validation_duration_ms INTEGER,
  tables_loaded_count INTEGER,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_retry_count CHECK (retry_count >= 0 AND retry_count <= 10)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_validation_sd_id
ON subagent_validation_results(sd_id);

CREATE INDEX IF NOT EXISTS idx_validation_passed
ON subagent_validation_results(validation_passed);

CREATE INDEX IF NOT EXISTS idx_validation_execution_id
ON subagent_validation_results(execution_id);

CREATE INDEX IF NOT EXISTS idx_validation_sub_agent_code
ON subagent_validation_results(sub_agent_code);

CREATE INDEX IF NOT EXISTS idx_validation_created_at
ON subagent_validation_results(created_at DESC);

-- Index for finding failed validations (for quality analysis)
CREATE INDEX IF NOT EXISTS idx_validation_failed
ON subagent_validation_results(sd_id, created_at DESC)
WHERE validation_passed = false;

-- Index for retry chain analysis
CREATE INDEX IF NOT EXISTS idx_validation_retry_chain
ON subagent_validation_results(previous_validation_id)
WHERE previous_validation_id IS NOT NULL;

-- Comments
COMMENT ON TABLE subagent_validation_results IS
'LEO v4.4 PATCH-005: Stores sub-agent output validation results for hallucination detection audit trail';

COMMENT ON COLUMN subagent_validation_results.validation_passed IS
'Whether the validation passed (score >= threshold, typically 60)';

COMMENT ON COLUMN subagent_validation_results.validation_score IS
'Validation score 0-100: starts at 100, deducts for invalid references';

COMMENT ON COLUMN subagent_validation_results.levels_checked IS
'Array of validation levels: L1 (files), L2 (symbols), L3 (syntax), DB (tables)';

COMMENT ON COLUMN subagent_validation_results.retry_count IS
'Number of re-executions triggered by validation failures';

COMMENT ON COLUMN subagent_validation_results.previous_validation_id IS
'Links to previous validation in retry chain for analysis';

-- ============================================================================
-- View: v_validation_summary - Quick overview of validation health
-- ============================================================================

CREATE OR REPLACE VIEW v_validation_summary AS
SELECT
  sub_agent_code,
  COUNT(*) as total_validations,
  SUM(CASE WHEN validation_passed THEN 1 ELSE 0 END) as passed_count,
  SUM(CASE WHEN NOT validation_passed THEN 1 ELSE 0 END) as failed_count,
  ROUND(AVG(validation_score)::numeric, 2) as avg_score,
  ROUND(100.0 * SUM(CASE WHEN validation_passed THEN 1 ELSE 0 END) / COUNT(*), 2) as pass_rate,
  SUM(retry_count) as total_retries,
  MAX(created_at) as last_validation
FROM subagent_validation_results
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY sub_agent_code
ORDER BY pass_rate ASC, total_validations DESC;

-- ============================================================================
-- View: v_recent_validation_failures - Recent failures for investigation
-- ============================================================================

CREATE OR REPLACE VIEW v_recent_validation_failures AS
SELECT
  svr.id,
  svr.sd_id,
  svr.sub_agent_code,
  svr.validation_score,
  svr.retry_count,
  svr.issues,
  svr.warnings,
  svr.created_at,
  ser.verdict as execution_verdict,
  ser.confidence as execution_confidence
FROM subagent_validation_results svr
LEFT JOIN sub_agent_execution_results ser ON svr.execution_id = ser.id
WHERE svr.validation_passed = false
  AND svr.created_at > NOW() - INTERVAL '24 hours'
ORDER BY svr.created_at DESC
LIMIT 50;

-- ============================================================================
-- Function: get_validation_trends - Get validation trends for a sub-agent
-- ============================================================================

CREATE OR REPLACE FUNCTION get_validation_trends(
  p_sub_agent_code TEXT,
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  day DATE,
  validations INTEGER,
  passed INTEGER,
  failed INTEGER,
  avg_score NUMERIC,
  total_retries INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE(created_at) as day,
    COUNT(*)::INTEGER as validations,
    SUM(CASE WHEN validation_passed THEN 1 ELSE 0 END)::INTEGER as passed,
    SUM(CASE WHEN NOT validation_passed THEN 1 ELSE 0 END)::INTEGER as failed,
    ROUND(AVG(validation_score)::numeric, 2) as avg_score,
    SUM(retry_count)::INTEGER as total_retries
  FROM subagent_validation_results
  WHERE sub_agent_code = p_sub_agent_code
    AND created_at > NOW() - (p_days || ' days')::INTERVAL
  GROUP BY DATE(created_at)
  ORDER BY day DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- Migration complete
-- ============================================================================
