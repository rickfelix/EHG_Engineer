-- ============================================================================
-- Migration: Unified Test Evidence Architecture (FIXED)
-- Version: LEO Protocol v4.3.4 - Test Evidence Governance
-- Created: 2025-12-11 (fixes type mismatches from 2025-12-10 version)
--
-- Fixes:
-- 1. prd_id is VARCHAR not UUID (matches product_requirements_v2.id)
-- 2. Removed LEO protocol updates (different schema than expected)
-- 3. Added proper type compatibility
-- ============================================================================

-- ============================================================================
-- PART 1: NEW TABLES
-- ============================================================================

-- Table: test_runs - Immutable test execution records
CREATE TABLE IF NOT EXISTS test_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id VARCHAR(50) NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
    prd_id VARCHAR(255), -- VARCHAR to match product_requirements_v2.id (no FK due to nullable)

    -- Execution metadata
    run_type VARCHAR(50) NOT NULL CHECK (run_type IN ('playwright', 'vitest', 'ci_pipeline', 'manual_verification')),
    triggered_by VARCHAR(100) NOT NULL,
    trigger_context JSONB DEFAULT '{}'::jsonb,

    -- Timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,

    -- Results summary
    total_tests INTEGER NOT NULL DEFAULT 0,
    passed_tests INTEGER NOT NULL DEFAULT 0,
    failed_tests INTEGER NOT NULL DEFAULT 0,
    skipped_tests INTEGER NOT NULL DEFAULT 0,
    pass_rate NUMERIC(5,2) GENERATED ALWAYS AS (
        CASE WHEN total_tests > 0 THEN (passed_tests::NUMERIC / total_tests * 100) ELSE 0 END
    ) STORED,

    -- Verdict
    verdict VARCHAR(20) NOT NULL CHECK (verdict IN ('PASS', 'FAIL', 'PARTIAL', 'ERROR', 'CANCELLED')),

    -- Evidence
    raw_report_json JSONB,
    report_hash VARCHAR(64),
    report_file_path VARCHAR(500),
    environment JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_test_counts CHECK (passed_tests + failed_tests + skipped_tests <= total_tests)
);

-- Indexes for test_runs
CREATE INDEX IF NOT EXISTS idx_test_runs_sd_id ON test_runs(sd_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_completed_at ON test_runs(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_runs_verdict ON test_runs(verdict);

-- Table: test_results - Individual test outcomes
CREATE TABLE IF NOT EXISTS test_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_run_id UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,

    test_file_path VARCHAR(500) NOT NULL,
    test_name VARCHAR(1000) NOT NULL,
    test_full_title VARCHAR(2000),

    status VARCHAR(20) NOT NULL CHECK (status IN ('passed', 'failed', 'skipped', 'timedOut', 'interrupted')),
    duration_ms INTEGER,

    error_message TEXT,
    error_stack TEXT,
    failure_screenshot_path VARCHAR(500),

    retry_count INTEGER DEFAULT 0,
    annotations JSONB DEFAULT '[]'::jsonb,
    attachments JSONB DEFAULT '[]'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for test_results
CREATE INDEX IF NOT EXISTS idx_test_results_run_id ON test_results(test_run_id);
CREATE INDEX IF NOT EXISTS idx_test_results_status ON test_results(status);

-- Table: story_test_mappings - Links user stories to test results
CREATE TABLE IF NOT EXISTS story_test_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_story_id UUID NOT NULL REFERENCES user_stories(id) ON DELETE CASCADE,
    test_result_id UUID NOT NULL REFERENCES test_results(id) ON DELETE CASCADE,
    test_run_id UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,

    mapping_type VARCHAR(50) NOT NULL CHECK (mapping_type IN (
        'filename_match', 'annotation_match', 'manual_link', 'auto_generated'
    )),
    confidence_score NUMERIC(3,2) DEFAULT 1.00 CHECK (confidence_score >= 0 AND confidence_score <= 1),
    story_key_from_test VARCHAR(100),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_story_id, test_result_id)
);

-- Indexes for story_test_mappings
CREATE INDEX IF NOT EXISTS idx_story_test_mappings_story_id ON story_test_mappings(user_story_id);
CREATE INDEX IF NOT EXISTS idx_story_test_mappings_run_id ON story_test_mappings(test_run_id);

-- ============================================================================
-- PART 2: VIEWS
-- ============================================================================

-- View: v_latest_test_evidence - Latest test evidence per SD with freshness
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

-- View: v_story_test_coverage - Story test coverage for handoff validation
CREATE OR REPLACE VIEW v_story_test_coverage AS
SELECT
    us.sd_id,
    us.id AS user_story_id,
    us.story_key,
    us.title,
    us.status AS story_status,
    COALESCE(latest_mapping.has_test, false) AS has_test,
    latest_mapping.test_status AS latest_test_status,
    latest_mapping.test_file_path,
    latest_mapping.last_run_at,
    latest_mapping.run_verdict,
    latest_mapping.mapping_type,
    us.e2e_test_path,
    us.e2e_test_status
