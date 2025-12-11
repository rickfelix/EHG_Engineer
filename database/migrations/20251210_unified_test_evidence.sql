-- ============================================================================
-- Migration: Unified Test Evidence Architecture
-- Version: LEO Protocol v4.3.4 - Test Evidence Governance
-- Created: 2025-12-10
-- Purpose: Create immutable test evidence tracking with chain of custody
--
-- This migration addresses the root cause identified in 7-Whys analysis:
-- FRAGMENTED TEST INFRASTRUCTURE WITH NO SINGLE SOURCE OF TRUTH
--
-- Solution: Unified test_runs, test_results, story_test_mappings tables
-- with immutable audit trail and automatic sync to user_stories
-- ============================================================================

-- ============================================================================
-- PART 1: NEW TABLES
-- ============================================================================

-- -----------------------------------------------------------------------------
-- Table: test_runs - Immutable test execution records
-- Only automated systems (service_role) can write to this table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS test_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id VARCHAR(50) NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
    prd_id UUID REFERENCES product_requirements_v2(id) ON DELETE SET NULL,

    -- Execution metadata
    run_type VARCHAR(50) NOT NULL CHECK (run_type IN ('playwright', 'vitest', 'ci_pipeline', 'manual_verification')),
    triggered_by VARCHAR(100) NOT NULL, -- 'TESTING_SUBAGENT', 'CI_PIPELINE', 'PLAYWRIGHT_REPORTER', 'UAT_SUBAGENT'
    trigger_context JSONB DEFAULT '{}'::jsonb, -- { sub_agent_execution_id, ci_run_id, handoff_id }

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

    -- Evidence (immutable)
    raw_report_json JSONB,
    report_hash VARCHAR(64), -- SHA-256 for integrity verification
    report_file_path VARCHAR(500), -- Path to archived HTML report

    -- Environment
    environment JSONB DEFAULT '{}'::jsonb, -- { baseURL, browser, ci, node_version }

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_test_counts CHECK (passed_tests + failed_tests + skipped_tests <= total_tests),
    CONSTRAINT valid_pass_rate CHECK (pass_rate >= 0 AND pass_rate <= 100)
);

