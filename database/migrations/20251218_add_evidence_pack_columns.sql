-- ============================================================================
-- Migration: Add Evidence Pack Columns to test_runs
-- Version: LEO Protocol v4.4 - Unified Test Evidence Architecture
-- Created: 2025-12-18
--
-- Purpose:
-- Adds evidence_pack_id and evidence_manifest columns to test_runs table
-- for automatic evidence pack generation and storage by leo-playwright-reporter.
--
-- Part of LEO-PATCH-001-BrowserEvidencePack implementation.
-- ============================================================================

-- Add evidence_pack_id column
-- Unique identifier for the evidence pack (format: EVP-{timestamp}-{hash})
ALTER TABLE test_runs
ADD COLUMN IF NOT EXISTS evidence_pack_id VARCHAR(100);

-- Add evidence_manifest column
-- Full manifest JSON including artifact list, hashes, and integrity info
ALTER TABLE test_runs
ADD COLUMN IF NOT EXISTS evidence_manifest JSONB;

-- Add cleanup_stats column
-- Statistics from automatic trace cleanup (optional, for monitoring)
ALTER TABLE test_runs
ADD COLUMN IF NOT EXISTS cleanup_stats JSONB;

-- Index for evidence pack lookup
CREATE INDEX IF NOT EXISTS idx_test_runs_evidence_pack_id
ON test_runs(evidence_pack_id)
WHERE evidence_pack_id IS NOT NULL;

-- Comment updates
COMMENT ON COLUMN test_runs.evidence_pack_id IS
'Unique evidence pack ID (EVP-{timestamp}-{hash}) linking to manifest artifacts. LEO v4.4';

COMMENT ON COLUMN test_runs.evidence_manifest IS
'Full evidence pack manifest including artifact list, SHA-256 hashes, and integrity verification data. LEO v4.4';

COMMENT ON COLUMN test_runs.cleanup_stats IS
'Statistics from automatic trace cleanup: tracesDeleted, bytesFreed, etc. LEO v4.4';

-- ============================================================================
-- View update: Include evidence pack info in v_latest_test_evidence
-- ============================================================================

DROP VIEW IF EXISTS v_latest_test_evidence CASCADE;

CREATE OR REPLACE VIEW v_latest_test_evidence AS
SELECT DISTINCT ON (sd_id)
    tr.id AS test_run_id,
    tr.sd_id,
    tr.prd_id,
    tr.run_type,
    tr.triggered_by,
    tr.verdict,
    tr.pass_rate,
    tr.total_tests,
    tr.passed_tests,
    tr.failed_tests,
    tr.completed_at,
    tr.duration_ms,
    tr.report_hash,
    tr.report_file_path,
    -- Evidence pack fields (LEO v4.4)
    tr.evidence_pack_id,
    tr.evidence_manifest IS NOT NULL AS has_evidence_manifest,
    (tr.evidence_manifest->>'artifacts'->>'count')::INTEGER AS evidence_artifact_count,
    -- Freshness calculation
    EXTRACT(EPOCH FROM (NOW() - tr.completed_at)) / 60 AS age_minutes,
    CASE
        WHEN tr.completed_at > NOW() - INTERVAL '1 hour' THEN 'FRESH'
        WHEN tr.completed_at > NOW() - INTERVAL '24 hours' THEN 'RECENT'
        ELSE 'STALE'
    END AS freshness_status
FROM test_runs tr
WHERE tr.verdict IS NOT NULL
  AND tr.completed_at IS NOT NULL
ORDER BY tr.sd_id, tr.completed_at DESC;

-- ============================================================================
-- Recreate dependent views (v_story_test_coverage depends on user_stories, not changed)
-- v_sd_test_readiness depends on v_story_test_coverage
-- ============================================================================

-- Note: v_story_test_coverage and v_sd_test_readiness don't need evidence pack fields
-- They focus on story-level coverage, not run-level evidence

-- ============================================================================
-- Update helper function to include evidence pack info
-- ============================================================================

CREATE OR REPLACE FUNCTION get_test_evidence_summary(p_sd_id VARCHAR(50))
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'sd_id', p_sd_id,
        'latest_evidence', (
            SELECT jsonb_build_object(
                'test_run_id', test_run_id,
                'verdict', verdict,
                'pass_rate', pass_rate,
                'freshness_status', freshness_status,
                'age_minutes', ROUND(age_minutes::numeric, 2),
                'completed_at', completed_at,
                -- Evidence pack info (LEO v4.4)
                'evidence_pack_id', evidence_pack_id,
                'has_evidence_manifest', has_evidence_manifest,
                'evidence_artifact_count', evidence_artifact_count
            )
            FROM v_latest_test_evidence
            WHERE sd_id = p_sd_id
        ),
        'story_coverage', (
            SELECT jsonb_build_object(
                'total_stories', total_stories,
                'stories_with_tests', stories_with_tests,
                'stories_passing', stories_passing,
                'test_coverage_percent', test_coverage_percent,
                'pass_rate', pass_rate,
                'all_passing', all_passing
            )
            FROM v_sd_test_readiness
            WHERE sd_id = p_sd_id
        ),
        'ready_for_handoff', (
            SELECT COALESCE(r.all_passing, false) AND e.freshness_status = 'FRESH'
            FROM v_sd_test_readiness r
            JOIN v_latest_test_evidence e ON r.sd_id = e.sd_id
            WHERE r.sd_id = p_sd_id
        )
    ) INTO result;

    RETURN COALESCE(result, jsonb_build_object(
        'sd_id', p_sd_id,
        'latest_evidence', null,
        'story_coverage', null,
        'ready_for_handoff', false
    ));
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- Migration complete
-- ============================================================================
