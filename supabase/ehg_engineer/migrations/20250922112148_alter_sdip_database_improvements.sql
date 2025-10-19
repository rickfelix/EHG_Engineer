-- SDIP Database Improvements per Database Sub-Agent Recommendations
-- Created: 2025-01-03
-- Implements: Performance indexes, row-level security, views

-- ============================================
-- PART 1: PERFORMANCE INDEXES
-- ============================================

-- Index on foreign keys (Database Sub-Agent Action Item #1)
CREATE INDEX IF NOT EXISTS idx_sdip_created_by 
  ON sdip_submissions(created_by);

CREATE INDEX IF NOT EXISTS idx_sdip_resulting_sd 
  ON sdip_submissions(resulting_sd_id)
  WHERE resulting_sd_id IS NOT NULL;

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sdip_user_status 
  ON sdip_submissions(created_by, validation_complete, current_step);

CREATE INDEX IF NOT EXISTS idx_sdip_gate_tracking 
  ON sdip_submissions(current_step, validation_complete)
  WHERE validation_complete = FALSE;

-- Index for date-based queries
CREATE INDEX IF NOT EXISTS idx_sdip_date_range 
  ON sdip_submissions(created_at, updated_at);

-- Groups table indexes
CREATE INDEX IF NOT EXISTS idx_groups_created_by 
  ON sdip_groups(created_by);

CREATE INDEX IF NOT EXISTS idx_groups_sd_id 
  ON sdip_groups(final_sd_id)
  WHERE final_sd_id IS NOT NULL;

-- ============================================
-- PART 2: ROW-LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on tables (Database Sub-Agent Action Item #3)
ALTER TABLE sdip_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdip_groups ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS sdip_select_policy ON sdip_submissions;
DROP POLICY IF EXISTS sdip_insert_policy ON sdip_submissions;
DROP POLICY IF EXISTS sdip_update_policy ON sdip_submissions;
DROP POLICY IF EXISTS sdip_delete_policy ON sdip_submissions;

DROP POLICY IF EXISTS groups_select_policy ON sdip_groups;
DROP POLICY IF EXISTS groups_insert_policy ON sdip_groups;
DROP POLICY IF EXISTS groups_update_policy ON sdip_groups;
DROP POLICY IF EXISTS groups_delete_policy ON sdip_groups;

-- Create RLS policies for sdip_submissions
-- Chairman can only see and edit their own submissions
CREATE POLICY sdip_select_policy ON sdip_submissions
  FOR SELECT
  USING (
    auth.uid() = created_by OR 
    auth.jwt() ->> 'role' IN ('admin', 'validator', 'system')
  );

CREATE POLICY sdip_insert_policy ON sdip_submissions
  FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
  );

CREATE POLICY sdip_update_policy ON sdip_submissions
  FOR UPDATE
  USING (
    auth.uid() = created_by OR
    auth.jwt() ->> 'role' IN ('admin', 'validator')
  )
  WITH CHECK (
    auth.uid() = created_by OR
    auth.jwt() ->> 'role' IN ('admin', 'validator')
  );

CREATE POLICY sdip_delete_policy ON sdip_submissions
  FOR DELETE
  USING (
    auth.jwt() ->> 'role' = 'admin'
  );

-- Create RLS policies for sdip_groups
CREATE POLICY groups_select_policy ON sdip_groups
  FOR SELECT
  USING (
    auth.uid() = created_by OR
    auth.jwt() ->> 'role' IN ('admin', 'validator', 'system')
  );

CREATE POLICY groups_insert_policy ON sdip_groups
  FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
  );

CREATE POLICY groups_update_policy ON sdip_groups
  FOR UPDATE
  USING (
    auth.jwt() ->> 'role' IN ('admin', 'validator')
  );

CREATE POLICY groups_delete_policy ON sdip_groups
  FOR DELETE
  USING (
    auth.jwt() ->> 'role' = 'admin'
  );

