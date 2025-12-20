-- Gate Health Analytics
-- SD: Auto-generated for LEO Protocol self-improvement
-- Purpose: Track gate pass rates and auto-detect problematic gates
--
-- This migration creates:
-- 1. Materialized view for gate health metrics (30-day rolling window)
-- 2. Table for tracking gate failure patterns and linking to issue_patterns
-- 3. Function to refresh the materialized view

-- =============================================================================
-- 1. MATERIALIZED VIEW: v_gate_health_metrics
-- =============================================================================
-- Aggregates gate pass/fail rates over rolling 30-day window
-- Refresh weekly via GitHub Action or npm run gate:health

CREATE MATERIALIZED VIEW IF NOT EXISTS v_gate_health_metrics AS
SELECT
  gate,
  COUNT(*) as total_attempts,
  COUNT(*) FILTER (WHERE score >= 85) as passes,
  COUNT(*) FILTER (WHERE score < 85) as failures,
  ROUND(100.0 * COUNT(*) FILTER (WHERE score >= 85) / NULLIF(COUNT(*), 0), 1) as pass_rate,
  ROUND(AVG(score)::numeric, 1) as avg_score,
  MIN(created_at) as first_review,
  MAX(created_at) as last_review,
  -- Extract top failure reasons from evidence JSONB
  (
    SELECT jsonb_agg(DISTINCT e.value->>'failure_reason')
    FROM leo_gate_reviews lgr2, jsonb_array_elements(lgr2.evidence->'issues') e
    WHERE lgr2.gate = leo_gate_reviews.gate
      AND lgr2.score < 85
      AND lgr2.created_at >= NOW() - INTERVAL '30 days'
    LIMIT 5
  ) as top_failure_reasons
FROM leo_gate_reviews
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY gate;

-- Index for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_gate_health_metrics_gate
ON v_gate_health_metrics (gate);

-- =============================================================================
-- 2. TABLE: gate_failure_patterns
-- =============================================================================
-- Links recurring gate failures to issue_patterns for learning

CREATE TABLE IF NOT EXISTS gate_failure_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gate VARCHAR(10) NOT NULL,
  failure_signature TEXT NOT NULL, -- Normalized failure reason
  occurrence_count INTEGER DEFAULT 1,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),

  -- Linking to issue_patterns for unified learning
  related_pattern_id UUID REFERENCES issue_patterns(id),

  -- Remediation tracking
  remediation_sd_id VARCHAR(50), -- SD created to fix this
  remediation_status VARCHAR(20) DEFAULT 'pending', -- pending, in_progress, resolved

  -- Metadata
  evidence JSONB DEFAULT '{}', -- Sample failures for context
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint to prevent duplicates
  CONSTRAINT uq_gate_failure_signature UNIQUE (gate, failure_signature)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gate_failure_patterns_gate ON gate_failure_patterns(gate);
CREATE INDEX IF NOT EXISTS idx_gate_failure_patterns_occurrence ON gate_failure_patterns(occurrence_count DESC);
CREATE INDEX IF NOT EXISTS idx_gate_failure_patterns_status ON gate_failure_patterns(remediation_status);

-- =============================================================================
-- 3. TABLE: gate_health_history
-- =============================================================================
-- Weekly snapshots for trend analysis

CREATE TABLE IF NOT EXISTS gate_health_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gate VARCHAR(10) NOT NULL,
  week_start DATE NOT NULL,
  total_attempts INTEGER,
  passes INTEGER,
  failures INTEGER,
  pass_rate NUMERIC(5,1),
  avg_score NUMERIC(5,1),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT uq_gate_health_week UNIQUE (gate, week_start)
);

CREATE INDEX IF NOT EXISTS idx_gate_health_history_gate_week
ON gate_health_history(gate, week_start DESC);

-- =============================================================================
-- 4. FUNCTION: refresh_gate_health_metrics
-- =============================================================================
-- Called by GitHub Action weekly

