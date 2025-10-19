-- UAT Simple Tracking System
-- Minimal 5-table schema for UAT execution and governance
-- Database-first design for EHG_Engineering

-- =========================================
-- 1. UAT Runs - Test execution sessions
-- =========================================
CREATE TABLE IF NOT EXISTS uat_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app VARCHAR(50) DEFAULT 'EHG',
    env_url TEXT NOT NULL,
    app_version VARCHAR(50),
    browser VARCHAR(50),
    role VARCHAR(50), -- Admin, Manager, User, Guest
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    created_by VARCHAR(100) DEFAULT 'UAT_LEAD',
    notes TEXT
);

-- =========================================
-- 2. UAT Cases - Test catalog from script
-- =========================================
CREATE TABLE IF NOT EXISTS uat_cases (
    id TEXT PRIMARY KEY, -- TEST-AUTH-001 format
    section VARCHAR(50) NOT NULL, -- Authentication, Dashboard, etc.
    priority VARCHAR(20) DEFAULT 'high', -- critical, high, medium, low
    title TEXT NOT NULL,
    UNIQUE(id)
);

-- =========================================
-- 3. UAT Results - Test execution outcomes
-- =========================================
CREATE TABLE IF NOT EXISTS uat_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES uat_runs(id) ON DELETE CASCADE,
    case_id TEXT REFERENCES uat_cases(id),
    status VARCHAR(20) NOT NULL CHECK (status IN ('PASS', 'FAIL', 'BLOCKED', 'NA')),
    evidence_url TEXT, -- Screenshot or page URL
    evidence_heading TEXT, -- Page heading or element text
    evidence_toast TEXT, -- Toast/error message if any
    notes TEXT,
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(run_id, case_id)
);

-- =========================================
-- 4. UAT Defects - Auto-generated issues
-- =========================================
CREATE TABLE IF NOT EXISTS uat_defects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES uat_runs(id) ON DELETE CASCADE,
    case_id TEXT REFERENCES uat_cases(id),
    severity VARCHAR(20) CHECK (severity IN ('critical', 'major', 'minor', 'trivial')),
    summary TEXT NOT NULL,
    steps TEXT,
    expected TEXT,
    actual TEXT,
    suspected_files JSONB, -- [{path: string, line?: number, reason: string, confidence: number}]
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'wont_fix')),
    assignee VARCHAR(100),
    found_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================
-- 5. View: Run Statistics & Gate Status
-- =========================================
CREATE OR REPLACE VIEW v_uat_run_stats AS
WITH run_counts AS (
    SELECT
        r.id as run_id,
        r.app,
        r.env_url,
        r.started_at,
        r.ended_at,
        COUNT(res.id) as executed,
        COUNT(CASE WHEN res.status = 'PASS' THEN 1 END) as passed,
        COUNT(CASE WHEN res.status = 'FAIL' THEN 1 END) as failed,
        COUNT(CASE WHEN res.status = 'BLOCKED' THEN 1 END) as blocked,
        COUNT(CASE WHEN res.status = 'NA' THEN 1 END) as na
    FROM uat_runs r
    LEFT JOIN uat_results res ON r.id = res.run_id
    GROUP BY r.id, r.app, r.env_url, r.started_at, r.ended_at
),
defect_counts AS (
    SELECT
        run_id,
        COUNT(CASE WHEN severity = 'critical' AND status = 'open' THEN 1 END) as open_criticals,
        COUNT(*) as total_defects
    FROM uat_defects
    GROUP BY run_id
)
SELECT
    rc.*,
    dc.open_criticals,
    dc.total_defects,
    -- Pass rate calculation: PASS / (PASS + FAIL + BLOCKED), excluding NA
    CASE
        WHEN (rc.passed + rc.failed + rc.blocked) = 0 THEN 0
        ELSE ROUND(rc.passed::numeric / (rc.passed + rc.failed + rc.blocked) * 100, 2)
    END as pass_rate,
    -- Gate status computation
    CASE
        WHEN (rc.passed + rc.failed + rc.blocked) = 0 THEN 'NOT_STARTED'
        WHEN ROUND(rc.passed::numeric / (rc.passed + rc.failed + rc.blocked) * 100, 2) >= 85
             AND COALESCE(dc.open_criticals, 0) = 0 THEN 'GREEN'
        WHEN ROUND(rc.passed::numeric / (rc.passed + rc.failed + rc.blocked) * 100, 2) >= 85
             AND COALESCE(dc.open_criticals, 0) > 0 THEN 'YELLOW'
        ELSE 'RED'
    END as gate_status,
    -- Gate rationale
    CASE
        WHEN (rc.passed + rc.failed + rc.blocked) = 0 THEN 'No tests executed yet'
        WHEN ROUND(rc.passed::numeric / (rc.passed + rc.failed + rc.blocked) * 100, 2) >= 85
             AND COALESCE(dc.open_criticals, 0) = 0 THEN 'Pass rate ≥85% and no critical defects'
        WHEN ROUND(rc.passed::numeric / (rc.passed + rc.failed + rc.blocked) * 100, 2) >= 85
             AND COALESCE(dc.open_criticals, 0) > 0 THEN 'Pass rate ≥85% but has ' || dc.open_criticals || ' critical defect(s)'
        ELSE 'Pass rate below 85% threshold'
    END as gate_rationale
