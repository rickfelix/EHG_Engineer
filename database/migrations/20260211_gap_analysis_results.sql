-- Migration: Post-Completion Integration Gap Detector - gap_analysis_results table
-- SD: SD-LEO-FEAT-INTEGRATION-GAP-DETECTOR-001
-- Created: 2026-02-11
-- Purpose: Store findings from gap analysis runs (completion, retroactive, manual)
-- FIX: Changed prd_id from UUID to TEXT to match product_requirements_v2.id schema

-- ============================================================================
-- TABLE: gap_analysis_results
-- ============================================================================
-- Stores integration gap analysis results comparing PRD requirements against
-- actual implementation. Supports completion-time analysis and retroactive
-- audits of historical SDs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS gap_analysis_results (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign key relationships
  sd_key TEXT NOT NULL REFERENCES strategic_directives_v2(sd_key) ON DELETE CASCADE,
  prd_id TEXT REFERENCES product_requirements_v2(id) ON DELETE SET NULL,

  -- Analysis metadata
  analysis_type TEXT NOT NULL CHECK (analysis_type IN ('completion', 'retroactive', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'gap-detector',

  -- Requirement coverage metrics
  total_requirements INTEGER NOT NULL CHECK (total_requirements >= 0),
  matched_requirements INTEGER NOT NULL CHECK (matched_requirements >= 0),
  coverage_score NUMERIC(5,2) CHECK (coverage_score IS NULL OR (coverage_score >= 0 AND coverage_score <= 100)),

  -- Gap findings (JSONB array)
  -- Format: [
  --   {
  --     requirement_id: "FR-001",
  --     requirement_text: "User can...",
  --     gap_type: "missing" | "partial" | "incorrect",
  --     severity: "critical" | "high" | "medium" | "low",
  --     root_cause_category: "scope_creep" | "miscommunication" | "technical_debt" | etc,
  --     evidence: "No code found in...",
  --     corrective_sd_key: "SD-XXX-001" (if created)
  --   }
  -- ]
  gap_findings JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- False positive tracking
  false_positive_count INTEGER NOT NULL DEFAULT 0 CHECK (false_positive_count >= 0),

  -- Corrective actions
  corrective_sds_created TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Analysis execution metadata (JSONB)
  -- Format: {
  --   timing: { start: ISO8601, end: ISO8601, duration_ms: 1234 },
  --   git_range: { from_commit: "abc123", to_commit: "def456" },
  --   files_analyzed: 42,
  --   analyzer_version: "1.0.0",
  --   model_used: "claude-sonnet-4-5",
  --   confidence_threshold: 0.75
  -- }
  analysis_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Constraints
  CONSTRAINT matched_lte_total CHECK (matched_requirements <= total_requirements),
  CONSTRAINT gap_findings_is_array CHECK (jsonb_typeof(gap_findings) = 'array'),
  CONSTRAINT corrective_sds_non_null CHECK (corrective_sds_created IS NOT NULL)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Primary query patterns
CREATE INDEX IF NOT EXISTS idx_gap_analysis_sd_key ON gap_analysis_results(sd_key);
CREATE INDEX IF NOT EXISTS idx_gap_analysis_prd_id ON gap_analysis_results(prd_id) WHERE prd_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gap_analysis_type ON gap_analysis_results(analysis_type);
CREATE INDEX IF NOT EXISTS idx_gap_analysis_created_at ON gap_analysis_results(created_at DESC);

-- Coverage score filtering (find SDs with low coverage)
CREATE INDEX IF NOT EXISTS idx_gap_analysis_coverage ON gap_analysis_results(coverage_score) WHERE coverage_score < 90;

-- Gap severity analysis (GIN index for JSONB queries)
CREATE INDEX IF NOT EXISTS idx_gap_analysis_findings_gin ON gap_analysis_results USING GIN(gap_findings);

-- Corrective SD tracking
CREATE INDEX IF NOT EXISTS idx_gap_analysis_corrective_sds ON gap_analysis_results USING GIN(corrective_sds_created);

-- Composite index for time-series analysis by type
CREATE INDEX IF NOT EXISTS idx_gap_analysis_type_created ON gap_analysis_results(analysis_type, created_at DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE gap_analysis_results ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS service_role_all_gap_analysis ON gap_analysis_results;
DROP POLICY IF EXISTS authenticated_read_gap_analysis ON gap_analysis_results;
DROP POLICY IF EXISTS anon_read_gap_analysis ON gap_analysis_results;

-- Service role: full access (CLI scripts use SERVICE_ROLE_KEY)
CREATE POLICY service_role_all_gap_analysis
  ON gap_analysis_results
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users: read-only access (dashboard views)
CREATE POLICY authenticated_read_gap_analysis
  ON gap_analysis_results
  FOR SELECT
  TO authenticated
  USING (true);

-- Anon users: read-only access (public dashboards)
CREATE POLICY anon_read_gap_analysis
  ON gap_analysis_results
  FOR SELECT
  TO anon
  USING (true);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update timestamp on modification
CREATE OR REPLACE FUNCTION update_gap_analysis_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.created_at = OLD.created_at; -- Prevent created_at modification
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: We don't add updated_at column as gap analysis results are immutable once created
-- If updates are needed, insert a new record with updated findings

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get latest gap analysis for an SD
CREATE OR REPLACE FUNCTION get_latest_gap_analysis(p_sd_key TEXT)
RETURNS gap_analysis_results AS $$
  SELECT *
  FROM gap_analysis_results
  WHERE sd_key = p_sd_key
  ORDER BY created_at DESC
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Function to get gap analysis summary by type
CREATE OR REPLACE FUNCTION get_gap_analysis_summary(p_analysis_type TEXT DEFAULT NULL)
RETURNS TABLE (
  analysis_type TEXT,
  total_analyses BIGINT,
  avg_coverage_score NUMERIC,
  total_gaps BIGINT,
  avg_gaps_per_sd NUMERIC,
  corrective_sds_created BIGINT
) AS $$
  SELECT
    gar.analysis_type,
    COUNT(*) AS total_analyses,
    ROUND(AVG(gar.coverage_score), 2) AS avg_coverage_score,
    SUM(jsonb_array_length(gar.gap_findings)) AS total_gaps,
    ROUND(AVG(jsonb_array_length(gar.gap_findings)), 2) AS avg_gaps_per_sd,
    SUM(array_length(gar.corrective_sds_created, 1)) AS corrective_sds_created
  FROM gap_analysis_results gar
  WHERE p_analysis_type IS NULL OR gar.analysis_type = p_analysis_type
  GROUP BY gar.analysis_type
  ORDER BY gar.analysis_type;
$$ LANGUAGE SQL STABLE;

-- Function to get SDs with critical gaps
CREATE OR REPLACE FUNCTION get_sds_with_critical_gaps()
RETURNS TABLE (
  sd_key TEXT,
  coverage_score NUMERIC,
  critical_gap_count BIGINT,
  high_gap_count BIGINT,
  latest_analysis_date TIMESTAMPTZ
) AS $$
  SELECT
    gar.sd_key,
    gar.coverage_score,
    (
      SELECT COUNT(*)
      FROM jsonb_array_elements(gar.gap_findings) AS gap
      WHERE gap->>'severity' = 'critical'
    ) AS critical_gap_count,
    (
      SELECT COUNT(*)
      FROM jsonb_array_elements(gar.gap_findings) AS gap
      WHERE gap->>'severity' = 'high'
    ) AS high_gap_count,
    gar.created_at AS latest_analysis_date
  FROM gap_analysis_results gar
  WHERE (
    SELECT COUNT(*)
    FROM jsonb_array_elements(gar.gap_findings) AS gap
    WHERE gap->>'severity' IN ('critical', 'high')
  ) > 0
  ORDER BY critical_gap_count DESC, high_gap_count DESC, gar.coverage_score ASC;
$$ LANGUAGE SQL STABLE;

-- ============================================================================
-- COMMENTS (for documentation)
-- ============================================================================

COMMENT ON TABLE gap_analysis_results IS 'Stores integration gap analysis results comparing PRD requirements against actual implementation. Part of SD-LEO-FEAT-INTEGRATION-GAP-DETECTOR-001.';

COMMENT ON COLUMN gap_analysis_results.sd_key IS 'Strategic Directive being analyzed (FK to strategic_directives_v2.sd_key)';
COMMENT ON COLUMN gap_analysis_results.prd_id IS 'Optional FK to product_requirements_v2.id if PRD exists (TEXT type to match product_requirements_v2.id schema)';
COMMENT ON COLUMN gap_analysis_results.analysis_type IS 'Type of analysis: completion (post-EXEC), retroactive (historical audit), manual (human-initiated)';
COMMENT ON COLUMN gap_analysis_results.total_requirements IS 'Total number of requirements in PRD (functional + non-functional + technical)';
COMMENT ON COLUMN gap_analysis_results.matched_requirements IS 'Number of requirements verified in implementation';
COMMENT ON COLUMN gap_analysis_results.coverage_score IS 'Percentage of requirements matched (0-100). Formula: (matched / total) * 100';
COMMENT ON COLUMN gap_analysis_results.gap_findings IS 'JSONB array of gap findings with requirement_id, gap_type, severity, root_cause, evidence, and corrective_sd_key';
COMMENT ON COLUMN gap_analysis_results.false_positive_count IS 'Number of findings marked as false positives after human review';
COMMENT ON COLUMN gap_analysis_results.corrective_sds_created IS 'Array of SD keys created to address gaps found in this analysis';
COMMENT ON COLUMN gap_analysis_results.analysis_metadata IS 'JSONB metadata: timing, git_range, files_analyzed, analyzer_version, model_used, confidence_threshold';

COMMENT ON FUNCTION get_latest_gap_analysis(TEXT) IS 'Retrieve most recent gap analysis for a given SD key';
COMMENT ON FUNCTION get_gap_analysis_summary(TEXT) IS 'Get aggregated gap analysis metrics by analysis type';
COMMENT ON FUNCTION get_sds_with_critical_gaps() IS 'List SDs with critical or high severity gaps requiring immediate attention';
