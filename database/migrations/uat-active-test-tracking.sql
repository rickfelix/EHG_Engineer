-- UAT Active Test Tracking Migration
-- Adds fields to track which test is currently being executed

-- Add active_case_id to uat_runs table to track current test
ALTER TABLE uat_runs
ADD COLUMN IF NOT EXISTS active_case_id TEXT REFERENCES uat_cases(id),
ADD COLUMN IF NOT EXISTS active_case_started_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS last_activity TIMESTAMP DEFAULT NOW();

-- Add started_at to uat_results for timing tracking
ALTER TABLE uat_results
ADD COLUMN IF NOT EXISTS started_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

-- Create index for faster active test lookups
CREATE INDEX IF NOT EXISTS idx_uat_runs_active_case
ON uat_runs(active_case_id)
WHERE active_case_id IS NOT NULL;

-- Update the view to include active test info
DROP VIEW IF EXISTS v_uat_run_stats;
CREATE VIEW v_uat_run_stats AS
SELECT
    r.id as run_id,
    r.app,
    r.env_url,
    r.browser,
    r.role,
    r.started_at,
    r.ended_at,
    r.created_by,
    r.active_case_id,
    ac.title as active_case_title,
    COUNT(res.id) as total_tests,
    COUNT(CASE WHEN res.status = 'PASS' THEN 1 END) as passed,
    COUNT(CASE WHEN res.status = 'FAIL' THEN 1 END) as failed,
    COUNT(CASE WHEN res.status = 'BLOCKED' THEN 1 END) as blocked,
    COUNT(CASE WHEN res.status = 'NA' THEN 1 END) as na,
    COUNT(CASE WHEN res.status IS NULL THEN 1 END) as not_tested,
    CASE
        WHEN COUNT(CASE WHEN res.status IN ('PASS', 'FAIL', 'BLOCKED') THEN 1 END) = 0 THEN 0
        ELSE ROUND(
            COUNT(CASE WHEN res.status = 'PASS' THEN 1 END)::DECIMAL /
            COUNT(CASE WHEN res.status IN ('PASS', 'FAIL', 'BLOCKED') THEN 1 END) * 100
        )
    END as pass_rate,
    EXISTS(
        SELECT 1 FROM uat_defects d
        WHERE d.run_id = r.id
        AND d.severity = 'critical'
    ) as has_critical_defects,
    CASE
        WHEN COUNT(CASE WHEN res.status IN ('PASS', 'FAIL', 'BLOCKED') THEN 1 END) = 0 THEN 'NOT_STARTED'
        WHEN EXISTS(
            SELECT 1 FROM uat_defects d
            WHERE d.run_id = r.id
            AND d.severity = 'critical'
        ) AND ROUND(
            COUNT(CASE WHEN res.status = 'PASS' THEN 1 END)::DECIMAL /
            NULLIF(COUNT(CASE WHEN res.status IN ('PASS', 'FAIL', 'BLOCKED') THEN 1 END), 0) * 100
        ) >= 85 THEN 'YELLOW'
        WHEN ROUND(
            COUNT(CASE WHEN res.status = 'PASS' THEN 1 END)::DECIMAL /
            NULLIF(COUNT(CASE WHEN res.status IN ('PASS', 'FAIL', 'BLOCKED') THEN 1 END), 0) * 100
        ) >= 85 THEN 'GREEN'
        ELSE 'RED'
    END as gate_status
FROM uat_runs r
LEFT JOIN uat_results res ON r.id = res.run_id
LEFT JOIN uat_cases ac ON r.active_case_id = ac.id
GROUP BY r.id, r.app, r.env_url, r.browser, r.role, r.started_at, r.ended_at, r.created_by, r.active_case_id, ac.title;

-- Function to set active test
CREATE OR REPLACE FUNCTION set_active_test(
    p_run_id UUID,
    p_case_id TEXT
) RETURNS VOID AS $$
BEGIN
    UPDATE uat_runs
    SET
        active_case_id = p_case_id,
        active_case_started_at = NOW(),
        last_activity = NOW()
    WHERE id = p_run_id;

    -- Also create/update the result record with started_at
    INSERT INTO uat_results (run_id, case_id, status, started_at)
    VALUES (p_run_id, p_case_id, NULL, NOW())
    ON CONFLICT (run_id, case_id)
    DO UPDATE SET started_at = EXCLUDED.started_at
    WHERE uat_results.started_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to complete active test
CREATE OR REPLACE FUNCTION complete_active_test(
    p_run_id UUID,
    p_status VARCHAR(10),
    p_notes TEXT DEFAULT NULL,
    p_evidence_url TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    v_case_id TEXT;
    v_started_at TIMESTAMP;
BEGIN
    -- Get the active case
    SELECT active_case_id INTO v_case_id
    FROM uat_runs
    WHERE id = p_run_id;

    IF v_case_id IS NULL THEN
        RAISE EXCEPTION 'No active test for run %', p_run_id;
    END IF;

    -- Get the start time
    SELECT started_at INTO v_started_at
    FROM uat_results
    WHERE run_id = p_run_id AND case_id = v_case_id;

    -- Update the result
    UPDATE uat_results
    SET
        status = p_status,
        notes = p_notes,
        evidence_url = p_evidence_url,
        recorded_at = NOW(),
        duration_seconds = EXTRACT(EPOCH FROM (NOW() - v_started_at))::INTEGER
    WHERE run_id = p_run_id AND case_id = v_case_id;

    -- Clear the active test
    UPDATE uat_runs
    SET
        active_case_id = NULL,
        active_case_started_at = NULL,
        last_activity = NOW()
    WHERE id = p_run_id;
END;
$$ LANGUAGE plpgsql;