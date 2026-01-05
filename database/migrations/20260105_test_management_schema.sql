-- ============================================================================
-- Test Management Database Schema
-- SD-TEST-MGMT-SCHEMA-001
--
-- Creates tables for comprehensive test tracking:
--   1. tests - Registry of all tests (unit, integration, E2E)
--   2. test_runs - Execution history with pass/fail/skip/flaky
--   3. test_fixtures - Reusable test data definitions
--   4. feature_test_map - Feature-to-test coverage mapping
--   5. test_ownership - Test ownership and responsibility
--   6. test_performance_baselines - Duration baselines per test
-- ============================================================================

-- ============================================================================
-- 1. TESTS TABLE - Central test registry
-- ============================================================================
CREATE TABLE IF NOT EXISTS tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Test identification
    test_key TEXT NOT NULL UNIQUE,  -- e.g., 'auth/login.spec.ts:should login with valid credentials'
    name TEXT NOT NULL,
    description TEXT,
    file_path TEXT NOT NULL,
    line_number INTEGER,

    -- Classification
    test_type TEXT NOT NULL CHECK (test_type IN ('unit', 'integration', 'e2e')),
    criticality_tier TEXT NOT NULL DEFAULT 'P2' CHECK (criticality_tier IN ('P0', 'P1', 'P2')),
    tags TEXT[] DEFAULT '{}',

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'quarantined', 'stale', 'deprecated', 'deleted')),
    quarantine_reason TEXT,
    quarantined_at TIMESTAMPTZ,

    -- Flakiness tracking
    is_flaky BOOLEAN DEFAULT FALSE,
    flakiness_rate DECIMAL(5,2) DEFAULT 0,  -- Percentage 0-100
    last_flaky_at TIMESTAMPTZ,

    -- Story linking
    user_story_id UUID REFERENCES user_stories(id),
    story_key TEXT,  -- e.g., 'SD-TEST-001:US-001'

    -- Venture isolation (for multi-venture support)
    venture_id UUID,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_run_at TIMESTAMPTZ,
    created_by TEXT,

    -- Source tracking
    source TEXT DEFAULT 'scanner' CHECK (source IN ('scanner', 'manual', 'generated')),
    generator_version TEXT  -- For AI-generated tests
);

-- Indexes for tests table
CREATE INDEX IF NOT EXISTS idx_tests_file_path ON tests(file_path);
CREATE INDEX IF NOT EXISTS idx_tests_test_type ON tests(test_type);
CREATE INDEX IF NOT EXISTS idx_tests_criticality ON tests(criticality_tier);
CREATE INDEX IF NOT EXISTS idx_tests_status ON tests(status);
CREATE INDEX IF NOT EXISTS idx_tests_venture_id ON tests(venture_id);
CREATE INDEX IF NOT EXISTS idx_tests_user_story_id ON tests(user_story_id);
CREATE INDEX IF NOT EXISTS idx_tests_flaky ON tests(is_flaky) WHERE is_flaky = TRUE;

