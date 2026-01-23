-- Phase 5: Anti-Bloat System Database Objects
-- SD-LEO-SELF-IMPROVE-BLOAT-001
--
-- Creates views and tables for pipeline health monitoring:
-- - v_protocol_size: Token budget tracking
-- - v_improvement_pipeline: Pipeline analytics
-- - improvement_rejection_reasons: Rejection tracking table

-- ============================================================
-- TABLE: improvement_rejection_reasons
-- Tracks rejected improvements with categorized reasons
-- ============================================================

CREATE TABLE IF NOT EXISTS improvement_rejection_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  improvement_id TEXT,
  category TEXT NOT NULL,
  decision TEXT,
  score INTEGER DEFAULT 0,
  safety_score INTEGER DEFAULT 0,
  tier TEXT,
  rule TEXT,
  human_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying by improvement and category
CREATE INDEX IF NOT EXISTS idx_rejection_reasons_improvement_id
  ON improvement_rejection_reasons(improvement_id);
CREATE INDEX IF NOT EXISTS idx_rejection_reasons_category
  ON improvement_rejection_reasons(category);
CREATE INDEX IF NOT EXISTS idx_rejection_reasons_created_at
  ON improvement_rejection_reasons(created_at DESC);

-- RLS policies
ALTER TABLE improvement_rejection_reasons ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role can manage rejection reasons"
  ON improvement_rejection_reasons
  FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE improvement_rejection_reasons IS
  'Tracks rejected improvements with categorized reasons for learning and threshold tuning';


-- ============================================================
-- VIEW: v_protocol_size
-- Tracks approximate token usage across protocol sections
-- ============================================================

CREATE OR REPLACE VIEW v_protocol_size AS
SELECT
  COUNT(*) AS total_sections,
  -- Approximate tokens: ~4 chars per token, includes content and metadata
  COALESCE(
    SUM(
      COALESCE(LENGTH(content), 0) +
      COALESCE(LENGTH(title), 0) * 2 +  -- Titles weighted higher
      COALESCE(LENGTH(target_file), 0)
    ) / 4,
    0
  )::INTEGER AS approx_tokens,
  -- Section breakdown by target file
  COUNT(*) FILTER (WHERE target_file LIKE '%CLAUDE_CORE%') AS core_sections,
  COUNT(*) FILTER (WHERE target_file LIKE '%CLAUDE_LEAD%') AS lead_sections,
  COUNT(*) FILTER (WHERE target_file LIKE '%CLAUDE_PLAN%') AS plan_sections,
  COUNT(*) FILTER (WHERE target_file LIKE '%CLAUDE_EXEC%') AS exec_sections,
  -- Active vs inactive
  COUNT(*) FILTER (WHERE is_active = true) AS active_sections,
  COUNT(*) FILTER (WHERE is_active = false) AS inactive_sections,
  -- Size metrics
  AVG(LENGTH(content))::INTEGER AS avg_content_length,
  MAX(LENGTH(content))::INTEGER AS max_content_length,
  -- Last update
  MAX(updated_at) AS last_updated
FROM leo_protocol_sections
WHERE is_active = true;

COMMENT ON VIEW v_protocol_size IS
  'Tracks approximate token usage and section distribution for bloat monitoring';


-- ============================================================
-- VIEW: v_domain_activity
-- Tracks which domains/tables are most active
-- ============================================================

CREATE OR REPLACE VIEW v_domain_activity AS
SELECT
  target_table,
  COUNT(*) AS total_operations,
  COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
  COUNT(*) FILTER (WHERE status = 'approved') AS approved_count,
  COUNT(*) FILTER (WHERE status = 'rejected') AS rejected_count,
  COUNT(*) FILTER (WHERE status = 'applied') AS applied_count,
  AVG(CASE WHEN overall_score IS NOT NULL THEN overall_score ELSE 0 END)::INTEGER AS avg_score,
  MAX(created_at) AS last_activity,
  -- Calculate approval rate
  CASE
    WHEN COUNT(*) FILTER (WHERE status IN ('approved', 'rejected')) > 0 THEN
      ROUND(
        COUNT(*) FILTER (WHERE status = 'approved')::NUMERIC /
        COUNT(*) FILTER (WHERE status IN ('approved', 'rejected'))::NUMERIC * 100
      )::INTEGER
    ELSE 100
  END AS approval_rate
FROM protocol_improvement_queue
GROUP BY target_table
ORDER BY total_operations DESC;

COMMENT ON VIEW v_domain_activity IS
  'Tracks improvement activity by target table for domain analysis';


-- ============================================================
-- VIEW: v_improvement_pipeline
-- Aggregates improvements with assessments and resolutions
-- ============================================================

