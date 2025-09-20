-- LEO Protocol v4.2 - PRD Playwright Test Integration Schema
-- Purpose: Link PRD requirements directly to Playwright verification steps
-- Created: 2025-09-04
-- This schema enables automatic test generation and traceability

-- =====================================================
-- 1. Playwright Test Specifications Table
-- =====================================================
CREATE TABLE IF NOT EXISTS prd_playwright_specifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prd_id VARCHAR(255) NOT NULL REFERENCES product_requirements_v2(id) ON DELETE CASCADE,
    specification_version VARCHAR(20) DEFAULT '1.0',
    
    -- Test Configuration
    base_url VARCHAR(500),
    test_timeout_ms INTEGER DEFAULT 30000,
    viewport_sizes JSONB DEFAULT '[{"name": "desktop", "width": 1920, "height": 1080}, {"name": "mobile", "width": 375, "height": 667}]',
    browsers JSONB DEFAULT '["chromium", "firefox", "webkit"]',
    
    -- Page Objects Definition
    page_objects JSONB DEFAULT '{}', -- { "LoginPage": { "selectors": {...}, "actions": {...} } }
    shared_selectors JSONB DEFAULT '{}', -- Common selectors across tests
    test_data_fixtures JSONB DEFAULT '{}', -- Test data for scenarios
    
    -- API Endpoints to Validate
    api_endpoints JSONB DEFAULT '[]', -- [{ "method": "GET", "path": "/api/users", "expectedStatus": 200 }]
    
    -- Visual Testing Configuration
    visual_regression_enabled BOOLEAN DEFAULT TRUE,
    screenshot_baseline_path VARCHAR(500),
    visual_threshold DECIMAL(3,2) DEFAULT 0.2,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT 'PLAN'
);

-- =====================================================
-- 2. PRD Playwright Test Scenarios
-- =====================================================
CREATE TABLE IF NOT EXISTS prd_playwright_scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prd_id VARCHAR(255) NOT NULL REFERENCES product_requirements_v2(id) ON DELETE CASCADE,
    requirement_id VARCHAR(100) NOT NULL, -- Links to functional_requirements in PRD
    scenario_id VARCHAR(100) UNIQUE NOT NULL, -- e.g., "SDIP-001-TEST-01"
    
    -- Scenario Definition
    scenario_name VARCHAR(500) NOT NULL,
    scenario_description TEXT,
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    test_type VARCHAR(50) DEFAULT 'e2e' CHECK (test_type IN ('e2e', 'integration', 'component', 'visual', 'api', 'performance')),
    
    -- Playwright Test Steps
    preconditions JSONB DEFAULT '[]', -- Setup steps before test
    test_steps JSONB NOT NULL, -- Main test flow
    /* Example test_steps structure:
    [
        {
            "step": 1,
            "action": "navigate",
            "target": "{{baseUrl}}/dashboard",
            "data": null,
            "assertion": { "type": "url", "expected": "/dashboard" }
        },
        {
            "step": 2,
            "action": "click",
            "target": "[data-testid='directive-lab-tab']",
            "data": null,
            "assertion": { "type": "visible", "selector": ".directive-lab-container" }
        },
        {
            "step": 3,
            "action": "fill",
            "target": "[data-testid='feedback-input']",
            "data": "Chairman feedback text",
            "assertion": { "type": "value", "expected": "Chairman feedback text" }
        },
        {
            "step": 4,
            "action": "screenshot",
            "target": "fullPage",
            "data": { "name": "feedback-entered" },
            "assertion": null
        }
    ]
    */
    
    -- Expected Results
    expected_results JSONB NOT NULL, -- What should happen
    success_criteria JSONB DEFAULT '[]', -- Specific assertions
    
    -- Playwright Assertions
    assertions JSONB NOT NULL DEFAULT '[]',
    /* Example assertions:
    [
        { "type": "toBeVisible", "selector": "[data-testid='submit-button']" },
        { "type": "toHaveText", "selector": ".status", "text": "Success" },
        { "type": "toHaveURL", "pattern": "/dashboard/success" },
        { "type": "toHaveScreenshot", "name": "final-state.png" }
    ]
    */
    
    -- Test Data
    test_data JSONB DEFAULT '{}', -- Input data for the scenario
    mock_data JSONB DEFAULT '{}', -- API mocks if needed
    
    -- Cleanup
    cleanup_steps JSONB DEFAULT '[]', -- Post-test cleanup
    
    -- Execution Tracking
    auto_generated BOOLEAN DEFAULT FALSE,
    last_executed TIMESTAMP WITH TIME ZONE,
    last_result VARCHAR(20), -- 'passed', 'failed', 'skipped'
    execution_count INTEGER DEFAULT 0,
    average_duration_ms INTEGER,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_prd_requirement_scenario UNIQUE(prd_id, requirement_id, scenario_id)
);

