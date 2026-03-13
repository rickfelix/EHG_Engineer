-- Migration: Discovery Strategy Performance Scoring
-- SD: SD-LEO-FEAT-DISCOVERY-STRATEGY-PERFORMANCE-001
-- Purpose: RPC function to aggregate discovery strategy performance from gate outcomes
--
-- Composite score formula: 70% gate pass rate + 30% normalized average score (score/10)
-- Excludes simulated/synthetic ventures and cancelled/archived ventures

CREATE OR REPLACE FUNCTION get_discovery_strategy_scores()
RETURNS TABLE (
  strategy TEXT,
  venture_count BIGINT,
  total_outcomes BIGINT,
  pass_count BIGINT,
  pass_rate NUMERIC,
  avg_score NUMERIC,
  composite_score NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.metadata->'stage_zero'->'origin_metadata'->>'discovery_strategy' AS strategy,
    COUNT(DISTINCT v.id) AS venture_count,
    COUNT(epo.id) AS total_outcomes,
    COUNT(CASE WHEN epo.signal_type = 'pass' THEN 1 END) AS pass_count,
    ROUND(
      COUNT(CASE WHEN epo.signal_type = 'pass' THEN 1 END)::NUMERIC
      / NULLIF(COUNT(epo.id), 0), 3
    ) AS pass_rate,
    ROUND(AVG((epo.outcome->>'score')::NUMERIC), 2) AS avg_score,
    ROUND(
      0.7 * (COUNT(CASE WHEN epo.signal_type = 'pass' THEN 1 END)::NUMERIC
             / NULLIF(COUNT(epo.id), 0))
      + 0.3 * (AVG((epo.outcome->>'score')::NUMERIC) / 10.0),
    3) AS composite_score
  FROM ventures v
  JOIN evaluation_profile_outcomes epo ON epo.venture_id = v.id
  WHERE v.metadata->'stage_zero'->'origin_metadata'->>'discovery_strategy' IS NOT NULL
    AND v.status NOT IN ('cancelled', 'archived')
    AND (epo.outcome->>'simulated')::BOOLEAN IS DISTINCT FROM TRUE
  GROUP BY v.metadata->'stage_zero'->'origin_metadata'->>'discovery_strategy';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_discovery_strategy_scores() TO authenticated;

COMMENT ON FUNCTION get_discovery_strategy_scores() IS
  'Aggregates discovery strategy performance from evaluation gate outcomes. Returns pass rate, avg score, and composite score per strategy. Used by DiscoveryModeDialog star ratings.';
