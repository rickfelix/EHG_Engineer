-- ============================================================================
-- CREATE: exec_sql function (required by database agent)
-- Date: 2026-01-25
-- Purpose: Dynamic SQL execution helper for database agent validation
-- ============================================================================

CREATE OR REPLACE FUNCTION exec_sql(sql_text TEXT)
RETURNS TABLE(result JSONB) AS $$
DECLARE
  rec RECORD;
  results JSONB := '[]'::jsonb;
BEGIN
  -- Execute the dynamic SQL and collect results
  FOR rec IN EXECUTE sql_text LOOP
    results := results || to_jsonb(rec);
  END LOOP;

  RETURN QUERY SELECT results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add helpful comment
COMMENT ON FUNCTION exec_sql IS
'Dynamic SQL execution function for database agent validation. Returns results as JSONB array.';

-- Grant execute to authenticated users (adjust permissions as needed)
GRANT EXECUTE ON FUNCTION exec_sql(text) TO authenticated;

SELECT 'exec_sql function created successfully' as status;
