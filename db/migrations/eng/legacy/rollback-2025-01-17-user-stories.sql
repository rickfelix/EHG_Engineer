-- Rollback script for user story migration
-- Safe rollback preserving data integrity

BEGIN;

-- Drop functions first
DROP FUNCTION IF EXISTS fn_generate_stories_from_prd(TEXT, UUID, TEXT);

-- Drop views
DROP VIEW IF EXISTS v_sd_release_gate;
DROP VIEW IF EXISTS v_story_verification_status;

-- Drop constraints
ALTER TABLE sd_backlog_map
  DROP CONSTRAINT IF EXISTS fk_sd_backlog_map_sd_id,
  DROP CONSTRAINT IF EXISTS uk_sd_backlog_map_sd_backlog;

-- Drop indexes
DROP INDEX IF EXISTS idx_story_list;
DROP INDEX IF EXISTS idx_backlog_parent;
DROP INDEX IF EXISTS idx_backlog_verification;

-- Drop audit table
DROP TABLE IF EXISTS story_audit_log;

-- Optional: Drop columns (commented for safety)
-- ALTER TABLE sd_backlog_map
--   DROP COLUMN IF EXISTS item_type,
--   DROP COLUMN IF EXISTS parent_id,
--   DROP COLUMN IF EXISTS sequence_no,
--   DROP COLUMN IF EXISTS acceptance_criteria,
--   DROP COLUMN IF EXISTS verification_status,
--   DROP COLUMN IF EXISTS verification_source,
--   DROP COLUMN IF EXISTS last_verified_at,
--   DROP COLUMN IF EXISTS import_run_id;

COMMIT;