CREATE OR REPLACE VIEW v_improvement_pipeline AS
SELECT
  piq.id AS improvement_id,
  piq.improvement_type,
  piq.target_table,
  piq.target_operation,
  piq.status AS improvement_status,
  piq.overall_score,
  piq.safety_score,
  piq.created_at AS improvement_created,
  -- Assessment info (if exists)
  iqa.id AS assessment_id,
  iqa.overall_score AS assessed_score,
  iqa.safety_score AS assessed_safety,
  iqa.recommendation,
  iqa.confidence,
  iqa.eligibility_decision,
  iqa.classification_tier,
  iqa.classification_rule,
  iqa.created_at AS assessed_at,
  -- Rejection info (if exists)
  irr.id AS rejection_id,
  irr.category AS rejection_category,
  irr.human_reason AS rejection_reason,
  irr.created_at AS rejected_at,
  -- Pipeline stage
  CASE
    WHEN piq.status = 'applied' THEN 'COMPLETED'
    WHEN irr.id IS NOT NULL THEN 'REJECTED'
    WHEN iqa.eligibility_decision = 'ELIGIBLE' THEN 'READY_FOR_APPLY'
    WHEN iqa.id IS NOT NULL THEN 'ASSESSED'
    ELSE 'PENDING'
  END AS pipeline_stage,
  -- Time in pipeline
  EXTRACT(EPOCH FROM (NOW() - piq.created_at)) / 3600 AS hours_in_pipeline
FROM protocol_improvement_queue piq
LEFT JOIN improvement_quality_assessments iqa
  ON piq.id = iqa.improvement_id
LEFT JOIN improvement_rejection_reasons irr
  ON piq.id = irr.improvement_id
ORDER BY piq.created_at DESC;

COMMENT ON VIEW v_improvement_pipeline IS
  'Aggregated view of improvements with their assessments and rejection reasons';


-- ============================================================
-- VIEW: v_pipeline_health
-- Real-time pipeline health metrics
-- ============================================================

CREATE OR REPLACE VIEW v_pipeline_health AS
SELECT
  -- Overall counts
  COUNT(*) AS total_improvements,
  COUNT(*) FILTER (WHERE improvement_status = 'pending') AS pending_count,
  COUNT(*) FILTER (WHERE improvement_status = 'approved') AS approved_count,
  COUNT(*) FILTER (WHERE improvement_status = 'rejected') AS rejected_count,
  COUNT(*) FILTER (WHERE improvement_status = 'applied') AS applied_count,

  -- Approval rate
  CASE
    WHEN COUNT(*) FILTER (WHERE improvement_status IN ('approved', 'rejected')) > 0 THEN
      ROUND(
        COUNT(*) FILTER (WHERE improvement_status = 'approved')::NUMERIC /
        COUNT(*) FILTER (WHERE improvement_status IN ('approved', 'rejected'))::NUMERIC * 100
      )::INTEGER
    ELSE 100
  END AS approval_rate,

  -- Score metrics
  AVG(overall_score) FILTER (WHERE overall_score IS NOT NULL)::INTEGER AS avg_score,
  AVG(assessed_safety) FILTER (WHERE assessed_safety IS NOT NULL)::INTEGER AS avg_safety,

  -- Rejection breakdown
  COUNT(*) FILTER (WHERE rejection_category = 'low_score') AS rejected_low_score,
  COUNT(*) FILTER (WHERE rejection_category = 'low_safety') AS rejected_low_safety,
  COUNT(*) FILTER (WHERE rejection_category = 'tier_mismatch') AS rejected_tier_mismatch,
  COUNT(*) FILTER (WHERE rejection_category = 'human_override') AS rejected_human_override,

  -- Pipeline throughput (last 24h)
  COUNT(*) FILTER (WHERE improvement_created > NOW() - INTERVAL '24 hours') AS created_24h,
  COUNT(*) FILTER (WHERE assessed_at > NOW() - INTERVAL '24 hours') AS assessed_24h,
  COUNT(*) FILTER (WHERE improvement_status = 'applied' AND improvement_created > NOW() - INTERVAL '24 hours') AS applied_24h,

  -- Health status
  CASE
    WHEN COUNT(*) FILTER (WHERE improvement_status IN ('approved', 'rejected')) = 0 THEN 'NO_DATA'
    WHEN ROUND(
        COUNT(*) FILTER (WHERE improvement_status = 'approved')::NUMERIC /
        NULLIF(COUNT(*) FILTER (WHERE improvement_status IN ('approved', 'rejected')), 0)::NUMERIC * 100
      ) < 60 THEN 'WARNING'
    ELSE 'HEALTHY'
  END AS health_status,

  NOW() AS calculated_at
FROM v_improvement_pipeline;

COMMENT ON VIEW v_pipeline_health IS
  'Real-time pipeline health metrics for monitoring and alerting';


-- ============================================================
-- GRANT permissions
-- ============================================================

GRANT SELECT ON v_protocol_size TO authenticated;
GRANT SELECT ON v_domain_activity TO authenticated;
GRANT SELECT ON v_improvement_pipeline TO authenticated;
GRANT SELECT ON v_pipeline_health TO authenticated;
GRANT ALL ON improvement_rejection_reasons TO authenticated;
