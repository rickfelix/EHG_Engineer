-- @chairman-gated
-- Rollback for 20260913_uat_control_pack_evaluated_derive.sql
-- (SD-LEO-INFRA-SUMMARY-COLUMNS-DERIVED-001 FR-3).
--
-- TR-2: captures pre-derivation (id, control_pack_evaluated, control_pack_status) into a
-- snapshot table BEFORE dropping the trigger -- a DROP TRIGGER alone reverses the schema but
-- not the data it already derived; a real rollback needs the pre-derivation state captured.
-- Safe to re-run: the snapshot table is CREATE IF NOT EXISTS and both drops are IF EXISTS.
--
-- @approved-by: PENDING
--   Chairman verification NOT yet obtained. This file is staged only.
--
-- NOTE: no top-level BEGIN/COMMIT -- scripts/apply-migration.js wraps the whole file in its
-- own transaction (this directory's established convention).

CREATE TABLE IF NOT EXISTS uat_control_pack_evaluated_rollback_snapshot (
  run_id uuid NOT NULL,
  control_pack_evaluated jsonb,
  control_pack_status jsonb,
  snapshotted_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO uat_control_pack_evaluated_rollback_snapshot (run_id, control_pack_evaluated, control_pack_status)
SELECT id, metadata->'control_pack_evaluated', metadata->'control_pack_status'
FROM uat_test_runs;

DROP TRIGGER IF EXISTS trg_uat_control_pack_evaluated_derive ON uat_test_runs;
DROP FUNCTION IF EXISTS derive_uat_control_pack_evaluated();
