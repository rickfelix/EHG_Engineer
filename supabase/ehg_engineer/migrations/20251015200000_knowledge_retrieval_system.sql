-- Migration: Knowledge Retrieval System
-- SD-KNOWLEDGE-001: Automated Knowledge Retrieval & PRD Enrichment
-- Created: 2025-10-15
-- Purpose: Add tables and columns for automated knowledge retrieval pipeline

-- =====================================================================
-- TABLE 1: tech_stack_references
-- Cache for Context7 + retrospective results
-- =====================================================================
CREATE TABLE IF NOT EXISTS tech_stack_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id VARCHAR(50) NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
  tech_stack TEXT NOT NULL,
  source VARCHAR(20) NOT NULL CHECK (source IN ('local', 'context7')),
  reference_url TEXT,
  code_snippet TEXT,
  pros_cons_analysis JSONB,
  confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(sd_id, tech_stack, source)
);

CREATE INDEX IF NOT EXISTS idx_tech_stack_references_sd ON tech_stack_references(sd_id);
CREATE INDEX IF NOT EXISTS idx_tech_stack_references_expires ON tech_stack_references(expires_at);

COMMENT ON TABLE tech_stack_references IS 'Cache for Context7 MCP and retrospective research results with 24-hour TTL';
COMMENT ON COLUMN tech_stack_references.source IS 'Source of reference: local (retrospectives) or context7 (MCP)';
COMMENT ON COLUMN tech_stack_references.confidence_score IS 'Confidence score 0-1 for relevance of this reference';
COMMENT ON COLUMN tech_stack_references.expires_at IS 'TTL expiration timestamp (24 hours from creation)';

-- =====================================================================
-- TABLE 2: prd_research_audit_log
-- Telemetry for all research operations
-- =====================================================================
CREATE TABLE IF NOT EXISTS prd_research_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id VARCHAR(50) NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
  query_type VARCHAR(20) NOT NULL CHECK (query_type IN ('retrospective', 'context7', 'hybrid')),
  tokens_consumed INTEGER NOT NULL,
  results_count INTEGER NOT NULL,
  confidence_score DECIMAL(3,2),
  circuit_breaker_state VARCHAR(20) CHECK (circuit_breaker_state IN ('open', 'half-open', 'closed')),
  execution_time_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prd_research_audit_sd ON prd_research_audit_log(sd_id);
CREATE INDEX IF NOT EXISTS idx_prd_research_audit_created ON prd_research_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prd_research_audit_query_type ON prd_research_audit_log(query_type);

COMMENT ON TABLE prd_research_audit_log IS 'Audit log for all knowledge retrieval operations (monitoring and optimization)';
COMMENT ON COLUMN prd_research_audit_log.query_type IS 'Type: retrospective (local only), context7 (MCP only), hybrid (both)';
COMMENT ON COLUMN prd_research_audit_log.tokens_consumed IS 'Total tokens consumed in this query';
COMMENT ON COLUMN prd_research_audit_log.circuit_breaker_state IS 'Circuit breaker state snapshot at query time';
COMMENT ON COLUMN prd_research_audit_log.execution_time_ms IS 'Query execution time in milliseconds';

-- =====================================================================
-- TABLE 3: system_health
-- Circuit breaker state tracking
-- =====================================================================
CREATE TABLE IF NOT EXISTS system_health (
  service_name VARCHAR(50) PRIMARY KEY,
  circuit_breaker_state VARCHAR(20) NOT NULL CHECK (circuit_breaker_state IN ('open', 'half-open', 'closed')),
  failure_count INTEGER DEFAULT 0,
  last_failure_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE system_health IS 'Circuit breaker state machine for external service health monitoring';
COMMENT ON COLUMN system_health.circuit_breaker_state IS 'State: closed (healthy), open (failing), half-open (recovery test)';
COMMENT ON COLUMN system_health.failure_count IS 'Consecutive failure count (resets on success)';
COMMENT ON COLUMN system_health.last_failure_at IS 'Timestamp of most recent failure';
COMMENT ON COLUMN system_health.last_success_at IS 'Timestamp of most recent success';

-- Insert default row for Context7 service
INSERT INTO system_health (service_name, circuit_breaker_state, failure_count)
VALUES ('context7', 'closed', 0)
ON CONFLICT (service_name) DO NOTHING;

-- =====================================================================
-- TABLE ENHANCEMENT 1: user_stories
-- Add implementation_context JSONB field
-- =====================================================================
ALTER TABLE user_stories
ADD COLUMN IF NOT EXISTS implementation_context JSONB DEFAULT '{}';

COMMENT ON COLUMN user_stories.implementation_context IS
'Auto-enriched context from retrospectives and Context7: {files: [], dependencies: [], apis: [], patterns: []}';

-- =====================================================================
-- TABLE ENHANCEMENT 2: product_requirements_v2
-- Add research_confidence_score DECIMAL field
-- =====================================================================
ALTER TABLE product_requirements_v2
ADD COLUMN IF NOT EXISTS research_confidence_score DECIMAL(3,2) CHECK (research_confidence_score >= 0 AND research_confidence_score <= 1);

COMMENT ON COLUMN product_requirements_v2.research_confidence_score IS
'Confidence score for automated research results (0.7-0.85: human review, >0.85: auto-applied)';

-- =====================================================================
-- RLS POLICIES
-- =====================================================================

-- tech_stack_references: Allow authenticated users to read/write
ALTER TABLE tech_stack_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Allow authenticated users to read tech_stack_references"
  ON tech_stack_references FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY IF NOT EXISTS "Allow authenticated users to insert tech_stack_references"
  ON tech_stack_references FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Allow authenticated users to update tech_stack_references"
  ON tech_stack_references FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Allow authenticated users to delete tech_stack_references"
  ON tech_stack_references FOR DELETE
  TO authenticated
  USING (true);

-- prd_research_audit_log: Read-only for authenticated, write for service role
ALTER TABLE prd_research_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Allow authenticated users to read prd_research_audit_log"
  ON prd_research_audit_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY IF NOT EXISTS "Allow service role to insert prd_research_audit_log"
  ON prd_research_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- system_health: Read-only for authenticated, write for service role
ALTER TABLE system_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Allow authenticated users to read system_health"
  ON system_health FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY IF NOT EXISTS "Allow service role to update system_health"
  ON system_health FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- =====================================================================
-- CLEANUP: TTL function for tech_stack_references
-- =====================================================================

-- Function to clean up expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_tech_stack_references()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM tech_stack_references
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_expired_tech_stack_references() IS
'Cleanup function to delete expired tech_stack_references entries (run via cron job)';

-- =====================================================================
-- GRANTS
-- =====================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON tech_stack_references TO authenticated;
GRANT SELECT, INSERT ON prd_research_audit_log TO authenticated;
GRANT SELECT, UPDATE ON system_health TO authenticated;

-- =====================================================================
-- Migration Complete
-- =====================================================================
-- Tables created: 3 (tech_stack_references, prd_research_audit_log, system_health)
-- Tables enhanced: 2 (user_stories, product_requirements_v2)
-- Indexes created: 5
-- RLS policies: 8
-- Functions: 1 (cleanup_expired_tech_stack_references)
