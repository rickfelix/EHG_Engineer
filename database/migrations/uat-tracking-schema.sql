-- UAT Tracking Database Schema
-- Comprehensive tables for automated User Acceptance Testing

-- =========================================
-- 1. UAT Test Suites
-- =========================================
CREATE TABLE IF NOT EXISTS uat_test_suites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suite_name VARCHAR(255) NOT NULL,
    description TEXT,
    module VARCHAR(100),
    test_type VARCHAR(50), -- functional, performance, security, accessibility
    priority VARCHAR(20), -- critical, high, medium, low
    status VARCHAR(50) DEFAULT 'active', -- active, inactive, deprecated
    total_tests INTEGER DEFAULT 0,
    passing_tests INTEGER DEFAULT 0,
    failing_tests INTEGER DEFAULT 0,
    skipped_tests INTEGER DEFAULT 0,
    last_run_at TIMESTAMPTZ,
    average_duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(100),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- =========================================
-- 2. UAT Test Cases
-- =========================================
CREATE TABLE IF NOT EXISTS uat_test_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suite_id UUID REFERENCES uat_test_suites(id) ON DELETE CASCADE,
    test_name VARCHAR(255) NOT NULL,
    description TEXT,
    user_story_id VARCHAR(50), -- Reference to user story (US-UAT-XXX)
    test_steps JSONB, -- Array of test steps
    expected_results JSONB, -- Expected outcomes
    test_data JSONB, -- Test data requirements
    preconditions TEXT,
    postconditions TEXT,
    test_type VARCHAR(50),
    priority VARCHAR(20),
    automation_status VARCHAR(50) DEFAULT 'pending', -- pending, automated, manual_only
    playwright_script TEXT, -- Generated Playwright code
    selector_strategy JSONB, -- Element selection strategies
    retry_count INTEGER DEFAULT 3,
    timeout_ms INTEGER DEFAULT 30000,
    is_flaky BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(100),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- =========================================