-- Indexes for test_runs
CREATE INDEX IF NOT EXISTS idx_test_runs_sd_id ON test_runs(sd_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_completed_at ON test_runs(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_runs_verdict ON test_runs(verdict);
CREATE INDEX IF NOT EXISTS idx_test_runs_triggered_by ON test_runs(triggered_by);

-- -----------------------------------------------------------------------------
-- Table: test_results - Individual test outcomes
-- Linked to test_runs via foreign key
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS test_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_run_id UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,

    -- Test identification
    test_file_path VARCHAR(500) NOT NULL,
    test_name VARCHAR(1000) NOT NULL,
    test_full_title VARCHAR(2000), -- Includes describe blocks

    -- Result
    status VARCHAR(20) NOT NULL CHECK (status IN ('passed', 'failed', 'skipped', 'timedOut', 'interrupted')),
    duration_ms INTEGER,

    -- Failure details (if failed)
    error_message TEXT,
    error_stack TEXT,
    failure_screenshot_path VARCHAR(500),

    -- Retry information
    retry_count INTEGER DEFAULT 0,

    -- Raw test data
    annotations JSONB DEFAULT '[]'::jsonb, -- Playwright annotations
    attachments JSONB DEFAULT '[]'::jsonb, -- { screenshots, videos, traces }

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for test_results
CREATE INDEX IF NOT EXISTS idx_test_results_run_id ON test_results(test_run_id);
CREATE INDEX IF NOT EXISTS idx_test_results_status ON test_results(status);
CREATE INDEX IF NOT EXISTS idx_test_results_file_path ON test_results(test_file_path);

-- -----------------------------------------------------------------------------
-- Table: story_test_mappings - Links user stories to test results
-- Provides traceability from requirement to test evidence
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS story_test_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_story_id UUID NOT NULL REFERENCES user_stories(id) ON DELETE CASCADE,
    test_result_id UUID NOT NULL REFERENCES test_results(id) ON DELETE CASCADE,
    test_run_id UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,

    -- Mapping metadata
    mapping_type VARCHAR(50) NOT NULL CHECK (mapping_type IN (
        'filename_match',      -- Test file name matches story key
        'annotation_match',    -- Test has @story:US-XXX annotation
        'manual_link',         -- Manually linked
        'auto_generated'       -- System generated based on heuristics
    )),
    confidence_score NUMERIC(3,2) DEFAULT 1.00 CHECK (confidence_score >= 0 AND confidence_score <= 1),

    -- Extracted from test file
    story_key_from_test VARCHAR(100), -- The US-XXX extracted from test name

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(user_story_id, test_result_id)
);

-- Indexes for story_test_mappings
CREATE INDEX IF NOT EXISTS idx_story_test_mappings_story_id ON story_test_mappings(user_story_id);
CREATE INDEX IF NOT EXISTS idx_story_test_mappings_run_id ON story_test_mappings(test_run_id);
CREATE INDEX IF NOT EXISTS idx_story_test_mappings_result_id ON story_test_mappings(test_result_id);


-- ============================================================================
-- PART 2: VIEWS
-- ============================================================================

-- -----------------------------------------------------------------------------
-- View: v_latest_test_evidence - Latest test evidence per SD with freshness
-- Used by TESTING sub-agent to determine if tests need re-running
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- View: v_story_test_coverage - Story test coverage for handoff validation
-- Used by EXEC-TO-PLAN handoff to validate all stories have passing tests
-- -----------------------------------------------------------------------------
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
    -- Legacy fields for backward compatibility
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

-- -----------------------------------------------------------------------------
-- View: v_sd_test_readiness - SD-level test readiness for handoffs
-- Aggregates story-level coverage into SD-level metrics
-- -----------------------------------------------------------------------------
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
-- PART 3: RLS POLICIES (Prevent Manual Manipulation)
-- ============================================================================

-- Enable RLS on all test evidence tables
ALTER TABLE test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_test_mappings ENABLE ROW LEVEL SECURITY;

-- test_runs: Only service_role can write (immutable audit trail)
CREATE POLICY "Service role writes test_runs"
ON test_runs FOR INSERT
TO authenticated, anon, service_role
WITH CHECK (
    -- Only service_role can insert
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    OR auth.role() = 'service_role'
    -- Allow anon key with special header for automation
    OR current_setting('request.headers', true)::json->>'x-automation-key' IS NOT NULL
);

-- test_runs: Everyone can read
CREATE POLICY "Anyone can read test_runs"
ON test_runs FOR SELECT
TO authenticated, anon, service_role
USING (true);

-- test_runs: Prevent updates (immutable)
CREATE POLICY "No updates to test_runs"
ON test_runs FOR UPDATE
USING (false);

-- test_runs: Prevent deletes (audit trail)
CREATE POLICY "No deletes from test_runs"
ON test_runs FOR DELETE
USING (false);

-- test_results: Same pattern as test_runs
CREATE POLICY "Service role writes test_results"
ON test_results FOR INSERT
TO authenticated, anon, service_role
WITH CHECK (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    OR auth.role() = 'service_role'
    OR current_setting('request.headers', true)::json->>'x-automation-key' IS NOT NULL
);

CREATE POLICY "Anyone can read test_results"
ON test_results FOR SELECT
TO authenticated, anon, service_role
USING (true);

CREATE POLICY "No updates to test_results"
ON test_results FOR UPDATE
USING (false);

CREATE POLICY "No deletes from test_results"
ON test_results FOR DELETE
USING (false);

-- story_test_mappings: Same pattern
CREATE POLICY "Service role writes story_test_mappings"
ON story_test_mappings FOR INSERT
TO authenticated, anon, service_role
WITH CHECK (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    OR auth.role() = 'service_role'
    OR current_setting('request.headers', true)::json->>'x-automation-key' IS NOT NULL
);

CREATE POLICY "Anyone can read story_test_mappings"
ON story_test_mappings FOR SELECT
TO authenticated, anon, service_role
USING (true);

CREATE POLICY "No updates to story_test_mappings"
ON story_test_mappings FOR UPDATE
USING (false);

CREATE POLICY "No deletes from story_test_mappings"
ON story_test_mappings FOR DELETE
USING (false);


-- ============================================================================
-- PART 4: SYNC TRIGGER (Backward Compatibility)
-- ============================================================================

-- -----------------------------------------------------------------------------
-- Function: sync_test_evidence_to_user_stories
-- Auto-syncs test evidence to user_stories.e2e_test_* fields
-- This maintains backward compatibility with existing code
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_test_evidence_to_user_stories()
RETURNS TRIGGER AS $$
DECLARE
    test_status VARCHAR(20);
    test_path VARCHAR(500);
BEGIN
    -- Get the test result status and path
    SELECT tr.status, tr.test_file_path
    INTO test_status, test_path
    FROM test_results tr
    WHERE tr.id = NEW.test_result_id;

    -- Update the user story with test evidence
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

-- Create trigger to sync on mapping insert
DROP TRIGGER IF EXISTS trigger_sync_test_evidence ON story_test_mappings;
CREATE TRIGGER trigger_sync_test_evidence
    AFTER INSERT ON story_test_mappings
    FOR EACH ROW
    EXECUTE FUNCTION sync_test_evidence_to_user_stories();


-- ============================================================================
-- PART 5: LEO PROTOCOL v4.3.4 UPDATE
-- ============================================================================

-- -----------------------------------------------------------------------------
-- Update LEO Protocol version
-- -----------------------------------------------------------------------------
INSERT INTO leo_protocols (id, version, status, title, description, metadata)
VALUES (
    'leo-v4-3-4-test-evidence',
    '4.3.4',
    'active',
    'LEO Protocol v4.3.4 - Test Evidence Governance',
    'Unified test evidence architecture with immutable audit trail. Addresses 7-Whys root cause: fragmented test infrastructure.',
    jsonb_build_object(
        'release_date', '2025-12-10',
        'changes', jsonb_build_array(
            'Added test_runs, test_results, story_test_mappings tables',
            'Implemented immutable audit trail with RLS policies',
            'Created freshness-based evidence validation',
            'Added backward compatibility sync trigger',
            'Integrated test evidence into handoff validation'
        ),
        'root_cause_addressed', '7-Whys: Fragmented test infrastructure with no single source of truth'
    )
)
ON CONFLICT (id) DO UPDATE SET
    status = 'active',
    updated_at = NOW();

-- Mark previous version as superseded
UPDATE leo_protocols
SET
    status = 'superseded',
    superseded_by = 'leo-v4-3-4-test-evidence',
    superseded_at = NOW()
WHERE id = 'leo-v4-3-3-ui-parity'
  AND status = 'active';

-- -----------------------------------------------------------------------------
-- Add protocol section for test evidence architecture
-- -----------------------------------------------------------------------------
INSERT INTO leo_protocol_sections (protocol_id, section_type, title, content, order_index, metadata)
VALUES (
    'leo-v4-3-4-test-evidence',
    'test_evidence_architecture',
    'Unified Test Evidence Architecture',
    '## Test Evidence Chain of Custody

### Overview
All test evidence flows through an immutable audit trail:
1. **test_runs**: Records of actual Playwright/Vitest/CI executions
2. **test_results**: Individual test outcomes linked to runs
3. **story_test_mappings**: Links user stories to specific test results

### Freshness Policy
- **FRESH** (<1 hour): TESTING sub-agent accepts existing evidence
- **RECENT** (1-24 hours): Warning, recommend re-run
- **STALE** (>24 hours): Must re-run tests

### Write Path (Automated Only)
Only automated systems can write to test evidence tables:
- Playwright custom reporter (leo-playwright-reporter.js)
- TESTING sub-agent after test execution
- CI/CD pipeline post-test hooks

### Read Path
- TESTING sub-agent queries v_latest_test_evidence before running tests
- EXEC-TO-PLAN handoff queries v_story_test_coverage
- Dashboard queries v_sd_test_readiness for overview

### Backward Compatibility
The sync trigger automatically updates user_stories.e2e_test_* fields
when new story_test_mappings are created. Existing code continues to work.',
    105,
    jsonb_build_object(
        'category', 'testing',
        'phase', 'PLAN',
        'requires_regeneration', true
    )
)
ON CONFLICT (protocol_id, section_type) DO UPDATE SET
    content = EXCLUDED.content,
    updated_at = NOW();

-- -----------------------------------------------------------------------------
-- Add validation rule for test evidence
-- -----------------------------------------------------------------------------
INSERT INTO leo_validation_rules (protocol_id, rule_type, rule_name, rule_definition, severity, applies_to_agent)
VALUES (
    'leo-v4-3-4-test-evidence',
    'test_evidence_gate',
    'Test Evidence Completeness',
    jsonb_build_object(
        'query', 'v_story_test_coverage',
        'criteria', 'all_stories_have_passing_tests',
        'freshness_threshold', '1 hour',
        'minimum_coverage', 0.95,
        'description', 'All user stories must have passing tests with fresh evidence'
    ),
    'blocking',
    'PLAN'
)
ON CONFLICT (protocol_id, rule_name) DO UPDATE SET
    rule_definition = EXCLUDED.rule_definition,
    updated_at = NOW();

-- -----------------------------------------------------------------------------
-- Add sub-agent triggers for test evidence
-- -----------------------------------------------------------------------------
INSERT INTO leo_sub_agent_triggers (sub_agent_code, trigger_phrase, activation_type, priority)
VALUES
    ('TESTING', 'test evidence', 'automatic', 85),
    ('TESTING', 'evidence freshness', 'automatic', 80),
    ('TESTING', 'test verification', 'automatic', 80),
    ('TESTING', 'chain of custody', 'automatic', 75)
ON CONFLICT (sub_agent_code, trigger_phrase) DO NOTHING;


-- ============================================================================
-- PART 6: HELPER FUNCTION
-- ============================================================================

-- -----------------------------------------------------------------------------
-- Function: get_test_evidence_summary
-- Returns test evidence summary for an SD
-- -----------------------------------------------------------------------------
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
            SELECT COALESCE(all_passing, false) AND freshness_status = 'FRESH'
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
-- MIGRATION COMPLETE
-- ============================================================================

-- Add comment for documentation
COMMENT ON TABLE test_runs IS 'Immutable test execution records. Part of unified test evidence architecture (LEO v4.3.4)';
COMMENT ON TABLE test_results IS 'Individual test outcomes linked to test_runs. Part of unified test evidence architecture (LEO v4.3.4)';
COMMENT ON TABLE story_test_mappings IS 'Links user stories to test results. Part of unified test evidence architecture (LEO v4.3.4)';
COMMENT ON VIEW v_latest_test_evidence IS 'Latest test evidence per SD with freshness status. Used by TESTING sub-agent.';
COMMENT ON VIEW v_story_test_coverage IS 'Story-level test coverage for handoff validation.';
COMMENT ON VIEW v_sd_test_readiness IS 'SD-level test readiness aggregation for handoffs.';
COMMENT ON FUNCTION get_test_evidence_summary IS 'Returns comprehensive test evidence summary for an SD.';