FROM run_counts rc
LEFT JOIN defect_counts dc ON rc.run_id = dc.run_id;

-- =========================================
-- Gate Status Function (for programmatic access)
-- =========================================
CREATE OR REPLACE FUNCTION uat_gate_status(p_run_id UUID)
RETURNS TABLE(
    gate_color VARCHAR,
    pass_rate NUMERIC,
    open_criticals BIGINT,
    recommendation VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        v.gate_status as gate_color,
        v.pass_rate,
        COALESCE(v.open_criticals, 0) as open_criticals,
        CASE
            WHEN v.gate_status = 'GREEN' THEN 'GO - Ready for production'
            WHEN v.gate_status = 'YELLOW' THEN 'GO with conditions - Address critical defects before production'
            WHEN v.gate_status = 'RED' THEN 'NO-GO - Improve pass rate and fix defects'
            ELSE 'NOT_READY - Continue testing'
        END as recommendation
    FROM v_uat_run_stats v
    WHERE v.run_id = p_run_id;
END;
$$ LANGUAGE plpgsql;

-- =========================================
-- RPC Function: Atomic Result Upsert
-- =========================================
CREATE OR REPLACE FUNCTION upsert_uat_result(
    p_run_id UUID,
    p_case_id TEXT,
    p_status VARCHAR,
    p_evidence_url TEXT DEFAULT NULL,
    p_evidence_heading TEXT DEFAULT NULL,
    p_evidence_toast TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_result_id UUID;
    v_stats JSON;
BEGIN
    -- Upsert the result
    INSERT INTO uat_results (run_id, case_id, status, evidence_url, evidence_heading, evidence_toast, notes)
    VALUES (p_run_id, p_case_id, p_status, p_evidence_url, p_evidence_heading, p_evidence_toast, p_notes)
    ON CONFLICT (run_id, case_id)
    DO UPDATE SET
        status = EXCLUDED.status,
        evidence_url = EXCLUDED.evidence_url,
        evidence_heading = EXCLUDED.evidence_heading,
        evidence_toast = EXCLUDED.evidence_toast,
        notes = EXCLUDED.notes,
        recorded_at = NOW()
    RETURNING id INTO v_result_id;

    -- Get updated stats
    SELECT row_to_json(s) INTO v_stats
    FROM v_uat_run_stats s
    WHERE s.run_id = p_run_id;

    RETURN json_build_object(
        'result_id', v_result_id,
        'case_id', p_case_id,
        'status', p_status,
        'stats', v_stats
    );
END;
$$ LANGUAGE plpgsql;

-- =========================================
-- RPC Function: Create Defect with Intelligence
-- =========================================
CREATE OR REPLACE FUNCTION create_uat_defect(
    p_run_id UUID,
    p_case_id TEXT,
    p_severity VARCHAR DEFAULT 'major',
    p_summary TEXT DEFAULT NULL,
    p_suspected_files JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_defect_id UUID;
    v_test_info RECORD;
    v_result_info RECORD;
    v_auto_summary TEXT;
BEGIN
    -- Get test case info
    SELECT * INTO v_test_info FROM uat_cases WHERE id = p_case_id;

    -- Get latest result info
    SELECT * INTO v_result_info
    FROM uat_results
    WHERE run_id = p_run_id AND case_id = p_case_id
    ORDER BY recorded_at DESC
    LIMIT 1;

    -- Generate auto summary if not provided
    v_auto_summary := COALESCE(
        p_summary,
        v_test_info.title || ' failed - ' || COALESCE(v_result_info.evidence_toast, v_result_info.notes, 'See details')
    );

    -- Create defect
    INSERT INTO uat_defects (
        run_id,
        case_id,
        severity,
        summary,
        steps,
        expected,
        actual,
        suspected_files,
        status
    )
    VALUES (
        p_run_id,
        p_case_id,
        p_severity,
        v_auto_summary,
        'Execute test case: ' || p_case_id,
        'Test should pass as per acceptance criteria',
        COALESCE(v_result_info.notes, 'Test failed. ' || COALESCE(v_result_info.evidence_toast, '')),
        COALESCE(p_suspected_files, '[]'::jsonb),
        'open'
    )
    RETURNING id INTO v_defect_id;

    RETURN v_defect_id;
END;
$$ LANGUAGE plpgsql;

-- =========================================
-- RLS Policies
-- =========================================

-- Enable RLS on all tables
ALTER TABLE uat_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE uat_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE uat_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE uat_defects ENABLE ROW LEVEL SECURITY;

-- Chairman (read-only access to all)
CREATE POLICY uat_runs_chairman_read ON uat_runs
    FOR SELECT
    USING (auth.jwt() ->> 'role' = 'chairman' OR auth.jwt() ->> 'email' LIKE '%@chairman%');

CREATE POLICY uat_cases_chairman_read ON uat_cases
    FOR SELECT
    USING (auth.jwt() ->> 'role' = 'chairman' OR auth.jwt() ->> 'email' LIKE '%@chairman%');

CREATE POLICY uat_results_chairman_read ON uat_results
    FOR SELECT
    USING (auth.jwt() ->> 'role' = 'chairman' OR auth.jwt() ->> 'email' LIKE '%@chairman%');

CREATE POLICY uat_defects_chairman_read ON uat_defects
    FOR SELECT
    USING (auth.jwt() ->> 'role' = 'chairman' OR auth.jwt() ->> 'email' LIKE '%@chairman%');

-- Service role and agents (full access)
CREATE POLICY uat_runs_service_all ON uat_runs
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role' OR current_user = 'service_role');

CREATE POLICY uat_cases_service_all ON uat_cases
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role' OR current_user = 'service_role');

CREATE POLICY uat_results_service_all ON uat_results
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role' OR current_user = 'service_role');

CREATE POLICY uat_defects_service_all ON uat_defects
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role' OR current_user = 'service_role');

-- Authenticated users (read access)
CREATE POLICY uat_runs_auth_read ON uat_runs
    FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY uat_cases_auth_read ON uat_cases
    FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY uat_results_auth_read ON uat_results
    FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY uat_defects_auth_read ON uat_defects
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- =========================================
-- Indexes for Performance
-- =========================================
CREATE INDEX IF NOT EXISTS idx_uat_results_run_case ON uat_results(run_id, case_id);
CREATE INDEX IF NOT EXISTS idx_uat_results_status ON uat_results(status);
CREATE INDEX IF NOT EXISTS idx_uat_defects_run_id ON uat_defects(run_id);
CREATE INDEX IF NOT EXISTS idx_uat_defects_status ON uat_defects(status);
CREATE INDEX IF NOT EXISTS idx_uat_defects_severity ON uat_defects(severity);

-- =========================================
-- Initial Test Case Seed Data
-- =========================================
INSERT INTO uat_cases (id, section, priority, title) VALUES
-- Authentication (7 tests)
('TEST-AUTH-001', 'Authentication', 'critical', 'Standard Login'),
('TEST-AUTH-002', 'Authentication', 'critical', 'Invalid Credentials'),
('TEST-AUTH-003', 'Authentication', 'high', 'Password Reset'),
('TEST-AUTH-004', 'Authentication', 'high', 'Session Timeout'),
('TEST-AUTH-005', 'Authentication', 'high', 'Logout Functionality'),
('TEST-AUTH-006', 'Authentication', 'medium', 'Remember Me'),
('TEST-AUTH-007', 'Authentication', 'high', 'Multi-Factor Authentication'),
-- Dashboard (5 tests)
('TEST-DASH-001', 'Dashboard', 'critical', 'Dashboard Initial Load'),
('TEST-DASH-002', 'Dashboard', 'high', 'Key Metrics Display'),
('TEST-DASH-003', 'Dashboard', 'high', 'Real-time Updates'),
('TEST-DASH-004', 'Dashboard', 'medium', 'Customization Options'),
('TEST-DASH-005', 'Dashboard', 'medium', 'Date Range Filters'),
-- Ventures (10 tests)
('TEST-VENT-001', 'Ventures', 'critical', 'View All Ventures'),
('TEST-VENT-002', 'Ventures', 'high', 'Search Ventures'),
('TEST-VENT-003', 'Ventures', 'high', 'Filter Ventures'),
('TEST-VENT-004', 'Ventures', 'critical', 'Create New Venture'),
('TEST-VENT-005', 'Ventures', 'high', 'Edit Venture Details'),
('TEST-VENT-006', 'Ventures', 'high', 'Delete Venture'),
('TEST-VENT-007', 'Ventures', 'high', 'Venture Status Management'),
('TEST-VENT-008', 'Ventures', 'high', 'View Venture Details'),
('TEST-VENT-009', 'Ventures', 'medium', 'Document Management'),
('TEST-VENT-010', 'Ventures', 'high', 'Financial Metrics'),
-- Portfolio (4 tests)
('TEST-PORT-001', 'Portfolio', 'high', 'Create Portfolio'),
('TEST-PORT-002', 'Portfolio', 'high', 'Add Ventures to Portfolio'),
('TEST-PORT-003', 'Portfolio', 'high', 'Portfolio Analytics'),
('TEST-PORT-004', 'Portfolio', 'medium', 'Portfolio Sharing'),
-- AI Agents (4 tests)
('TEST-AI-001', 'AI_Agents', 'high', 'EVA Chat Interface'),
('TEST-AI-002', 'AI_Agents', 'medium', 'AI Agent Configuration'),
('TEST-AI-003', 'AI_Agents', 'medium', 'Voice Commands'),
('TEST-AI-004', 'AI_Agents', 'high', 'Context Awareness'),
-- Governance (3 tests)
('TEST-GOV-001', 'Governance', 'high', 'Policy Management'),
('TEST-GOV-002', 'Governance', 'high', 'Compliance Tracking'),
('TEST-GOV-003', 'Governance', 'critical', 'Audit Trail'),
-- Team (3 tests)
('TEST-TEAM-001', 'Team', 'high', 'Team Member Management'),
('TEST-TEAM-002', 'Team', 'medium', 'Collaboration Features'),
('TEST-TEAM-003', 'Team', 'high', 'Permission Inheritance'),
-- Reports (4 tests)
('TEST-RPT-001', 'Reports', 'high', 'Generate Standard Reports'),
('TEST-RPT-002', 'Reports', 'medium', 'Custom Report Builder'),
('TEST-RPT-003', 'Reports', 'high', 'Export Functionality'),
('TEST-RPT-004', 'Reports', 'medium', 'Scheduled Reports'),
-- Settings (3 tests)
('TEST-SET-001', 'Settings', 'high', 'User Profile Management'),
('TEST-SET-002', 'Settings', 'critical', 'System Configuration'),
('TEST-SET-003', 'Settings', 'high', 'Integration Settings'),
-- Notifications (3 tests)
('TEST-NOT-001', 'Notifications', 'high', 'In-App Notifications'),
('TEST-NOT-002', 'Notifications', 'medium', 'Email Notifications'),
('TEST-NOT-003', 'Notifications', 'medium', 'Notification Preferences'),
-- Performance (3 tests)
('TEST-PERF-001', 'Performance', 'critical', 'Page Load Times'),
('TEST-PERF-002', 'Performance', 'high', 'Concurrent Users'),
('TEST-PERF-003', 'Performance', 'high', 'Large Data Sets'),
-- Accessibility (3 tests)
('TEST-ACC-001', 'Accessibility', 'high', 'Keyboard Navigation'),
('TEST-ACC-002', 'Accessibility', 'high', 'Screen Reader Compatibility'),
('TEST-ACC-003', 'Accessibility', 'high', 'Color Contrast'),
-- Security (4 tests)
('TEST-SEC-001', 'Security', 'critical', 'SQL Injection'),
('TEST-SEC-002', 'Security', 'critical', 'Cross-Site Scripting (XSS)'),
('TEST-SEC-003', 'Security', 'critical', 'Authorization Bypass'),
('TEST-SEC-004', 'Security', 'critical', 'Secure Data Transmission'),
-- Browser (5 tests)
('TEST-BROW-001', 'Browser', 'high', 'Chrome Compatibility'),
('TEST-BROW-002', 'Browser', 'high', 'Firefox Compatibility'),
('TEST-BROW-003', 'Browser', 'medium', 'Safari Compatibility'),
('TEST-BROW-004', 'Browser', 'medium', 'Edge Compatibility'),
('TEST-BROW-005', 'Browser', 'high', 'Mobile Browser Testing')
ON CONFLICT (id) DO NOTHING;

-- =========================================
-- Grant Permissions
-- =========================================
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;