-- =====================================================
-- 3. Test Verification Mapping Table
-- =====================================================
CREATE TABLE IF NOT EXISTS prd_test_verification_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prd_id VARCHAR(255) NOT NULL REFERENCES product_requirements_v2(id) ON DELETE CASCADE,
    requirement_id VARCHAR(100) NOT NULL,
    scenario_id VARCHAR(100) REFERENCES prd_playwright_scenarios(scenario_id) ON DELETE CASCADE,
    
    -- Verification Details
    verification_type VARCHAR(50) NOT NULL, -- 'automated', 'manual', 'hybrid'
    verification_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'in_progress', 'passed', 'failed', 'blocked'
    
    -- Test File Information
    test_file_path VARCHAR(500), -- e.g., "tests/e2e/sdip-001-test.spec.js"
    test_function_name VARCHAR(255), -- e.g., "test('SDIP-001: Feedback Submission')"
    line_number INTEGER, -- Line in test file
    
    -- Execution Results
    last_run_id VARCHAR(255),
    last_run_date TIMESTAMP WITH TIME ZONE,
    last_run_status VARCHAR(20),
    last_run_duration_ms INTEGER,
    failure_reason TEXT,
    
    -- Evidence
    screenshot_paths JSONB DEFAULT '[]',
    video_path VARCHAR(500),
    trace_path VARCHAR(500),
    report_path VARCHAR(500),
    
    -- Playwright Specific
    playwright_test_id VARCHAR(255), -- Internal Playwright test ID
    playwright_project VARCHAR(100), -- e.g., "chromium", "firefox"
    playwright_retry_count INTEGER DEFAULT 0,
    
    -- Coverage Metrics
    code_coverage_percent DECIMAL(5,2),
    requirement_coverage_percent DECIMAL(5,2),
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    verified_by VARCHAR(100),
    
    CONSTRAINT unique_verification_mapping UNIQUE(prd_id, requirement_id, scenario_id)
);

-- =====================================================
-- 4. Playwright Test Generation Queue
-- =====================================================
CREATE TABLE IF NOT EXISTS playwright_generation_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prd_id VARCHAR(255) NOT NULL REFERENCES product_requirements_v2(id) ON DELETE CASCADE,
    
    -- Generation Request
    request_type VARCHAR(50) NOT NULL, -- 'full_suite', 'single_scenario', 'update_existing'
    priority VARCHAR(20) DEFAULT 'medium',
    requested_by VARCHAR(100) NOT NULL,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Generation Status
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'generating', 'completed', 'failed'
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Generation Output
    generated_files JSONB DEFAULT '[]', -- List of generated test files
    generation_log TEXT,
    error_message TEXT,
    
    -- Configuration
    config JSONB DEFAULT '{}', -- Generation configuration overrides
    
    -- Metadata
    processed_by VARCHAR(100), -- 'Testing Sub-Agent' or specific handler
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3
);

-- =====================================================
-- 5. Test Data Fixtures Table
-- =====================================================
CREATE TABLE IF NOT EXISTS prd_test_fixtures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prd_id VARCHAR(255) NOT NULL REFERENCES product_requirements_v2(id) ON DELETE CASCADE,
    fixture_name VARCHAR(255) NOT NULL,
    fixture_type VARCHAR(50) NOT NULL, -- 'user', 'data', 'state', 'mock'
    
    -- Fixture Data
    fixture_data JSONB NOT NULL,
    description TEXT,
    
    -- Usage Tracking
    used_in_scenarios JSONB DEFAULT '[]', -- List of scenario_ids using this fixture
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_prd_fixture UNIQUE(prd_id, fixture_name)
);

-- =====================================================
-- 6. Create Indexes for Performance
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_playwright_specs_prd ON prd_playwright_specifications(prd_id);
CREATE INDEX IF NOT EXISTS idx_playwright_scenarios_prd ON prd_playwright_scenarios(prd_id);
CREATE INDEX IF NOT EXISTS idx_playwright_scenarios_requirement ON prd_playwright_scenarios(requirement_id);
CREATE INDEX IF NOT EXISTS idx_playwright_scenarios_priority ON prd_playwright_scenarios(priority);
CREATE INDEX IF NOT EXISTS idx_verification_mapping_prd ON prd_test_verification_mapping(prd_id);
CREATE INDEX IF NOT EXISTS idx_verification_mapping_status ON prd_test_verification_mapping(verification_status);
CREATE INDEX IF NOT EXISTS idx_generation_queue_status ON playwright_generation_queue(status);
CREATE INDEX IF NOT EXISTS idx_generation_queue_prd ON playwright_generation_queue(prd_id);
CREATE INDEX IF NOT EXISTS idx_test_fixtures_prd ON prd_test_fixtures(prd_id);

