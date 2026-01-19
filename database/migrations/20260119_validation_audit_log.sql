-- SD-LEARN-011: FR-6 - Audit Logging and Metrics for Validation
-- Purpose: Create validation_audit_log table for tracking bypass detection and validation failures
-- Date: 2026-01-19

-- ============================================================================
-- TABLE: Validation Audit Log
-- ============================================================================

CREATE TABLE IF NOT EXISTS validation_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id VARCHAR(100) NOT NULL,
  sd_id VARCHAR(100),
  sd_type VARCHAR(50),
  validator_name VARCHAR(100) NOT NULL,
  failure_reason TEXT NOT NULL,
  artifact_id VARCHAR(255),
  failure_category VARCHAR(50) NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  execution_context VARCHAR(50) DEFAULT 'cli'
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_validation_audit_log_sd_id ON validation_audit_log(sd_id);
CREATE INDEX IF NOT EXISTS idx_validation_audit_log_correlation_id ON validation_audit_log(correlation_id);
CREATE INDEX IF NOT EXISTS idx_validation_audit_log_validator_name ON validation_audit_log(validator_name);
CREATE INDEX IF NOT EXISTS idx_validation_audit_log_failure_category ON validation_audit_log(failure_category);
CREATE INDEX IF NOT EXISTS idx_validation_audit_log_created_at ON validation_audit_log(created_at DESC);

-- Add comments
COMMENT ON TABLE validation_audit_log IS 'Audit log for LEO Protocol validation failures including bypass detection, coverage validation, and gate failures';
COMMENT ON COLUMN validation_audit_log.correlation_id IS 'Groups related audit events from the same validation run';
COMMENT ON COLUMN validation_audit_log.validator_name IS 'Name of the validator that detected the issue (e.g., bypass_detection, coverage_validation)';
COMMENT ON COLUMN validation_audit_log.failure_category IS 'Category of failure (bypass, missing_coverage, gate_failure, constraint_violation)';
COMMENT ON COLUMN validation_audit_log.execution_context IS 'Where validation ran (cli, ci, server)';

-- ============================================================================
-- VIEW: Validation Failure Metrics
-- ============================================================================

CREATE OR REPLACE VIEW validation_failure_metrics AS
SELECT
  validator_name,
  sd_type,
  failure_category,
  COUNT(*) as failure_count,
  COUNT(DISTINCT sd_id) as unique_sds_affected,
  MIN(created_at) as first_occurrence,
  MAX(created_at) as last_occurrence,
  DATE_TRUNC('day', created_at) as failure_date
FROM validation_audit_log
GROUP BY validator_name, sd_type, failure_category, DATE_TRUNC('day', created_at);

COMMENT ON VIEW validation_failure_metrics IS 'Aggregated metrics for validation failures, useful for dashboards and alerting';

-- ============================================================================
-- FUNCTION: Get Validation Failure Summary
-- ============================================================================

CREATE OR REPLACE FUNCTION get_validation_failure_summary(
  days_back INT DEFAULT 7,
  validator_filter VARCHAR DEFAULT NULL
)
RETURNS TABLE (
  validator_name VARCHAR,
  sd_type VARCHAR,
  failure_category VARCHAR,
  total_failures BIGINT,
  unique_sds BIGINT,
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.validator_name::VARCHAR,
    v.sd_type::VARCHAR,
    v.failure_category::VARCHAR,
    COUNT(*)::BIGINT as total_failures,
    COUNT(DISTINCT v.sd_id)::BIGINT as unique_sds,
    MIN(v.created_at) as first_seen,
    MAX(v.created_at) as last_seen
  FROM validation_audit_log v
  WHERE v.created_at >= NOW() - (days_back || ' days')::INTERVAL
  AND (validator_filter IS NULL OR v.validator_name = validator_filter)
  GROUP BY v.validator_name, v.sd_type, v.failure_category
  ORDER BY COUNT(*) DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Log Validation Event
-- ============================================================================

CREATE OR REPLACE FUNCTION log_validation_event(
  p_sd_id VARCHAR,
  p_sd_type VARCHAR,
  p_validator_name VARCHAR,
  p_failure_reason TEXT,
  p_failure_category VARCHAR,
  p_artifact_id VARCHAR DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}',
  p_correlation_id VARCHAR DEFAULT NULL,
  p_execution_context VARCHAR DEFAULT 'cli'
)
RETURNS UUID AS $$
DECLARE
  new_id UUID;
  actual_correlation_id VARCHAR;
BEGIN
  -- Generate correlation ID if not provided
  actual_correlation_id := COALESCE(
    p_correlation_id,
    p_validator_name || '-' || EXTRACT(EPOCH FROM NOW())::TEXT
  );

  INSERT INTO validation_audit_log (
    correlation_id,
    sd_id,
    sd_type,
    validator_name,
    failure_reason,
    failure_category,
    artifact_id,
    metadata,
    execution_context
  ) VALUES (
    actual_correlation_id,
    p_sd_id,
    p_sd_type,
    p_validator_name,
    p_failure_reason,
    p_failure_category,
    p_artifact_id,
    p_metadata,
    p_execution_context
  ) RETURNING id INTO new_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE validation_audit_log ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to view all audit logs
CREATE POLICY "audit_log_select_authenticated"
ON validation_audit_log FOR SELECT
TO authenticated
USING (true);

-- Policy: Allow service role to insert
CREATE POLICY "audit_log_insert_service"
ON validation_audit_log FOR INSERT
TO service_role
WITH CHECK (true);

-- Policy: Allow authenticated users to insert (for CLI usage)
CREATE POLICY "audit_log_insert_authenticated"
ON validation_audit_log FOR INSERT
TO authenticated
WITH CHECK (true);

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SD-LEARN-011 FR-6: Validation Audit Log Migration Complete';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Table created: validation_audit_log';
  RAISE NOTICE '';
  RAISE NOTICE 'Columns:';
  RAISE NOTICE '  - id: UUID primary key';
  RAISE NOTICE '  - correlation_id: Groups related events';
  RAISE NOTICE '  - sd_id: Strategic Directive ID';
  RAISE NOTICE '  - sd_type: SD type for metrics';
  RAISE NOTICE '  - validator_name: bypass_detection, coverage_validation, etc.';
  RAISE NOTICE '  - failure_reason: Human-readable description';
  RAISE NOTICE '  - failure_category: bypass, missing_coverage, gate_failure';
  RAISE NOTICE '  - artifact_id: Optional artifact identifier';
  RAISE NOTICE '  - metadata: JSONB for additional context';
  RAISE NOTICE '  - execution_context: cli, ci, or server';
  RAISE NOTICE '';
  RAISE NOTICE 'Functions:';
  RAISE NOTICE '  - log_validation_event(): Insert audit event';
  RAISE NOTICE '  - get_validation_failure_summary(): Query metrics';
  RAISE NOTICE '';
  RAISE NOTICE 'Views:';
  RAISE NOTICE '  - validation_failure_metrics: Aggregated daily metrics';
  RAISE NOTICE '';
  RAISE NOTICE 'Usage:';
  RAISE NOTICE '  SELECT log_validation_event(';
  RAISE NOTICE '    ''sd-123'', ''qa'', ''bypass_detection'',';
  RAISE NOTICE '    ''Artifact created before prerequisite'',';
  RAISE NOTICE '    ''bypass'', ''retro-456'', ''{}''';
  RAISE NOTICE '  );';
  RAISE NOTICE '';
  RAISE NOTICE '  SELECT * FROM get_validation_failure_summary(7);';
  RAISE NOTICE '============================================================';
END $$;