FROM user_stories us
LEFT JOIN LATERAL (
    SELECT
        true AS has_test,
        tr.status AS test_status,
        tr.test_file_path,
        trun.completed_at AS last_run_at,
        trun.verdict AS run_verdict,
        stm.mapping_type
    FROM story_test_mappings stm
    JOIN test_results tr ON tr.id = stm.test_result_id
    JOIN test_runs trun ON trun.id = stm.test_run_id
    WHERE stm.user_story_id = us.id
    ORDER BY trun.completed_at DESC
    LIMIT 1
) latest_mapping ON true;

-- View: v_sd_test_readiness - SD-level test readiness
CREATE OR REPLACE VIEW v_sd_test_readiness AS
SELECT
    sd_id,
    COUNT(*) AS total_stories,
    COUNT(CASE WHEN has_test THEN 1 END) AS stories_with_tests,
    COUNT(CASE WHEN latest_test_status = 'passed' THEN 1 END) AS stories_passing,
    COUNT(CASE WHEN latest_test_status = 'failed' THEN 1 END) AS stories_failing,
    COUNT(CASE WHEN latest_test_status IS NULL THEN 1 END) AS stories_untested,
    ROUND(
        COUNT(CASE WHEN has_test THEN 1 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100,
        2
    ) AS test_coverage_percent,
    ROUND(
        COUNT(CASE WHEN latest_test_status = 'passed' THEN 1 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100,
        2
    ) AS pass_rate,
    BOOL_AND(COALESCE(latest_test_status = 'passed', false)) AS all_passing,
    MAX(last_run_at) AS latest_test_run
FROM v_story_test_coverage
GROUP BY sd_id;

-- ============================================================================
-- PART 3: RLS POLICIES
-- ============================================================================

ALTER TABLE test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_test_mappings ENABLE ROW LEVEL SECURITY;

-- Allow all reads
CREATE POLICY "Anyone can read test_runs" ON test_runs FOR SELECT USING (true);
CREATE POLICY "Anyone can read test_results" ON test_results FOR SELECT USING (true);
CREATE POLICY "Anyone can read story_test_mappings" ON story_test_mappings FOR SELECT USING (true);

-- Allow inserts (for automation)
CREATE POLICY "Allow inserts to test_runs" ON test_runs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow inserts to test_results" ON test_results FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow inserts to story_test_mappings" ON story_test_mappings FOR INSERT WITH CHECK (true);

-- Prevent updates (immutable)
CREATE POLICY "No updates to test_runs" ON test_runs FOR UPDATE USING (false);
CREATE POLICY "No updates to test_results" ON test_results FOR UPDATE USING (false);
CREATE POLICY "No updates to story_test_mappings" ON story_test_mappings FOR UPDATE USING (false);

-- Prevent deletes (audit trail)
CREATE POLICY "No deletes from test_runs" ON test_runs FOR DELETE USING (false);
CREATE POLICY "No deletes from test_results" ON test_results FOR DELETE USING (false);
CREATE POLICY "No deletes from story_test_mappings" ON story_test_mappings FOR DELETE USING (false);

-- ============================================================================
-- PART 4: SYNC TRIGGER (Backward Compatibility)
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_test_evidence_to_user_stories()
RETURNS TRIGGER AS $$
DECLARE
    test_status VARCHAR(20);
    test_path VARCHAR(500);
BEGIN
    SELECT tr.status, tr.test_file_path
    INTO test_status, test_path
    FROM test_results tr
    WHERE tr.id = NEW.test_result_id;

    UPDATE user_stories SET
        e2e_test_status = CASE
            WHEN test_status = 'passed' THEN 'passing'
            WHEN test_status = 'failed' THEN 'failing'
            WHEN test_status = 'skipped' THEN 'skipped'
            ELSE 'created'
        END,
        e2e_test_last_run = NOW(),
        e2e_test_path = COALESCE(test_path, e2e_test_path)
    WHERE id = NEW.user_story_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_sync_test_evidence ON story_test_mappings;
CREATE TRIGGER trigger_sync_test_evidence
    AFTER INSERT ON story_test_mappings
    FOR EACH ROW
    EXECUTE FUNCTION sync_test_evidence_to_user_stories();

-- ============================================================================
-- PART 5: HELPER FUNCTION
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
                'completed_at', completed_at
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
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE test_runs IS 'Immutable test execution records. Part of unified test evidence architecture (LEO v4.3.4)';
COMMENT ON TABLE test_results IS 'Individual test outcomes linked to test_runs';
COMMENT ON TABLE story_test_mappings IS 'Links user stories to test results with traceability';
COMMENT ON VIEW v_latest_test_evidence IS 'Latest test evidence per SD with freshness status';
COMMENT ON VIEW v_story_test_coverage IS 'Story-level test coverage for handoff validation';
COMMENT ON VIEW v_sd_test_readiness IS 'SD-level test readiness aggregation';
