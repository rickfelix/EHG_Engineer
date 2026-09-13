-- @chairman-gated
-- Rollback for 20260913_uat_control_pack_evaluated_derive.sql
-- (SD-LEO-INFRA-SUMMARY-COLUMNS-DERIVED-001 FR-3).
--
-- TR-2: the pre-derivation snapshot is captured in the UP file, immediately before its
-- CREATE TRIGGER statement (uat_control_pack_evaluated_rollback_snapshot) -- EXEC-phase
-- TESTING (evidence cf40b474, CRITICAL-2) found the original design took the snapshot HERE,
-- at drop time, which is backwards: by drop time the trigger may have been live and deriving
-- values for days or weeks, so a snapshot taken here would capture POST-derivation state under
-- a "pre-derivation" label. The snapshot table itself is intentionally left in place after this
-- DOWN runs (for manual inspection during an incident) rather than dropped.
--
-- Simply drops the trigger and its function. Safe to re-run: both statements are IF EXISTS.
--
-- @approved-by: PENDING
--   Chairman verification NOT yet obtained. This file is staged only.
--
-- NOTE: no top-level BEGIN/COMMIT -- scripts/apply-migration.js wraps the whole file in its
-- own transaction (this directory's established convention).

DROP TRIGGER IF EXISTS trg_uat_control_pack_evaluated_derive ON uat_test_runs;
DROP FUNCTION IF EXISTS derive_uat_control_pack_evaluated();
