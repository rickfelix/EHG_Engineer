-- Migration: Create eva_interactions table for Data Flywheel
-- SD: SD-LEO-FEAT-DATA-FLYWHEEL-001
-- Date: 2026-02-22
-- Description: Core table for capturing all EVA chairman-system interactions,
--   enabling closed-loop learning and cross-venture pattern detection.
--   Also creates 3 analytics views and 1 summary function.

-- ============================================================
-- 1. CREATE TABLE: eva_interactions
-- ============================================================
CREATE TABLE IF NOT EXISTS eva_interactions (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Structured columns (indexed query targets)
  decision_type TEXT NOT NULL CHECK (decision_type IN (
    'gate_event', 'recommendation', 'directive_decision',
    'venture_stage_transition', 'kill_gate', 'resource_allocation',
    'priority_override', 'scope_change', 'risk_escalation'
  )),

  chairman_action TEXT CHECK (chairman_action IN (
    'accepted', 'modified', 'rejected', 'deferred', 'escalated'
  )),

  gate_score NUMERIC CHECK (gate_score >= 0 AND gate_score <= 100),

  confidence_score NUMERIC CHECK (confidence_score >= 0 AND confidence_score <= 100),

  -- Foreign keys
  -- NOTE: strategic_directives_v2.id is VARCHAR(50), not UUID
  sd_id VARCHAR(50) REFERENCES strategic_directives_v2(id) ON DELETE SET NULL,

  venture_id UUID REFERENCES ventures(id) ON DELETE SET NULL,

  session_id TEXT REFERENCES claude_sessions(session_id) ON DELETE SET NULL,

  -- Self-referential FK for decision chains
  parent_interaction_id UUID REFERENCES eva_interactions(id) ON DELETE SET NULL,

  -- Categorization
  interaction_type TEXT NOT NULL CHECK (interaction_type IN (
    'handoff_gate', 'quality_assessment', 'sd_creation',
    'pattern_detection', 'learning_decision'
  )),

  -- JSONB columns (extensible)
  context JSONB DEFAULT '{}'::jsonb CHECK (jsonb_typeof(context) = 'object'),
  recommendation JSONB DEFAULT '{}'::jsonb,
  outcome_details JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  input_context JSONB DEFAULT '{}'::jsonb,
  output_decision JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. COMMENTS
-- ============================================================
COMMENT ON TABLE eva_interactions IS 'Core table capturing all EVA chairman-system interactions for closed-loop learning (SD-LEO-FEAT-DATA-FLYWHEEL-001)';
COMMENT ON COLUMN eva_interactions.decision_type IS 'Category of the decision being made';
COMMENT ON COLUMN eva_interactions.chairman_action IS 'What the chairman decided (NULL if pending or system-only)';
COMMENT ON COLUMN eva_interactions.gate_score IS 'Score from gate evaluation (0-100)';
COMMENT ON COLUMN eva_interactions.confidence_score IS 'System confidence in its recommendation (0-100)';
COMMENT ON COLUMN eva_interactions.sd_id IS 'FK to strategic_directives_v2(id) - VARCHAR(50), not UUID';
COMMENT ON COLUMN eva_interactions.parent_interaction_id IS 'Self-referential FK for decision chains';
COMMENT ON COLUMN eva_interactions.interaction_type IS 'Categorization for analytics grouping';
COMMENT ON COLUMN eva_interactions.context IS 'Extensible context data for the interaction';
COMMENT ON COLUMN eva_interactions.recommendation IS 'System recommendation details';
COMMENT ON COLUMN eva_interactions.outcome_details IS 'Outcome after chairman action';
COMMENT ON COLUMN eva_interactions.metadata IS 'Arbitrary metadata for extensibility';
COMMENT ON COLUMN eva_interactions.input_context IS 'Input context snapshot for ML training';
COMMENT ON COLUMN eva_interactions.output_decision IS 'Output decision snapshot for ML training';

-- ============================================================
-- 3. INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_eva_interactions_sd_id ON eva_interactions(sd_id);
CREATE INDEX IF NOT EXISTS idx_eva_interactions_venture_id ON eva_interactions(venture_id);
CREATE INDEX IF NOT EXISTS idx_eva_interactions_interaction_type ON eva_interactions(interaction_type);
CREATE INDEX IF NOT EXISTS idx_eva_interactions_created_at ON eva_interactions(created_at);
CREATE INDEX IF NOT EXISTS idx_eva_interactions_decision_type ON eva_interactions(decision_type);

-- ============================================================
-- 4. TRIGGER: updated_at auto-update
-- ============================================================
CREATE TRIGGER update_eva_interactions_updated_at
  BEFORE UPDATE ON eva_interactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 5. VIEW: v_flywheel_velocity
--    Weekly interaction counts and closure rates
-- ============================================================
CREATE OR REPLACE VIEW v_flywheel_velocity AS
SELECT
  date_trunc('week', created_at) AS week_start,
  venture_id,
  COUNT(*) AS total_interactions,
  COUNT(*) FILTER (WHERE outcome_details IS NOT NULL AND outcome_details != '{}'::jsonb) AS closed_loop_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE outcome_details IS NOT NULL AND outcome_details != '{}'::jsonb) / NULLIF(COUNT(*), 0), 1) AS closure_rate_pct,
  CASE WHEN COUNT(*) < 5 THEN 'LOW_COVERAGE' ELSE 'ADEQUATE' END AS coverage_status