-- ============================================================================
-- 2. TEST_RUNS TABLE - Execution history
-- ============================================================================
CREATE TABLE IF NOT EXISTS test_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Test reference
    test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,

    -- Run identification
    run_id TEXT NOT NULL,  -- CI run ID or local run identifier
    run_source TEXT NOT NULL DEFAULT 'ci' CHECK (run_source IN ('ci', 'local', 'manual')),

    -- Results
    result TEXT NOT NULL CHECK (result IN ('passed', 'failed', 'skipped', 'flaky', 'timeout', 'error')),
    duration_ms INTEGER,  -- Execution time in milliseconds
    retry_count INTEGER DEFAULT 0,

    -- Error details (for failures)
    error_message TEXT,
    error_type TEXT,
    stack_trace TEXT,

    -- Artifacts
    screenshot_url TEXT,
    trace_url TEXT,
    video_url TEXT,

    -- Environment
    browser TEXT,  -- For E2E tests
    node_version TEXT,
    os TEXT,
    ci_job_id TEXT,
    ci_workflow TEXT,
    branch TEXT,
    commit_sha TEXT,
    pr_number INTEGER,

    -- Venture isolation
    venture_id UUID,

    -- Timestamps
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for test_runs table
CREATE INDEX IF NOT EXISTS idx_test_runs_test_id ON test_runs(test_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_result ON test_runs(result);
CREATE INDEX IF NOT EXISTS idx_test_runs_run_id ON test_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_started_at ON test_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_runs_venture_id ON test_runs(venture_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_branch ON test_runs(branch);
CREATE INDEX IF NOT EXISTS idx_test_runs_pr ON test_runs(pr_number) WHERE pr_number IS NOT NULL;

-- Composite index for flakiness detection queries
CREATE INDEX IF NOT EXISTS idx_test_runs_flakiness ON test_runs(test_id, result, started_at DESC);

-- ============================================================================
-- 3. TEST_FIXTURES TABLE - Reusable test data
-- ============================================================================
CREATE TABLE IF NOT EXISTS test_fixtures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Fixture identification
    name TEXT NOT NULL,
    description TEXT,

    -- Classification
    fixture_type TEXT NOT NULL CHECK (fixture_type IN ('database', 'api_mock', 'user', 'file', 'state', 'custom')),

    -- Data
    data JSONB NOT NULL,
    schema_version TEXT DEFAULT '1.0',

    -- Usage tracking
    used_by_tests UUID[] DEFAULT '{}',
    usage_count INTEGER DEFAULT 0,

    -- Venture isolation
    venture_id UUID,
    is_shared BOOLEAN DEFAULT FALSE,  -- Shared across ventures

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT,

    -- Constraints
    UNIQUE(name, venture_id)
);

-- Indexes for test_fixtures table
CREATE INDEX IF NOT EXISTS idx_test_fixtures_type ON test_fixtures(fixture_type);
CREATE INDEX IF NOT EXISTS idx_test_fixtures_venture_id ON test_fixtures(venture_id);
CREATE INDEX IF NOT EXISTS idx_test_fixtures_shared ON test_fixtures(is_shared) WHERE is_shared = TRUE;

-- ============================================================================
-- 4. FEATURE_TEST_MAP TABLE - Feature-to-test coverage mapping
-- ============================================================================
CREATE TABLE IF NOT EXISTS feature_test_map (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Feature identification (can be file, component, or feature key)
    feature_type TEXT NOT NULL CHECK (feature_type IN ('file', 'component', 'route', 'api', 'feature', 'user_story')),
    feature_path TEXT NOT NULL,  -- e.g., 'src/components/Button.tsx' or '/api/ventures'
    feature_name TEXT,

    -- Test reference
    test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,

    -- Mapping metadata
    coverage_type TEXT NOT NULL DEFAULT 'direct' CHECK (coverage_type IN ('direct', 'indirect', 'integration', 'e2e')),
    confidence DECIMAL(3,2) DEFAULT 1.0,  -- How confident is this mapping (0-1)

    -- Source of mapping
    source TEXT DEFAULT 'auto' CHECK (source IN ('auto', 'manual', 'llm')),

    -- Venture isolation
    venture_id UUID,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    UNIQUE(feature_path, test_id)
);

-- Indexes for feature_test_map table
CREATE INDEX IF NOT EXISTS idx_feature_test_map_feature_path ON feature_test_map(feature_path);
CREATE INDEX IF NOT EXISTS idx_feature_test_map_test_id ON feature_test_map(test_id);
CREATE INDEX IF NOT EXISTS idx_feature_test_map_type ON feature_test_map(feature_type);
CREATE INDEX IF NOT EXISTS idx_feature_test_map_venture_id ON feature_test_map(venture_id);

-- ============================================================================
-- 5. TEST_OWNERSHIP TABLE - Test ownership and responsibility
-- ============================================================================
CREATE TABLE IF NOT EXISTS test_ownership (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Test reference
    test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,

    -- Owner identification
    owner_type TEXT NOT NULL CHECK (owner_type IN ('user', 'team', 'sd', 'auto')),
    owner_id TEXT NOT NULL,  -- User email, team name, or SD ID
    owner_name TEXT,

    -- Assignment metadata
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by TEXT,
    assignment_reason TEXT,

    -- Auto-assignment tracking
    is_auto_assigned BOOLEAN DEFAULT FALSE,
    auto_assignment_rule TEXT,

    -- Venture isolation
    venture_id UUID,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    UNIQUE(test_id, owner_type, owner_id)
);

-- Indexes for test_ownership table
CREATE INDEX IF NOT EXISTS idx_test_ownership_test_id ON test_ownership(test_id);
CREATE INDEX IF NOT EXISTS idx_test_ownership_owner ON test_ownership(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_test_ownership_venture_id ON test_ownership(venture_id);

-- ============================================================================
-- 6. TEST_PERFORMANCE_BASELINES TABLE - Duration baselines
-- ============================================================================
CREATE TABLE IF NOT EXISTS test_performance_baselines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Test reference
    test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,

    -- Baseline metrics (in milliseconds)
    p50_duration_ms INTEGER NOT NULL,  -- Median
    p75_duration_ms INTEGER,
    p90_duration_ms INTEGER,
    p95_duration_ms INTEGER,
    p99_duration_ms INTEGER,

    -- Statistics
    sample_count INTEGER NOT NULL DEFAULT 0,
    min_duration_ms INTEGER,
    max_duration_ms INTEGER,
    avg_duration_ms INTEGER,
    stddev_duration_ms INTEGER,

    -- Baseline period
    baseline_start TIMESTAMPTZ NOT NULL,
    baseline_end TIMESTAMPTZ NOT NULL,

    -- Thresholds for alerting
    warning_threshold_ms INTEGER,  -- Trigger warning if duration exceeds
    error_threshold_ms INTEGER,    -- Trigger error if duration exceeds

    -- Drift detection
    last_drift_check TIMESTAMPTZ,
    drift_detected BOOLEAN DEFAULT FALSE,
    drift_percentage DECIMAL(5,2),

    -- Venture isolation
    venture_id UUID,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Only one active baseline per test
    UNIQUE(test_id)
);

-- Indexes for test_performance_baselines table
CREATE INDEX IF NOT EXISTS idx_test_perf_baselines_test_id ON test_performance_baselines(test_id);
CREATE INDEX IF NOT EXISTS idx_test_perf_baselines_drift ON test_performance_baselines(drift_detected) WHERE drift_detected = TRUE;
CREATE INDEX IF NOT EXISTS idx_test_perf_baselines_venture_id ON test_performance_baselines(venture_id);

-- ============================================================================
-- RLS POLICIES - Venture isolation
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_test_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_ownership ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_performance_baselines ENABLE ROW LEVEL SECURITY;

-- Tests table policies
CREATE POLICY tests_select_policy ON tests FOR SELECT
    USING (venture_id IS NULL OR venture_id = current_setting('app.current_venture_id', true)::uuid);

CREATE POLICY tests_insert_policy ON tests FOR INSERT
    WITH CHECK (venture_id IS NULL OR venture_id = current_setting('app.current_venture_id', true)::uuid);

CREATE POLICY tests_update_policy ON tests FOR UPDATE
    USING (venture_id IS NULL OR venture_id = current_setting('app.current_venture_id', true)::uuid);

CREATE POLICY tests_delete_policy ON tests FOR DELETE
    USING (venture_id IS NULL OR venture_id = current_setting('app.current_venture_id', true)::uuid);

-- Test runs table policies
CREATE POLICY test_runs_select_policy ON test_runs FOR SELECT
    USING (venture_id IS NULL OR venture_id = current_setting('app.current_venture_id', true)::uuid);

CREATE POLICY test_runs_insert_policy ON test_runs FOR INSERT
    WITH CHECK (venture_id IS NULL OR venture_id = current_setting('app.current_venture_id', true)::uuid);

-- Test fixtures table policies (with shared fixture support)
CREATE POLICY test_fixtures_select_policy ON test_fixtures FOR SELECT
    USING (is_shared = TRUE OR venture_id IS NULL OR venture_id = current_setting('app.current_venture_id', true)::uuid);

CREATE POLICY test_fixtures_insert_policy ON test_fixtures FOR INSERT
    WITH CHECK (venture_id IS NULL OR venture_id = current_setting('app.current_venture_id', true)::uuid);

CREATE POLICY test_fixtures_update_policy ON test_fixtures FOR UPDATE
    USING (venture_id IS NULL OR venture_id = current_setting('app.current_venture_id', true)::uuid);

-- Feature test map policies
CREATE POLICY feature_test_map_select_policy ON feature_test_map FOR SELECT
    USING (venture_id IS NULL OR venture_id = current_setting('app.current_venture_id', true)::uuid);

CREATE POLICY feature_test_map_insert_policy ON feature_test_map FOR INSERT
    WITH CHECK (venture_id IS NULL OR venture_id = current_setting('app.current_venture_id', true)::uuid);

-- Test ownership policies
CREATE POLICY test_ownership_select_policy ON test_ownership FOR SELECT
    USING (venture_id IS NULL OR venture_id = current_setting('app.current_venture_id', true)::uuid);

CREATE POLICY test_ownership_insert_policy ON test_ownership FOR INSERT
    WITH CHECK (venture_id IS NULL OR venture_id = current_setting('app.current_venture_id', true)::uuid);

-- Test performance baselines policies
CREATE POLICY test_perf_baselines_select_policy ON test_performance_baselines FOR SELECT
    USING (venture_id IS NULL OR venture_id = current_setting('app.current_venture_id', true)::uuid);

CREATE POLICY test_perf_baselines_insert_policy ON test_performance_baselines FOR INSERT
    WITH CHECK (venture_id IS NULL OR venture_id = current_setting('app.current_venture_id', true)::uuid);

CREATE POLICY test_perf_baselines_update_policy ON test_performance_baselines FOR UPDATE
    USING (venture_id IS NULL OR venture_id = current_setting('app.current_venture_id', true)::uuid);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to update flakiness rate for a test
CREATE OR REPLACE FUNCTION update_test_flakiness(p_test_id UUID, p_window_days INTEGER DEFAULT 14)
RETURNS VOID AS $$
DECLARE
    v_total_runs INTEGER;
    v_failed_runs INTEGER;
    v_flakiness_rate DECIMAL(5,2);
    v_is_flaky BOOLEAN;
BEGIN
    -- Count runs in the window
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE result IN ('failed', 'flaky'))
    INTO v_total_runs, v_failed_runs
    FROM test_runs
    WHERE test_id = p_test_id
      AND started_at > NOW() - (p_window_days || ' days')::INTERVAL;

    -- Calculate flakiness rate
    IF v_total_runs > 0 THEN
        v_flakiness_rate := (v_failed_runs::DECIMAL / v_total_runs) * 100;
    ELSE
        v_flakiness_rate := 0;
    END IF;

    -- Determine if flaky (>20% failure rate with sufficient samples)
    v_is_flaky := v_total_runs >= 5 AND v_flakiness_rate > 20;

    -- Update the test record
    UPDATE tests
    SET
        flakiness_rate = v_flakiness_rate,
        is_flaky = v_is_flaky,
        last_flaky_at = CASE WHEN v_is_flaky THEN NOW() ELSE last_flaky_at END,
        updated_at = NOW()
    WHERE id = p_test_id;
