-- Add 'deferred' status to strategic_directives_v2 table
-- This allows proper semantic meaning for over-engineered SDs

ALTER TABLE strategic_directives_v2 DROP CONSTRAINT IF EXISTS strategic_directives_v2_status_check;

ALTER TABLE strategic_directives_v2 ADD CONSTRAINT strategic_directives_v2_status_check
  CHECK (status IN ('draft', 'in_progress', 'active', 'pending_approval', 'completed', 'deferred'));

-- Add comment to explain deferred status
COMMENT ON COLUMN strategic_directives_v2.status IS 'Status of the strategic directive. deferred = postponed due to business stage or priority mismatch';