-- =====================================================
-- 7. Create Helper Views
-- =====================================================

-- View: PRD Test Coverage Summary
CREATE OR REPLACE VIEW prd_test_coverage_summary AS
SELECT 
    pr.id as prd_id,
    pr.title as prd_title,
    pr.status as prd_status,
    COUNT(DISTINCT ps.requirement_id) as requirements_with_tests,
    COUNT(DISTINCT ps.scenario_id) as total_test_scenarios,
    COUNT(DISTINCT CASE WHEN ps.last_result = 'passed' THEN ps.scenario_id END) as passed_scenarios,
    COUNT(DISTINCT CASE WHEN ps.last_result = 'failed' THEN ps.scenario_id END) as failed_scenarios,
    AVG(vm.requirement_coverage_percent) as avg_requirement_coverage,
    MAX(ps.last_executed) as last_test_run,
    CASE 
        WHEN COUNT(DISTINCT ps.scenario_id) = 0 THEN 0
        ELSE (COUNT(DISTINCT CASE WHEN ps.last_result = 'passed' THEN ps.scenario_id END) * 100.0 / 
              COUNT(DISTINCT ps.scenario_id))
    END as test_pass_rate
FROM product_requirements_v2 pr
LEFT JOIN prd_playwright_scenarios ps ON pr.id = ps.prd_id
LEFT JOIN prd_test_verification_mapping vm ON pr.id = vm.prd_id
GROUP BY pr.id, pr.title, pr.status;

-- View: Pending Test Generations
CREATE OR REPLACE VIEW pending_test_generations AS
SELECT 
    pq.id,
    pq.prd_id,
    pr.title as prd_title,
    pq.request_type,
    pq.priority,
    pq.requested_by,
    pq.requested_at,
    pq.status,
    pq.retry_count,
    (pq.requested_at + INTERVAL '1 hour' * pq.retry_count) as next_retry_at
FROM playwright_generation_queue pq
JOIN product_requirements_v2 pr ON pq.prd_id = pr.id
WHERE pq.status IN ('pending', 'generating')
ORDER BY 
    CASE pq.priority 
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
    END,
    pq.requested_at;

-- =====================================================
-- 8. Helper Functions
-- =====================================================

-- Function: Generate Playwright test from PRD requirement
CREATE OR REPLACE FUNCTION generate_playwright_test_scenario(
    p_prd_id VARCHAR(255),
    p_requirement_id VARCHAR(100)
)
RETURNS UUID AS $$
DECLARE
    v_scenario_id UUID;
    v_scenario_code VARCHAR(100);
BEGIN
    -- Generate unique scenario code
    v_scenario_code := p_requirement_id || '-TEST-' || to_char(CURRENT_TIMESTAMP, 'YYYYMMDDHH24MISS');
    
    -- Create scenario record
    INSERT INTO prd_playwright_scenarios (
        prd_id, 
        requirement_id, 
        scenario_id,
        scenario_name,
        test_steps,
        expected_results,
        assertions,
        auto_generated
    ) VALUES (
        p_prd_id,
        p_requirement_id,
        v_scenario_code,
        'Auto-generated test for ' || p_requirement_id,
        '[]'::jsonb,
        '[]'::jsonb,
        '[]'::jsonb,
        TRUE
    ) RETURNING id INTO v_scenario_id;
    
    -- Queue for generation
    INSERT INTO playwright_generation_queue (
        prd_id,
        request_type,
        requested_by
    ) VALUES (
        p_prd_id,
        'single_scenario',
        'System'
    );
    
    RETURN v_scenario_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Calculate test coverage for PRD
CREATE OR REPLACE FUNCTION calculate_prd_test_coverage(p_prd_id VARCHAR(255))
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
    v_total_requirements INTEGER;
    v_covered_requirements INTEGER;
    v_total_scenarios INTEGER;
    v_passed_scenarios INTEGER;
