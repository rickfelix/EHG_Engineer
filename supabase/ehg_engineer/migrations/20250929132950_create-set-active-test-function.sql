-- Create or replace the set_active_test function
-- This function sets the active test case for a UAT run

CREATE OR REPLACE FUNCTION set_active_test(p_run_id UUID, p_case_id TEXT)
RETURNS VOID AS $$
BEGIN
    -- Update the run's active case
    UPDATE uat_runs
    SET active_case_id = p_case_id
    WHERE id = p_run_id;

    -- Optional: Create a placeholder result if none exists
    INSERT INTO uat_results (run_id, case_id, status, recorded_at)
    VALUES (p_run_id, p_case_id, null, NOW())
    ON CONFLICT (run_id, case_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION set_active_test(UUID, TEXT) TO anon, authenticated;