-- AI Quality Assessments Table
-- Purpose: Store all AI-powered quality assessments for meta-analysis
-- Created: 2025-12-05
-- Uses: gpt-4o-mini for cost-effective Russian Judge quality scoring

-- ============================================================================
-- MAIN TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_quality_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Content identification (polymorphic FK)
  content_type TEXT NOT NULL CHECK (content_type IN ('sd', 'prd', 'user_story', 'retrospective')),
  content_id TEXT NOT NULL,

  -- Model configuration
  model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  temperature NUMERIC(3,2) DEFAULT 0.3,

  -- Scoring results
  scores JSONB NOT NULL, -- { "criterion_name": { "score": 0-10, "reasoning": "..." } }
  weighted_score INTEGER NOT NULL CHECK (weighted_score >= 0 AND weighted_score <= 100),

  -- Feedback
  feedback JSONB DEFAULT '{}'::jsonb, -- { "required": [], "recommended": [] }

  -- Performance tracking
  assessed_at TIMESTAMPTZ DEFAULT NOW(),
  assessment_duration_ms INTEGER, -- API call duration
  tokens_used JSONB, -- { "prompt_tokens": 500, "completion_tokens": 200, "total_tokens": 700 }
  cost_usd NUMERIC(10,6), -- Actual cost

  -- Versioning
  rubric_version TEXT DEFAULT 'v1.0.0',

  -- Constraints
  CONSTRAINT unique_assessment_per_content UNIQUE (content_type, content_id, assessed_at)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_ai_assessments_content ON ai_quality_assessments(content_type, content_id);
CREATE INDEX idx_ai_assessments_score ON ai_quality_assessments(weighted_score);
CREATE INDEX idx_ai_assessments_time ON ai_quality_assessments(assessed_at DESC);
CREATE INDEX idx_ai_assessments_model ON ai_quality_assessments(model);
CREATE INDEX idx_ai_assessments_passed ON ai_quality_assessments(content_type, (weighted_score >= 70));

-- ============================================================================
-- VIEWS FOR META-ANALYSIS
-- ============================================================================

-- View 1: Quality Summary by Content Type
CREATE OR REPLACE VIEW v_ai_quality_summary AS
SELECT
  content_type,
  COUNT(*) as total_assessments,
  ROUND(AVG(weighted_score), 1) as avg_score,
  MIN(weighted_score) as min_score,
  MAX(weighted_score) as max_score,
  COUNT(*) FILTER (WHERE weighted_score >= 70) as passed_count,
  COUNT(*) FILTER (WHERE weighted_score < 70) as failed_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE weighted_score >= 70) / NULLIF(COUNT(*), 0), 1) as pass_rate_pct,
  ROUND(SUM(cost_usd)::numeric, 4) as total_cost_usd,
  ROUND(AVG(cost_usd)::numeric, 6) as avg_cost_per_assessment
FROM ai_quality_assessments
GROUP BY content_type
ORDER BY content_type;

-- View 2: Criterion Performance (which criteria score lowest?)
CREATE OR REPLACE VIEW v_criterion_performance AS
SELECT
  content_type,
  jsonb_object_keys(scores) as criterion_name,
  ROUND(AVG((scores->jsonb_object_keys(scores)->>'score')::numeric), 2) as avg_score,
  ROUND(STDDEV((scores->jsonb_object_keys(scores)->>'score')::numeric), 2) as stddev_score,
  MIN((scores->jsonb_object_keys(scores)->>'score')::numeric) as min_score,
  MAX((scores->jsonb_object_keys(scores)->>'score')::numeric) as max_score,
  COUNT(*) as sample_count
FROM ai_quality_assessments
GROUP BY content_type, criterion_name
ORDER BY content_type, avg_score ASC;

-- View 3: Recent Assessments (for debugging)
CREATE OR REPLACE VIEW v_recent_ai_assessments AS
SELECT
  id,
  content_type,
  content_id,
  weighted_score,
  scores,
  feedback,
  assessed_at,
  assessment_duration_ms,
  cost_usd
FROM ai_quality_assessments
ORDER BY assessed_at DESC
LIMIT 100;

-- View 4: Cost Tracking by Day
CREATE OR REPLACE VIEW v_ai_quality_cost_tracking AS
SELECT
  DATE_TRUNC('day', assessed_at) as assessment_date,
  content_type,
  COUNT(*) as assessments_count,
  ROUND(SUM(cost_usd)::numeric, 4) as daily_cost_usd,
  ROUND(AVG(assessment_duration_ms), 0) as avg_duration_ms
