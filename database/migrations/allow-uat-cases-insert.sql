-- Allow insert/update/delete operations on uat_cases for anon users
-- This enables creating, editing, and deleting test cases from the UI

-- Drop existing policies
DROP POLICY IF EXISTS "Public read access to uat_cases" ON uat_cases;

-- Create comprehensive policies
CREATE POLICY "Anon users can view all uat_cases"
  ON uat_cases FOR SELECT
  USING (true);

CREATE POLICY "Anon users can create uat_cases"
  ON uat_cases FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anon users can update uat_cases"
  ON uat_cases FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon users can delete uat_cases"
  ON uat_cases FOR DELETE
  USING (true);

-- Update permissions for uat_runs to allow updates
DROP POLICY IF EXISTS "Anon users can create uat_runs" ON uat_runs;
DROP POLICY IF EXISTS "Anon users can view all uat_runs" ON uat_runs;

CREATE POLICY "Anon users can view all uat_runs"
  ON uat_runs FOR SELECT
  USING (true);

CREATE POLICY "Anon users can create uat_runs"
  ON uat_runs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anon users can update uat_runs"
  ON uat_runs FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Grant full necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON uat_cases TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON uat_runs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON uat_results TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON uat_defects TO anon;

-- Refresh the schema cache
NOTIFY pgrst, 'reload schema';