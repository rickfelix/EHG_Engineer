-- Migration: Pattern Usage Metrics and Health Scoring
-- SD: SD-PATTERN-METRICS-001
-- Description: Usage metrics, health scoring, deprecation candidate detection

-- ============================================
-- Table: pattern_usage_metrics
-- ============================================
CREATE TABLE IF NOT EXISTS pattern_usage_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  pattern_id VARCHAR(20) NOT NULL, -- References failure_patterns.pattern_id

  -- Usage tracking
  total_matches INTEGER DEFAULT 0,
  confirmed_matches INTEGER DEFAULT 0,
  false_positives INTEGER DEFAULT 0,

  -- Temporal metrics
  last_matched_at TIMESTAMPTZ,
  last_confirmed_at TIMESTAMPTZ,
  first_matched_at TIMESTAMPTZ DEFAULT NOW(),

  -- Rolling window metrics (30-day)
  matches_last_30_days INTEGER DEFAULT 0,
  confirmations_last_30_days INTEGER DEFAULT 0,

  -- Effectiveness metrics
  prevention_success_count INTEGER DEFAULT 0,
  mitigation_success_count INTEGER DEFAULT 0,

  -- Calculated scores (updated via trigger)
  accuracy_score INTEGER DEFAULT 50 CHECK (accuracy_score >= 0 AND accuracy_score <= 100),
  -- Formula: (confirmed_matches / total_matches) * 100

  relevance_score INTEGER DEFAULT 50 CHECK (relevance_score >= 0 AND relevance_score <= 100),
  -- Formula: Based on recency and frequency

  health_score INTEGER DEFAULT 50 CHECK (health_score >= 0 AND health_score <= 100),
  -- Formula: (accuracy_score * 0.4) + (relevance_score * 0.3) + (effectiveness_score * 0.3)

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(pattern_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pattern_metrics_health ON pattern_usage_metrics(health_score);
CREATE INDEX IF NOT EXISTS idx_pattern_metrics_last_match ON pattern_usage_metrics(last_matched_at);
CREATE INDEX IF NOT EXISTS idx_pattern_metrics_accuracy ON pattern_usage_metrics(accuracy_score);

-- ============================================
-- Table: pattern_match_events
-- ============================================
CREATE TABLE IF NOT EXISTS pattern_match_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  pattern_id VARCHAR(20) NOT NULL,

  -- Match context
  venture_id UUID, -- Optional link to venture
  postmortem_id UUID, -- Optional link to postmortem

  -- Match details
  match_type VARCHAR(20) DEFAULT 'auto' CHECK (match_type IN ('auto', 'manual', 'suggested')),
  match_confidence INTEGER DEFAULT 50 CHECK (match_confidence >= 0 AND match_confidence <= 100),

  -- Outcome tracking
  outcome VARCHAR(20) CHECK (outcome IN ('confirmed', 'false_positive', 'pending', 'disputed')),
  outcome_notes TEXT,
  outcome_recorded_at TIMESTAMPTZ,
  outcome_recorded_by TEXT,

  -- Prevention/Mitigation tracking
  prevention_applied BOOLEAN DEFAULT FALSE,
  prevention_effective BOOLEAN,
  mitigation_applied BOOLEAN DEFAULT FALSE,
  mitigation_effective BOOLEAN,

  -- Metadata
  matched_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'SYSTEM'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_match_events_pattern ON pattern_match_events(pattern_id);
CREATE INDEX IF NOT EXISTS idx_match_events_outcome ON pattern_match_events(outcome);
CREATE INDEX IF NOT EXISTS idx_match_events_date ON pattern_match_events(matched_at);

-- ============================================
-- Function: Calculate pattern health score
-- ============================================
CREATE OR REPLACE FUNCTION calculate_pattern_health(p_pattern_id VARCHAR(20))
RETURNS TABLE (
  accuracy_score INTEGER,
  relevance_score INTEGER,
  effectiveness_score INTEGER,
  health_score INTEGER,
  deprecation_risk VARCHAR(20)
) AS $$
DECLARE
  v_total_matches INTEGER;
  v_confirmed INTEGER;
  v_false_positives INTEGER;
  v_last_match TIMESTAMPTZ;
  v_prevention_success INTEGER;
  v_mitigation_success INTEGER;
  v_accuracy INTEGER;
  v_relevance INTEGER;
  v_effectiveness INTEGER;
  v_health INTEGER;
BEGIN
  -- Get metrics
  SELECT
    COALESCE(pum.total_matches, 0),
    COALESCE(pum.confirmed_matches, 0),
    COALESCE(pum.false_positives, 0),
    pum.last_matched_at,
    COALESCE(pum.prevention_success_count, 0),
    COALESCE(pum.mitigation_success_count, 0)
  INTO v_total_matches, v_confirmed, v_false_positives, v_last_match, v_prevention_success, v_mitigation_success
  FROM pattern_usage_metrics pum
  WHERE pum.pattern_id = p_pattern_id;

  -- Calculate accuracy score
  IF v_total_matches > 0 THEN
    v_accuracy := ROUND((v_confirmed::DECIMAL / v_total_matches) * 100)::INTEGER;
  ELSE
    v_accuracy := 50; -- Default for new patterns
  END IF;

  -- Calculate relevance score (based on recency)
  IF v_last_match IS NULL THEN
    v_relevance := 30; -- Never matched
  ELSIF v_last_match > NOW() - INTERVAL '30 days' THEN
    v_relevance := 100; -- Recent
  ELSIF v_last_match > NOW() - INTERVAL '90 days' THEN
    v_relevance := 70; -- Somewhat recent
  ELSIF v_last_match > NOW() - INTERVAL '180 days' THEN
    v_relevance := 40; -- Getting stale
  ELSE
    v_relevance := 20; -- Stale
  END IF;

  -- Calculate effectiveness score
  IF v_confirmed > 0 THEN
    v_effectiveness := ROUND(((v_prevention_success + v_mitigation_success)::DECIMAL / v_confirmed) * 100)::INTEGER;
    v_effectiveness := LEAST(100, v_effectiveness); -- Cap at 100
  ELSE
    v_effectiveness := 50; -- Default
  END IF;

  -- Calculate overall health score
  v_health := ROUND(
    (v_accuracy * 0.4) +
    (v_relevance * 0.3) +
    (v_effectiveness * 0.3)
  )::INTEGER;

  -- Return results
  RETURN QUERY SELECT
    v_accuracy,
    v_relevance,
    v_effectiveness,
    v_health,
    CASE
      WHEN v_health < 30 THEN 'high'::VARCHAR(20)
      WHEN v_health < 50 THEN 'medium'::VARCHAR(20)
      WHEN v_health < 70 THEN 'low'::VARCHAR(20)
      ELSE 'none'::VARCHAR(20)
    END;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Function: Update metrics on match event
-- ============================================
CREATE OR REPLACE FUNCTION update_pattern_metrics()
RETURNS TRIGGER AS $$
BEGIN
  -- Upsert metrics record
  INSERT INTO pattern_usage_metrics (pattern_id, total_matches, last_matched_at, first_matched_at)
  VALUES (NEW.pattern_id, 1, NEW.matched_at, NEW.matched_at)
  ON CONFLICT (pattern_id) DO UPDATE SET
    total_matches = pattern_usage_metrics.total_matches + 1,
    last_matched_at = NEW.matched_at,
    matches_last_30_days = (
      SELECT COUNT(*) FROM pattern_match_events
      WHERE pattern_id = NEW.pattern_id
        AND matched_at > NOW() - INTERVAL '30 days'
    ),
    updated_at = NOW();

  -- Update confirmed/false positive counts if outcome is set
  IF NEW.outcome = 'confirmed' THEN
    UPDATE pattern_usage_metrics
    SET
      confirmed_matches = confirmed_matches + 1,
      last_confirmed_at = NEW.outcome_recorded_at,
      confirmations_last_30_days = (
        SELECT COUNT(*) FROM pattern_match_events
        WHERE pattern_id = NEW.pattern_id
          AND outcome = 'confirmed'
          AND outcome_recorded_at > NOW() - INTERVAL '30 days'
      )
    WHERE pattern_id = NEW.pattern_id;
  ELSIF NEW.outcome = 'false_positive' THEN
    UPDATE pattern_usage_metrics
    SET false_positives = false_positives + 1
    WHERE pattern_id = NEW.pattern_id;
  END IF;

  -- Update prevention/mitigation success counts
  IF NEW.prevention_effective = TRUE THEN
    UPDATE pattern_usage_metrics
    SET prevention_success_count = prevention_success_count + 1
    WHERE pattern_id = NEW.pattern_id;
  END IF;

  IF NEW.mitigation_effective = TRUE THEN
    UPDATE pattern_usage_metrics
    SET mitigation_success_count = mitigation_success_count + 1
    WHERE pattern_id = NEW.pattern_id;
  END IF;

  -- Recalculate health scores
  UPDATE pattern_usage_metrics pum
  SET
    accuracy_score = health.accuracy_score,
    relevance_score = health.relevance_score,
    health_score = health.health_score,
    updated_at = NOW()
  FROM calculate_pattern_health(NEW.pattern_id) AS health
  WHERE pum.pattern_id = NEW.pattern_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_pattern_metrics
AFTER INSERT OR UPDATE ON pattern_match_events
FOR EACH ROW EXECUTE FUNCTION update_pattern_metrics();

-- ============================================
-- View: Pattern deprecation candidates
-- ============================================
CREATE OR REPLACE VIEW v_pattern_deprecation_candidates AS
SELECT
  fp.pattern_id,
  fp.pattern_name,
  fp.category,
  fp.lifecycle_status,
  pum.health_score,
  pum.accuracy_score,
  pum.relevance_score,
  pum.total_matches,
  pum.confirmed_matches,
  pum.false_positives,
  pum.last_matched_at,
  -- Deprecation risk assessment
  CASE
    WHEN pum.health_score < 30 THEN 'critical'
    WHEN pum.health_score < 50 THEN 'high'
    WHEN pum.accuracy_score < 40 AND pum.total_matches > 5 THEN 'high'
    WHEN pum.last_matched_at < NOW() - INTERVAL '180 days' THEN 'medium'
    WHEN pum.health_score < 70 THEN 'low'
    ELSE 'none'
  END AS deprecation_risk,
  -- Recommendation
  CASE
    WHEN pum.health_score < 30 THEN 'Archive immediately'
    WHEN pum.health_score < 50 THEN 'Review for deprecation'
    WHEN pum.accuracy_score < 40 AND pum.total_matches > 5 THEN 'Refine detection signals'
    WHEN pum.last_matched_at < NOW() - INTERVAL '180 days' THEN 'Assess continued relevance'
    WHEN pum.health_score < 70 THEN 'Monitor and improve'
    ELSE 'Healthy - no action needed'
  END AS recommendation,
  -- Days since last match
  EXTRACT(DAY FROM NOW() - pum.last_matched_at)::INTEGER AS days_since_last_match
FROM failure_patterns fp
LEFT JOIN pattern_usage_metrics pum ON pum.pattern_id = fp.pattern_id
WHERE fp.lifecycle_status IN ('active', 'deprecated')
ORDER BY
  CASE
    WHEN pum.health_score < 30 THEN 1
    WHEN pum.health_score < 50 THEN 2
    WHEN pum.health_score < 70 THEN 3
    ELSE 4
  END,
  pum.health_score ASC;

-- ============================================
-- View: Pattern health dashboard
-- ============================================
CREATE OR REPLACE VIEW v_pattern_health_dashboard AS
SELECT
  fp.pattern_id,
  fp.pattern_name,
  fp.category,
  fp.lifecycle_status,
  fp.severity,
  COALESCE(pum.health_score, 50) AS health_score,
  COALESCE(pum.accuracy_score, 50) AS accuracy_score,
  COALESCE(pum.relevance_score, 50) AS relevance_score,
  COALESCE(pum.total_matches, 0) AS total_matches,
  COALESCE(pum.confirmed_matches, 0) AS confirmed_matches,
  COALESCE(pum.matches_last_30_days, 0) AS matches_last_30_days,
  pum.last_matched_at,
  -- Health status indicator
  CASE
    WHEN COALESCE(pum.health_score, 50) >= 80 THEN 'excellent'
    WHEN COALESCE(pum.health_score, 50) >= 60 THEN 'good'
    WHEN COALESCE(pum.health_score, 50) >= 40 THEN 'fair'
    WHEN COALESCE(pum.health_score, 50) >= 20 THEN 'poor'
    ELSE 'critical'
  END AS health_status,
  -- Trend indicator (comparing 30-day to overall rate)
  CASE
    WHEN pum.total_matches > 0 AND pum.matches_last_30_days > (pum.total_matches::DECIMAL / 12) THEN 'increasing'
    WHEN pum.total_matches > 0 AND pum.matches_last_30_days < (pum.total_matches::DECIMAL / 24) THEN 'decreasing'
    ELSE 'stable'
  END AS trend
FROM failure_patterns fp
LEFT JOIN pattern_usage_metrics pum ON pum.pattern_id = fp.pattern_id
WHERE fp.status = 'active'
ORDER BY fp.pattern_id;

-- ============================================
-- Initialize metrics for existing patterns
-- ============================================
INSERT INTO pattern_usage_metrics (pattern_id, total_matches, health_score)
SELECT pattern_id, 0, 50
FROM failure_patterns
WHERE NOT EXISTS (
  SELECT 1 FROM pattern_usage_metrics WHERE pattern_usage_metrics.pattern_id = failure_patterns.pattern_id
)
ON CONFLICT (pattern_id) DO NOTHING;

-- ============================================
-- RLS Policies
-- ============================================
ALTER TABLE pattern_usage_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_match_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view usage metrics"
ON pattern_usage_metrics FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role manages usage metrics"
ON pattern_usage_metrics FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can view match events"
ON pattern_match_events FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create match events"
ON pattern_match_events FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update match outcomes"
ON pattern_match_events FOR UPDATE TO authenticated
USING (outcome IS NULL OR outcome = 'pending')
WITH CHECK (true);

CREATE POLICY "Service role manages match events"
ON pattern_match_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON pattern_usage_metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE ON pattern_match_events TO authenticated;
GRANT SELECT ON v_pattern_deprecation_candidates TO authenticated;
GRANT SELECT ON v_pattern_health_dashboard TO authenticated;