-- 3. UAT Test Runs
-- =========================================
CREATE TABLE IF NOT EXISTS uat_test_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id VARCHAR(100) UNIQUE NOT NULL, -- Unique identifier for the run
    suite_id UUID REFERENCES uat_test_suites(id),
    sd_id VARCHAR(50), -- Related Strategic Directive
    prd_id VARCHAR(50), -- Related PRD
    environment VARCHAR(50), -- dev, staging, production
    browser VARCHAR(50), -- chrome, firefox, safari, edge
    device_type VARCHAR(50), -- desktop, tablet, mobile
    viewport_width INTEGER,
    viewport_height INTEGER,
    status VARCHAR(50), -- pending, running, completed, failed, cancelled
    total_tests INTEGER DEFAULT 0,
    passed_tests INTEGER DEFAULT 0,
    failed_tests INTEGER DEFAULT 0,
    skipped_tests INTEGER DEFAULT 0,
    pass_rate DECIMAL(5,2),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    triggered_by VARCHAR(100), -- user, schedule, commit, api
    trigger_source VARCHAR(255), -- commit hash, cron expression, etc
    machine_info JSONB, -- OS, CPU, memory info
    test_config JSONB, -- Test configuration used
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- =========================================
-- 4. UAT Test Results
-- =========================================
CREATE TABLE IF NOT EXISTS uat_test_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES uat_test_runs(id) ON DELETE CASCADE,
    test_case_id UUID REFERENCES uat_test_cases(id),
    status VARCHAR(50), -- passed, failed, skipped, error
    duration_ms INTEGER,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    error_stack TEXT,
    actual_results JSONB,
    screenshots JSONB, -- Array of screenshot URLs
    video_url TEXT,
    console_logs TEXT,
    network_logs JSONB,
    performance_metrics JSONB, -- Load time, memory usage, etc
    accessibility_violations JSONB,
    retry_attempts INTEGER DEFAULT 0,
    is_flaky_failure BOOLEAN DEFAULT FALSE,
    failure_category VARCHAR(100), -- assertion, timeout, network, element_not_found
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- =========================================
-- 5. UAT Issues/Bugs
-- =========================================
CREATE TABLE IF NOT EXISTS uat_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_key VARCHAR(50) UNIQUE NOT NULL, -- BUG-UAT-XXX
    test_result_id UUID REFERENCES uat_test_results(id),
    test_case_id UUID REFERENCES uat_test_cases(id),
    run_id UUID REFERENCES uat_test_runs(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    severity VARCHAR(20), -- critical, major, minor, trivial
    priority VARCHAR(20), -- critical, high, medium, low
    status VARCHAR(50) DEFAULT 'open', -- open, in_progress, resolved, closed, wont_fix
    issue_type VARCHAR(50), -- bug, performance, security, accessibility, ui
    affected_module VARCHAR(100),
    affected_url TEXT,
    steps_to_reproduce TEXT,
    expected_behavior TEXT,
    actual_behavior TEXT,
    screenshots JSONB,
    browser_info VARCHAR(255),
    assignee VARCHAR(100),
    fix_sd_id VARCHAR(50), -- Auto-generated fix Strategic Directive
    resolution TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(100),
    verified_in_run_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(100),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- =========================================
-- 6. UAT Coverage Metrics
-- =========================================
CREATE TABLE IF NOT EXISTS uat_coverage_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES uat_test_runs(id),
    metric_date DATE DEFAULT CURRENT_DATE,
    total_components INTEGER,
    tested_components INTEGER,
    component_coverage_pct DECIMAL(5,2),
    total_user_stories INTEGER,
    tested_user_stories INTEGER,
    story_coverage_pct DECIMAL(5,2),
    total_pages INTEGER,
    tested_pages INTEGER,
    page_coverage_pct DECIMAL(5,2),
    total_api_endpoints INTEGER,
    tested_api_endpoints INTEGER,
    api_coverage_pct DECIMAL(5,2),
    code_coverage_pct DECIMAL(5,2),
    branch_coverage_pct DECIMAL(5,2),
    function_coverage_pct DECIMAL(5,2),
    line_coverage_pct DECIMAL(5,2),
    untested_critical_paths TEXT[],
    coverage_gaps JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- =========================================
-- 7. UAT Performance Metrics
-- =========================================
CREATE TABLE IF NOT EXISTS uat_performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES uat_test_runs(id),
    test_result_id UUID REFERENCES uat_test_results(id),
    metric_type VARCHAR(50), -- page_load, api_response, memory, cpu
    page_url TEXT,
    first_contentful_paint_ms INTEGER,
    largest_contentful_paint_ms INTEGER,
    time_to_interactive_ms INTEGER,
    total_blocking_time_ms INTEGER,
    cumulative_layout_shift DECIMAL(10,4),
    speed_index INTEGER,
    dom_content_loaded_ms INTEGER,
    page_load_time_ms INTEGER,
    memory_usage_mb DECIMAL(10,2),
    cpu_usage_pct DECIMAL(5,2),
    network_requests_count INTEGER,
    total_transfer_size_kb DECIMAL(10,2),
    cache_hit_ratio DECIMAL(5,2),
    javascript_errors_count INTEGER,
    performance_score DECIMAL(5,2), -- 0-100 score
    recommendations JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- =========================================
-- 8. UAT Screenshots
-- =========================================
CREATE TABLE IF NOT EXISTS uat_screenshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_result_id UUID REFERENCES uat_test_results(id),
    run_id UUID REFERENCES uat_test_runs(id),
    screenshot_type VARCHAR(50), -- before, after, error, diff
    file_path TEXT,
    storage_url TEXT,
    file_size_kb INTEGER,
    width INTEGER,
    height INTEGER,
    format VARCHAR(20), -- png, jpg, webp
    captured_at TIMESTAMPTZ,
    page_url TEXT,
    element_selector TEXT,
    is_full_page BOOLEAN DEFAULT FALSE,
    has_annotations BOOLEAN DEFAULT FALSE,
    annotations JSONB, -- Highlighted areas, text overlays
    visual_regression_data JSONB, -- Diff percentages, changed pixels
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- =========================================
-- 9. UAT Test Schedules
-- =========================================
CREATE TABLE IF NOT EXISTS uat_test_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_name VARCHAR(255) NOT NULL,
    description TEXT,
    suite_id UUID REFERENCES uat_test_suites(id),
    cron_expression VARCHAR(100), -- Cron format for scheduling
    timezone VARCHAR(50) DEFAULT 'UTC',
    is_active BOOLEAN DEFAULT TRUE,
    environment VARCHAR(50),
    browsers TEXT[], -- Array of browsers to test
    devices TEXT[], -- Array of devices to test
    notification_channels JSONB, -- Email, Slack, webhook configs
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(100),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- =========================================
-- 10. UAT Audit Trail
-- =========================================
CREATE TABLE IF NOT EXISTS uat_audit_trail (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50), -- test_case, test_run, issue, etc
    entity_id UUID,
    action VARCHAR(50), -- created, updated, deleted, executed, failed
    changes JSONB, -- Before/after values
    performed_by VARCHAR(100),
    performed_at TIMESTAMPTZ DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- =========================================
-- Indexes for Performance
-- =========================================
CREATE INDEX idx_uat_test_cases_suite_id ON uat_test_cases(suite_id);
CREATE INDEX idx_uat_test_cases_user_story ON uat_test_cases(user_story_id);
CREATE INDEX idx_uat_test_cases_automation_status ON uat_test_cases(automation_status);

CREATE INDEX idx_uat_test_runs_suite_id ON uat_test_runs(suite_id);
CREATE INDEX idx_uat_test_runs_status ON uat_test_runs(status);
CREATE INDEX idx_uat_test_runs_started_at ON uat_test_runs(started_at DESC);
CREATE INDEX idx_uat_test_runs_sd_id ON uat_test_runs(sd_id);

CREATE INDEX idx_uat_test_results_run_id ON uat_test_results(run_id);
CREATE INDEX idx_uat_test_results_test_case_id ON uat_test_results(test_case_id);
CREATE INDEX idx_uat_test_results_status ON uat_test_results(status);
CREATE INDEX idx_uat_test_results_failure_category ON uat_test_results(failure_category);

CREATE INDEX idx_uat_issues_status ON uat_issues(status);
CREATE INDEX idx_uat_issues_severity ON uat_issues(severity);
CREATE INDEX idx_uat_issues_test_result_id ON uat_issues(test_result_id);
CREATE INDEX idx_uat_issues_fix_sd_id ON uat_issues(fix_sd_id);

CREATE INDEX idx_uat_coverage_metrics_run_id ON uat_coverage_metrics(run_id);
CREATE INDEX idx_uat_coverage_metrics_date ON uat_coverage_metrics(metric_date DESC);

CREATE INDEX idx_uat_performance_metrics_run_id ON uat_performance_metrics(run_id);
CREATE INDEX idx_uat_performance_metrics_type ON uat_performance_metrics(metric_type);

CREATE INDEX idx_uat_screenshots_test_result_id ON uat_screenshots(test_result_id);
CREATE INDEX idx_uat_screenshots_run_id ON uat_screenshots(run_id);

CREATE INDEX idx_uat_audit_trail_entity ON uat_audit_trail(entity_type, entity_id);
CREATE INDEX idx_uat_audit_trail_performed_at ON uat_audit_trail(performed_at DESC);

-- =========================================
-- Views for Reporting
-- =========================================

-- Test execution summary view
CREATE OR REPLACE VIEW uat_execution_summary AS
SELECT
    r.id as run_id,
    r.run_id as run_identifier,
    s.suite_name,
    r.environment,
    r.browser,
    r.status,
    r.total_tests,
    r.passed_tests,
    r.failed_tests,
    r.pass_rate,
    r.started_at,
    r.completed_at,
    r.duration_ms,
    COUNT(DISTINCT i.id) as issues_found
FROM uat_test_runs r
LEFT JOIN uat_test_suites s ON r.suite_id = s.id
LEFT JOIN uat_issues i ON i.run_id = r.id
GROUP BY r.id, s.suite_name;

-- Test health dashboard view
CREATE OR REPLACE VIEW uat_test_health AS
SELECT
    tc.id as test_case_id,
    tc.test_name,
    tc.priority,
    COUNT(tr.id) as total_executions,
    COUNT(CASE WHEN tr.status = 'passed' THEN 1 END) as passed_count,
    COUNT(CASE WHEN tr.status = 'failed' THEN 1 END) as failed_count,
    ROUND(
        COUNT(CASE WHEN tr.status = 'passed' THEN 1 END)::numeric /
        NULLIF(COUNT(tr.id), 0) * 100, 2
    ) as pass_percentage,
    AVG(tr.duration_ms) as avg_duration_ms,
    MAX(tr.created_at) as last_executed_at
FROM uat_test_cases tc
LEFT JOIN uat_test_results tr ON tc.id = tr.test_case_id
GROUP BY tc.id, tc.test_name, tc.priority;

-- =========================================
-- Triggers for Updated Timestamps
-- =========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_uat_test_suites_updated_at
    BEFORE UPDATE ON uat_test_suites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_uat_test_cases_updated_at
    BEFORE UPDATE ON uat_test_cases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_uat_issues_updated_at
    BEFORE UPDATE ON uat_issues
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_uat_test_schedules_updated_at
    BEFORE UPDATE ON uat_test_schedules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =========================================
-- Initial Data Seeding
-- =========================================
INSERT INTO uat_test_suites (suite_name, description, module, test_type, priority)
VALUES
    ('Authentication Tests', 'Comprehensive authentication and security testing', 'Authentication', 'functional', 'critical'),
    ('Dashboard Tests', 'Dashboard functionality and performance testing', 'Dashboard', 'functional', 'high'),
    ('Ventures Tests', 'Ventures module complete testing', 'Ventures', 'functional', 'high'),
    ('Form Validation Tests', 'All form validation testing', 'Forms', 'functional', 'high'),
    ('Performance Tests', 'System performance and load testing', 'Performance', 'performance', 'medium'),
    ('Accessibility Tests', 'WCAG 2.1 AA compliance testing', 'Accessibility', 'accessibility', 'high'),
    ('Error Handling Tests', 'Error scenarios and recovery testing', 'ErrorHandling', 'functional', 'high')
ON CONFLICT DO NOTHING;

-- Grant permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;