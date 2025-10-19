-- Fix RLS policies for UAT tables to allow anon access

-- Drop existing policies
DROP POLICY IF EXISTS "Public read access to uat_cases" ON uat_cases;
DROP POLICY IF EXISTS "Anon users can view all uat_runs" ON uat_runs;
DROP POLICY IF EXISTS "Anon users can view all uat_results" ON uat_results;
DROP POLICY IF EXISTS "Anon users can view all uat_defects" ON uat_defects;

-- Create new policies for read access
CREATE POLICY "Public read access to uat_cases"
  ON uat_cases FOR SELECT
  USING (true);

CREATE POLICY "Anon users can view all uat_runs"
  ON uat_runs FOR SELECT
  USING (true);

CREATE POLICY "Anon users can view all uat_results"
  ON uat_results FOR SELECT
  USING (true);

CREATE POLICY "Anon users can view all uat_defects"
  ON uat_defects FOR SELECT
  USING (true);

-- Also allow inserts for testing
CREATE POLICY "Anon users can create uat_runs"
  ON uat_runs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anon users can create uat_results"
  ON uat_results FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anon users can create uat_defects"
  ON uat_defects FOR INSERT
  WITH CHECK (true);

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON uat_runs TO anon;
GRANT SELECT ON uat_cases TO anon;
GRANT SELECT, INSERT ON uat_results TO anon;
GRANT SELECT, INSERT ON uat_defects TO anon;
GRANT SELECT ON v_uat_run_stats TO anon;

-- Refresh the schema cache
NOTIFY pgrst, 'reload schema';