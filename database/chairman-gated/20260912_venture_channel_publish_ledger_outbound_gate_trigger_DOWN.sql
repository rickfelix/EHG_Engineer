-- @chairman-gated
-- Rollback for 20260912_venture_channel_publish_ledger_outbound_gate_trigger.sql
-- (SD-LEO-INFRA-DEMAND-ENGINE-FAIL-001 FR-5).
--
-- Drops the trigger, then its function. Safe to re-run: both statements are IF EXISTS.
--
-- @approved-by: codestreetlabs@gmail.com
--   Chairman verification NOT yet obtained. This file is staged only.
--
-- NOTE: no top-level BEGIN/COMMIT -- scripts/apply-migration.js wraps the whole file in its
-- own transaction (this directory's established convention).

DROP TRIGGER IF EXISTS trg_venture_channel_publish_ledger_outbound_gate ON venture_channel_publish_ledger;
DROP FUNCTION IF EXISTS check_venture_channel_publish_ledger_outbound_gate();