END;
$$ LANGUAGE plpgsql;

-- Function to check if a test is stale (no runs in 90 days)
CREATE OR REPLACE FUNCTION check_test_staleness(p_days INTEGER DEFAULT 90)
RETURNS TABLE(test_id UUID, test_key TEXT, last_run TIMESTAMPTZ, days_since_run INTEGER) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        t.test_key,
        t.last_run_at,
        EXTRACT(DAY FROM NOW() - t.last_run_at)::INTEGER
    FROM tests t
    WHERE t.status = 'active'
      AND (t.last_run_at IS NULL OR t.last_run_at < NOW() - (p_days || ' days')::INTERVAL);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update test last_run_at on new run
CREATE OR REPLACE FUNCTION update_test_last_run()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE tests
    SET
        last_run_at = NEW.completed_at,
        updated_at = NOW()
    WHERE id = NEW.test_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_test_runs_update_last_run
    AFTER INSERT ON test_runs
    FOR EACH ROW
    EXECUTE FUNCTION update_test_last_run();

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE tests IS 'Central registry of all tests (unit, integration, E2E) with classification and status tracking';
COMMENT ON TABLE test_runs IS 'Execution history for tests with full details including errors and artifacts';
COMMENT ON TABLE test_fixtures IS 'Reusable test data definitions for consistent test setup';
COMMENT ON TABLE feature_test_map IS 'Mapping between source code features/files and their associated tests';
COMMENT ON TABLE test_ownership IS 'Test ownership assignments for responsibility tracking';
COMMENT ON TABLE test_performance_baselines IS 'Performance baselines for detecting duration regressions';

COMMENT ON COLUMN tests.criticality_tier IS 'P0=Critical (always run), P1=Important (run on changes), P2=Nice to have';
COMMENT ON COLUMN tests.flakiness_rate IS 'Percentage of failures in recent runs (0-100)';
COMMENT ON COLUMN test_runs.result IS 'Test outcome: passed, failed, skipped, flaky (passed on retry), timeout, error';
COMMENT ON COLUMN feature_test_map.confidence IS 'Confidence in the mapping (0-1), lower for indirect/inferred mappings';