CREATE OR REPLACE FUNCTION refresh_gate_health_metrics()
RETURNS void AS $$
BEGIN
  -- Refresh the materialized view
  REFRESH MATERIALIZED VIEW CONCURRENTLY v_gate_health_metrics;

  -- Capture weekly snapshot for trend analysis
  INSERT INTO gate_health_history (gate, week_start, total_attempts, passes, failures, pass_rate, avg_score)
  SELECT
    gate,
    DATE_TRUNC('week', NOW())::date as week_start,
    total_attempts,
    passes,
    failures,
    pass_rate,
    avg_score
  FROM v_gate_health_metrics
  ON CONFLICT (gate, week_start)
  DO UPDATE SET
    total_attempts = EXCLUDED.total_attempts,
    passes = EXCLUDED.passes,
    failures = EXCLUDED.failures,
    pass_rate = EXCLUDED.pass_rate,
    avg_score = EXCLUDED.avg_score;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 5. FUNCTION: get_gate_health_alerts
-- =============================================================================
-- Returns gates that need attention based on thresholds

CREATE OR REPLACE FUNCTION get_gate_health_alerts(
  p_pass_rate_threshold NUMERIC DEFAULT 70.0,
  p_min_attempts INTEGER DEFAULT 5
)
RETURNS TABLE (
  gate VARCHAR(10),
  pass_rate NUMERIC,
  total_attempts INTEGER,
  failures INTEGER,
  avg_score NUMERIC,
  alert_type TEXT,
  top_failure_reasons JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.gate,
    m.pass_rate,
    m.total_attempts::integer,
    m.failures::integer,
    m.avg_score,
    CASE
      WHEN m.pass_rate < p_pass_rate_threshold THEN 'LOW_PASS_RATE'
      WHEN m.failures > m.passes THEN 'MORE_FAILURES_THAN_PASSES'
      ELSE 'MONITOR'
    END as alert_type,
    m.top_failure_reasons
  FROM v_gate_health_metrics m
  WHERE m.total_attempts >= p_min_attempts
    AND (m.pass_rate < p_pass_rate_threshold OR m.failures > m.passes)
  ORDER BY m.pass_rate ASC, m.failures DESC;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 6. FUNCTION: record_gate_failure_pattern
-- =============================================================================
-- Upserts a gate failure pattern for tracking

CREATE OR REPLACE FUNCTION record_gate_failure_pattern(
  p_gate VARCHAR(10),
  p_failure_signature TEXT,
  p_evidence JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_pattern_id UUID;
BEGIN
  INSERT INTO gate_failure_patterns (gate, failure_signature, evidence)
  VALUES (p_gate, p_failure_signature, p_evidence)
  ON CONFLICT (gate, failure_signature)
  DO UPDATE SET
    occurrence_count = gate_failure_patterns.occurrence_count + 1,
    last_seen_at = NOW(),
    evidence = jsonb_set(
      gate_failure_patterns.evidence,
      '{samples}',
      COALESCE(gate_failure_patterns.evidence->'samples', '[]'::jsonb) ||
        jsonb_build_array(jsonb_build_object('at', NOW(), 'data', p_evidence))
    ),
    updated_at = NOW()
  RETURNING id INTO v_pattern_id;

  RETURN v_pattern_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 7. TRIGGER: Auto-update timestamp
-- =============================================================================

CREATE OR REPLACE FUNCTION update_gate_failure_patterns_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_gate_failure_patterns_timestamp ON gate_failure_patterns;
CREATE TRIGGER trigger_update_gate_failure_patterns_timestamp
  BEFORE UPDATE ON gate_failure_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_gate_failure_patterns_timestamp();

-- =============================================================================
-- 8. INITIAL REFRESH
-- =============================================================================
-- Only if leo_gate_reviews has data

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM leo_gate_reviews LIMIT 1) THEN
    REFRESH MATERIALIZED VIEW v_gate_health_metrics;
  END IF;
END $$;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON MATERIALIZED VIEW v_gate_health_metrics IS
'Rolling 30-day gate health metrics. Refresh weekly via refresh_gate_health_metrics()';

COMMENT ON TABLE gate_failure_patterns IS
'Tracks recurring gate failure patterns and links to issue_patterns for learning';

COMMENT ON TABLE gate_health_history IS
'Weekly snapshots of gate health for trend analysis';

COMMENT ON FUNCTION get_gate_health_alerts IS
'Returns gates below threshold that need remediation SDs';