FROM eva_interactions
GROUP BY date_trunc('week', created_at), venture_id
ORDER BY week_start DESC;

-- ============================================================
-- 6. VIEW: v_cross_venture_patterns
--    Common patterns across ventures
-- ============================================================
CREATE OR REPLACE VIEW v_cross_venture_patterns AS
SELECT
  decision_type,
  COUNT(DISTINCT venture_id) AS ventures_affected,
  COUNT(*) AS total_occurrences,
  ROUND(100.0 * COUNT(*) FILTER (WHERE chairman_action = 'accepted') / NULLIF(COUNT(*), 0), 1) AS acceptance_rate_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE chairman_action = 'rejected') / NULLIF(COUNT(*), 0), 1) AS rejection_rate_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE chairman_action = 'modified') / NULLIF(COUNT(*), 0), 1) AS modification_rate_pct,
  ROUND(AVG(gate_score), 1) AS avg_gate_score,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gate_score) AS median_gate_score
FROM eva_interactions
WHERE chairman_action IS NOT NULL
GROUP BY decision_type
HAVING COUNT(*) >= 3
ORDER BY total_occurrences DESC;

-- ============================================================
-- 7. VIEW: v_eva_accuracy
--    Chairman action distribution with 30-day trends
-- ============================================================
CREATE OR REPLACE VIEW v_eva_accuracy AS
SELECT
  decision_type,
  chairman_action,
  COUNT(*) AS total_count,
  ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (PARTITION BY decision_type), 0), 1) AS pct_of_decision_type,
  ROUND(AVG(gate_score), 1) AS avg_gate_score,
  ROUND(AVG(confidence_score), 1) AS avg_confidence,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS count_last_30d,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '60 days' AND created_at < NOW() - INTERVAL '30 days') AS count_prior_30d
FROM eva_interactions
WHERE chairman_action IS NOT NULL
GROUP BY decision_type, chairman_action
ORDER BY decision_type, total_count DESC;

-- ============================================================
-- 8. FUNCTION: fn_flywheel_summary
--    Returns JSONB summary with weekly metrics
-- ============================================================
CREATE OR REPLACE FUNCTION fn_flywheel_summary(
  p_venture_id UUID DEFAULT NULL,
  p_weeks_back INT DEFAULT 4
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'generated_at', NOW(),
    'weeks_back', p_weeks_back,
    'venture_id', p_venture_id,
    'weekly_metrics', COALESCE((
      SELECT jsonb_agg(row_to_json(v.*) ORDER BY v.week_start DESC)
      FROM v_flywheel_velocity v
      WHERE v.week_start >= NOW() - (p_weeks_back || ' weeks')::INTERVAL
        AND (p_venture_id IS NULL OR v.venture_id = p_venture_id)
    ), '[]'::jsonb),
    'total_interactions', (
      SELECT COUNT(*) FROM eva_interactions
      WHERE created_at >= NOW() - (p_weeks_back || ' weeks')::INTERVAL
        AND (p_venture_id IS NULL OR venture_id = p_venture_id)
    ),
    'unique_ventures', (
      SELECT COUNT(DISTINCT venture_id) FROM eva_interactions
      WHERE created_at >= NOW() - (p_weeks_back || ' weeks')::INTERVAL
        AND (p_venture_id IS NULL OR venture_id = p_venture_id)
    )
  ) INTO result;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION fn_flywheel_summary IS 'Returns JSONB summary of flywheel velocity metrics for a given venture and time window';

-- ============================================================
-- ROLLBACK (manual - uncomment to use)
-- ============================================================
-- DROP FUNCTION IF EXISTS fn_flywheel_summary;
-- DROP VIEW IF EXISTS v_eva_accuracy;
-- DROP VIEW IF EXISTS v_cross_venture_patterns;
-- DROP VIEW IF EXISTS v_flywheel_velocity;
-- DROP TRIGGER IF EXISTS update_eva_interactions_updated_at ON eva_interactions;
-- DROP TABLE IF EXISTS eva_interactions;
