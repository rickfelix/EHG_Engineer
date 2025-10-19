-- Drop redundant execution_order column
-- Date: 2025-09-27
-- Reason: Consolidating to use sequence_rank field only

-- This column is redundant as sequence_rank serves the same purpose
ALTER TABLE strategic_directives_v2
DROP COLUMN IF EXISTS execution_order CASCADE;

-- Document the remaining field
COMMENT ON COLUMN strategic_directives_v2.sequence_rank IS
'Execution sequence ranking for Strategic Directives. Lower numbers indicate higher priority and earlier execution in the dependency chain.';