BEGIN
    -- Get requirement counts
    SELECT 
        jsonb_array_length(functional_requirements)
    INTO v_total_requirements
    FROM product_requirements_v2
    WHERE id = p_prd_id;
    
    -- Get coverage stats
    SELECT 
        COUNT(DISTINCT requirement_id),
        COUNT(*),
        COUNT(CASE WHEN last_result = 'passed' THEN 1 END)
    INTO v_covered_requirements, v_total_scenarios, v_passed_scenarios
    FROM prd_playwright_scenarios
    WHERE prd_id = p_prd_id;
    
    -- Build result
    v_result := jsonb_build_object(
        'prd_id', p_prd_id,
        'total_requirements', COALESCE(v_total_requirements, 0),
        'covered_requirements', COALESCE(v_covered_requirements, 0),
        'coverage_percent', CASE 
            WHEN v_total_requirements > 0 
            THEN ROUND((v_covered_requirements::NUMERIC / v_total_requirements) * 100, 2)
            ELSE 0 
        END,
        'total_scenarios', COALESCE(v_total_scenarios, 0),
        'passed_scenarios', COALESCE(v_passed_scenarios, 0),
        'pass_rate', CASE 
            WHEN v_total_scenarios > 0 
            THEN ROUND((v_passed_scenarios::NUMERIC / v_total_scenarios) * 100, 2)
            ELSE 0 
        END,
        'status', CASE
            WHEN v_covered_requirements = 0 THEN 'no_tests'
            WHEN v_covered_requirements < v_total_requirements THEN 'partial_coverage'
            WHEN v_passed_scenarios = v_total_scenarios THEN 'all_passing'
            ELSE 'has_failures'
        END
    );
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 9. Triggers for Automatic Updates
-- =====================================================

-- Trigger: Update timestamps
CREATE TRIGGER update_playwright_specs_timestamp
    BEFORE UPDATE ON prd_playwright_specifications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_playwright_scenarios_timestamp
    BEFORE UPDATE ON prd_playwright_scenarios
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_verification_mapping_timestamp
    BEFORE UPDATE ON prd_test_verification_mapping
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 10. Initial Test Scenario Templates
-- =====================================================

-- Insert default test step templates for common actions
INSERT INTO prd_test_fixtures (
    prd_id,
    fixture_name,
    fixture_type,
    fixture_data,
    description
) VALUES 
(
    'TEMPLATE-PRD',
    'common-test-steps',
    'data',
    '{
        "navigation": {
            "action": "navigate",
            "target": "{{url}}",
            "assertion": {"type": "url", "pattern": "{{expectedUrl}}"}
        },
        "click": {
            "action": "click",
            "target": "{{selector}}",
            "assertion": {"type": "visible", "selector": "{{resultSelector}}"}
        },
        "fill": {
            "action": "fill",
            "target": "{{selector}}",
            "data": "{{value}}",
            "assertion": {"type": "value", "expected": "{{value}}"}
        },
        "screenshot": {
            "action": "screenshot",
            "target": "{{scope}}",
            "data": {"name": "{{screenshotName}}"}
        },
        "api-check": {
            "action": "api-request",
            "target": "{{endpoint}}",
            "data": {"method": "{{method}}", "body": "{{body}}"},
            "assertion": {"type": "status", "expected": "{{statusCode}}"}
        },
        "wait": {
            "action": "wait",
            "target": "{{selector}}",
            "data": {"state": "{{state}}", "timeout": "{{timeout}}"}
        }
    }'::jsonb,
    'Common test step templates for Playwright scenario generation'
)
ON CONFLICT (prd_id, fixture_name) DO NOTHING;

-- =====================================================
-- 11. Comments for Documentation
-- =====================================================
COMMENT ON TABLE prd_playwright_specifications IS 'Stores Playwright test configuration for each PRD';
COMMENT ON TABLE prd_playwright_scenarios IS 'Detailed test scenarios with Playwright-ready steps and assertions';
COMMENT ON TABLE prd_test_verification_mapping IS 'Maps PRD requirements to actual Playwright test executions';
COMMENT ON TABLE playwright_generation_queue IS 'Queue for automated test generation from PRD specifications';
COMMENT ON TABLE prd_test_fixtures IS 'Reusable test data and fixtures for Playwright scenarios';

COMMENT ON FUNCTION generate_playwright_test_scenario IS 'Generates a Playwright test scenario for a PRD requirement';
COMMENT ON FUNCTION calculate_prd_test_coverage IS 'Calculates test coverage metrics for a given PRD';

-- =====================================================
-- 12. Grant Permissions (adjust for your environment)
-- =====================================================
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO leo_testing_agent;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO leo_testing_agent;