FROM ai_quality_assessments
GROUP BY DATE_TRUNC('day', assessed_at), content_type
ORDER BY assessment_date DESC, content_type;

-- View 5: Failing Criteria Analysis
CREATE OR REPLACE VIEW v_failing_criteria_analysis AS
SELECT
  content_type,
  jsonb_object_keys(scores) as criterion_name,
  COUNT(*) FILTER (WHERE (scores->jsonb_object_keys(scores)->>'score')::numeric < 5) as fail_count,
  COUNT(*) as total_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE (scores->jsonb_object_keys(scores)->>'score')::numeric < 5) / NULLIF(COUNT(*), 0), 1) as fail_rate_pct,
  ARRAY_AGG(DISTINCT content_id) FILTER (WHERE (scores->jsonb_object_keys(scores)->>'score')::numeric < 5) as failing_content_ids
FROM ai_quality_assessments
GROUP BY content_type, criterion_name
HAVING COUNT(*) FILTER (WHERE (scores->jsonb_object_keys(scores)->>'score')::numeric < 5) > 0
ORDER BY fail_rate_pct DESC;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE ai_quality_assessments ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all assessments
CREATE POLICY "Allow read for authenticated" ON ai_quality_assessments
  FOR SELECT TO authenticated
  USING (true);

-- Allow service role full access
CREATE POLICY "Allow all for service role" ON ai_quality_assessments
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow anon to read (for public quality dashboards)
CREATE POLICY "Allow read for anon" ON ai_quality_assessments
  FOR SELECT TO anon
  USING (true);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE ai_quality_assessments IS 'AI-powered quality assessments using Russian Judge rubrics (gpt-4o-mini). Stores all quality evaluations for meta-analysis and continuous improvement.';

COMMENT ON COLUMN ai_quality_assessments.content_type IS 'Type of content being assessed: sd, prd, user_story, or retrospective';
COMMENT ON COLUMN ai_quality_assessments.content_id IS 'ID of the content being assessed (polymorphic FK to respective table)';
COMMENT ON COLUMN ai_quality_assessments.scores IS 'JSONB: { "criterion_name": { "score": 0-10, "reasoning": "1 sentence why" } }';
COMMENT ON COLUMN ai_quality_assessments.weighted_score IS 'Weighted average of criterion scores (0-100 scale). Threshold: >= 70 to pass.';
COMMENT ON COLUMN ai_quality_assessments.feedback IS 'JSONB: { "required": ["Fix X"], "recommended": ["Consider Y"] }';
COMMENT ON COLUMN ai_quality_assessments.tokens_used IS 'JSONB: { "prompt_tokens": N, "completion_tokens": N, "total_tokens": N }';
COMMENT ON COLUMN ai_quality_assessments.cost_usd IS 'Actual cost in USD for this assessment (gpt-4o-mini: $0.15/1M input, $0.60/1M output)';

COMMENT ON VIEW v_ai_quality_summary IS 'Summary statistics by content type: pass rates, avg scores, total cost';
COMMENT ON VIEW v_criterion_performance IS 'Identifies which rubric criteria score lowest across all assessments';
COMMENT ON VIEW v_failing_criteria_analysis IS 'Deep dive into which criteria fail most often (score < 5)';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  -- Verify table exists
  IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = 'ai_quality_assessments') THEN
    RAISE EXCEPTION 'Migration failed: ai_quality_assessments table not created';
  END IF;

  -- Verify views exist
  IF NOT EXISTS (SELECT FROM pg_views WHERE viewname = 'v_ai_quality_summary') THEN
    RAISE EXCEPTION 'Migration failed: v_ai_quality_summary view not created';
  END IF;

  RAISE NOTICE '✅ Migration successful: ai_quality_assessments table and 5 views created';
  RAISE NOTICE '   Table: ai_quality_assessments (13 columns)';
  RAISE NOTICE '   Views: v_ai_quality_summary, v_criterion_performance, v_recent_ai_assessments, v_ai_quality_cost_tracking, v_failing_criteria_analysis';
  RAISE NOTICE '   Indexes: 5 indexes created for performance';
  RAISE NOTICE '   RLS: 3 policies enabled (authenticated read, service role full, anon read)';
END $$;
