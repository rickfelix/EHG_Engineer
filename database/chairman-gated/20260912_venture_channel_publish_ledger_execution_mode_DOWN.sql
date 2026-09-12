-- @chairman-gated
-- Rollback for 20260912_venture_channel_publish_ledger_execution_mode.sql
-- (SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001 FR-4).
--
-- Drops the CHECK constraint, the NOT NULL, and both columns (execution_mode, mock_run_id) --
-- a full reverse. Safe to re-run: every statement is IF EXISTS.
--
-- @approved-by: codestreetlabs@gmail.com
--   Chairman verification NOT yet obtained. This file is staged only.
--
-- NOTE: no top-level BEGIN/COMMIT -- scripts/apply-migration.js wraps the whole file in its own
-- transaction (this directory's established convention).

ALTER TABLE venture_channel_publish_ledger
  DROP CONSTRAINT IF EXISTS venture_channel_publish_ledger_execution_mode_check;

ALTER TABLE venture_channel_publish_ledger
  DROP COLUMN IF EXISTS execution_mode;

ALTER TABLE venture_channel_publish_ledger
  DROP COLUMN IF EXISTS mock_run_id;