-- ============================================
-- PART 3: DATABASE VIEWS (Database Sub-Agent Action Item #4)
-- ============================================

-- View for pending validations by user
CREATE OR REPLACE VIEW sdip_pending_validations AS
SELECT 
  s.id,
  s.submission_title,
  s.current_step,
  s.created_at,
  s.updated_at,
  s.created_by,
  CASE current_step
    WHEN 1 THEN 'Awaiting Input'
    WHEN 2 THEN 'Intent Confirmation'
    WHEN 3 THEN 'Classification Review'
    WHEN 4 THEN 'Synthesis Review'
    WHEN 5 THEN 'Questions Pending'
    WHEN 6 THEN 'Final Summary'
  END as step_name,
  s.gate_status
FROM sdip_submissions s
WHERE s.validation_complete = FALSE
ORDER BY s.created_at DESC;

-- View for validation progress summary
CREATE OR REPLACE VIEW sdip_validation_progress AS
SELECT 
  created_by,
  COUNT(*) as total_submissions,
  COUNT(*) FILTER (WHERE validation_complete = TRUE) as completed,
  COUNT(*) FILTER (WHERE validation_complete = FALSE) as pending,
  COUNT(*) FILTER (WHERE current_step = 1) as step1_count,
  COUNT(*) FILTER (WHERE current_step = 2) as step2_count,
  COUNT(*) FILTER (WHERE current_step = 3) as step3_count,
  COUNT(*) FILTER (WHERE current_step = 4) as step4_count,
  COUNT(*) FILTER (WHERE current_step = 5) as step5_count,
  COUNT(*) FILTER (WHERE current_step = 6) as step6_count,
  AVG(current_step) as avg_progress
FROM sdip_submissions
GROUP BY created_by;

-- View for gate completion rates
CREATE OR REPLACE VIEW sdip_gate_completion_rates AS
SELECT 
  'Step 1 - Input' as gate_name,
  COUNT(*) as total_attempts,
  COUNT(*) FILTER (WHERE current_step > 1) as completions,
  CASE 
    WHEN COUNT(*) > 0 
    THEN ROUND(100.0 * COUNT(*) FILTER (WHERE current_step > 1) / COUNT(*), 2)
    ELSE 0
  END as completion_rate
FROM sdip_submissions
UNION ALL
SELECT 
  'Step 2 - Intent' as gate_name,
  COUNT(*) FILTER (WHERE current_step >= 2) as total_attempts,
  COUNT(*) FILTER (WHERE current_step > 2) as completions,
  CASE 
    WHEN COUNT(*) FILTER (WHERE current_step >= 2) > 0 
    THEN ROUND(100.0 * COUNT(*) FILTER (WHERE current_step > 2) / COUNT(*) FILTER (WHERE current_step >= 2), 2)
    ELSE 0
  END as completion_rate
FROM sdip_submissions
UNION ALL
SELECT 
  'Step 3 - Classification' as gate_name,
  COUNT(*) FILTER (WHERE current_step >= 3) as total_attempts,
  COUNT(*) FILTER (WHERE current_step > 3) as completions,
  CASE 
    WHEN COUNT(*) FILTER (WHERE current_step >= 3) > 0 
    THEN ROUND(100.0 * COUNT(*) FILTER (WHERE current_step > 3) / COUNT(*) FILTER (WHERE current_step >= 3), 2)
    ELSE 0
  END as completion_rate
FROM sdip_submissions
UNION ALL
SELECT 
  'Step 4 - Synthesis' as gate_name,
  COUNT(*) FILTER (WHERE current_step >= 4) as total_attempts,
  COUNT(*) FILTER (WHERE current_step > 4) as completions,
  CASE 
    WHEN COUNT(*) FILTER (WHERE current_step >= 4) > 0 
    THEN ROUND(100.0 * COUNT(*) FILTER (WHERE current_step > 4) / COUNT(*) FILTER (WHERE current_step >= 4), 2)
    ELSE 0
  END as completion_rate
FROM sdip_submissions
UNION ALL
SELECT 
  'Step 5 - Questions' as gate_name,
  COUNT(*) FILTER (WHERE current_step >= 5) as total_attempts,
  COUNT(*) FILTER (WHERE current_step > 5) as completions,
  CASE 
    WHEN COUNT(*) FILTER (WHERE current_step >= 5) > 0 
    THEN ROUND(100.0 * COUNT(*) FILTER (WHERE current_step > 5) / COUNT(*) FILTER (WHERE current_step >= 5), 2)
    ELSE 0
  END as completion_rate
FROM sdip_submissions
UNION ALL
SELECT 
  'Step 6 - Summary' as gate_name,
  COUNT(*) FILTER (WHERE current_step >= 6) as total_attempts,
  COUNT(*) FILTER (WHERE validation_complete = TRUE) as completions,
  CASE 
    WHEN COUNT(*) FILTER (WHERE current_step >= 6) > 0 
    THEN ROUND(100.0 * COUNT(*) FILTER (WHERE validation_complete = TRUE) / COUNT(*) FILTER (WHERE current_step >= 6), 2)
    ELSE 0
  END as completion_rate
FROM sdip_submissions;

-- View for recently completed submissions
CREATE OR REPLACE VIEW sdip_recently_completed AS
SELECT 
  s.id,
  s.submission_title,
  s.chairman_input,
  s.client_summary,
  s.resulting_sd_id,
  s.completed_at,
  s.created_by,
  u.email as user_email
FROM sdip_submissions s
LEFT JOIN auth.users u ON s.created_by = u.id
WHERE s.validation_complete = TRUE
  AND s.completed_at IS NOT NULL
ORDER BY s.completed_at DESC
LIMIT 100;

-- ============================================
-- PART 4: CASCADE DELETE CONFIGURATION
-- ============================================

-- Add cascade delete for group submissions (Database Sub-Agent known issue)
ALTER TABLE sdip_submissions 
  DROP CONSTRAINT IF EXISTS fk_group_id;

ALTER TABLE sdip_submissions
  ADD CONSTRAINT fk_group_id 
  FOREIGN KEY (group_id) 
  REFERENCES sdip_groups(id) 
  ON DELETE SET NULL;

-- ============================================
-- PART 5: AUDIT FUNCTIONS
-- ============================================

-- Function to log gate transitions with signature
CREATE OR REPLACE FUNCTION log_gate_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.current_step IS DISTINCT FROM NEW.current_step THEN
    INSERT INTO audit_log (
      table_name,
      record_id,
      action,
      old_value,
      new_value,
      user_id,
      timestamp,
      signature
    ) VALUES (
      'sdip_submissions',
      NEW.id,
      'gate_transition',
      jsonb_build_object('step', OLD.current_step),
      jsonb_build_object('step', NEW.current_step),
      auth.uid(),
      NOW(),
      encode(sha256(concat(NEW.id::text, NEW.current_step::text, auth.uid()::text)::bytea), 'hex')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for gate transition logging
DROP TRIGGER IF EXISTS log_sdip_gate_transitions ON sdip_submissions;
CREATE TRIGGER log_sdip_gate_transitions
  AFTER UPDATE ON sdip_submissions
  FOR EACH ROW
  EXECUTE FUNCTION log_gate_transition();

-- ============================================
-- PART 6: PERFORMANCE ANALYSIS
-- ============================================

-- Create statistics for query optimization
ANALYZE sdip_submissions;
ANALYZE sdip_groups;

-- Grant appropriate permissions to views
GRANT SELECT ON sdip_pending_validations TO authenticated;
GRANT SELECT ON sdip_validation_progress TO authenticated;
GRANT SELECT ON sdip_gate_completion_rates TO authenticated;
GRANT SELECT ON sdip_recently_completed TO authenticated;

-- Comments for documentation
COMMENT ON VIEW sdip_pending_validations IS 'Shows all pending SDIP validations with current step details';
COMMENT ON VIEW sdip_validation_progress IS 'Summary of validation progress by user';
COMMENT ON VIEW sdip_gate_completion_rates IS 'Analytics on gate completion success rates';
COMMENT ON VIEW sdip_recently_completed IS 'Recently completed submissions with user details';