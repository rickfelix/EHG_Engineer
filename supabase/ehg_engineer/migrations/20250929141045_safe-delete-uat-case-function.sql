-- Create a function to safely delete UAT test cases
-- This handles foreign key constraints by clearing references first

CREATE OR REPLACE FUNCTION delete_uat_case(case_id_to_delete TEXT)
RETURNS JSON AS $$
DECLARE
  result JSON;
  affected_runs INTEGER;
  affected_results INTEGER;
BEGIN
  -- First, clear any active_case_id references in uat_runs
  UPDATE uat_runs
  SET active_case_id = NULL
  WHERE active_case_id = case_id_to_delete;

  GET DIAGNOSTICS affected_runs = ROW_COUNT;

  -- Delete associated results
  DELETE FROM uat_results
  WHERE case_id = case_id_to_delete;

  GET DIAGNOSTICS affected_results = ROW_COUNT;

  -- Finally, delete the test case itself
  DELETE FROM uat_cases
  WHERE id = case_id_to_delete;

  -- Return summary
  result := json_build_object(
    'success', true,
    'case_id', case_id_to_delete,
    'cleared_active_references', affected_runs,
    'deleted_results', affected_results
  );

  RETURN result;

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to anon users
GRANT EXECUTE ON FUNCTION delete_uat_case(TEXT) TO anon;