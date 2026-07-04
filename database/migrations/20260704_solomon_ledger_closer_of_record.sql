-- solomon_advice_outcome_ledger closer-of-record columns.
-- SD-LEO-INFRA-REWARD-SPINE-ONE-001-B (Child B of the reward-spine SD; see
-- docs/architecture/reward-spine-ssot.md for the L2 LESSON outcome layer this
-- table carries).
--
-- Anti-Goodhart mechanic: closure must be attributable to a durable, non-self-reported
-- record. scripts/solomon-ledger-reconcile.cjs already resolves `outcome` correctly from
-- downstream SD terminal status, but records no closer-of-record today. This migration
-- is purely additive -- no existing column is altered or dropped, and both new columns
-- default to NULL for every pre-existing row (they were never auto/manually closed under
-- this scheme).
--
-- @approved-by: codestreetlabs@gmail.com

ALTER TABLE solomon_advice_outcome_ledger
  ADD COLUMN IF NOT EXISTS closed_by text,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

COMMENT ON COLUMN solomon_advice_outcome_ledger.closed_by IS 'Identifies the mechanism/actor that set `outcome` away from unknown (e.g. ''solomon-ledger-reconcile.cjs'' for an auto-close, or a human identifier for a manual caused_rework judgment). NULL until closed. SD-LEO-INFRA-REWARD-SPINE-ONE-001-B.';
COMMENT ON COLUMN solomon_advice_outcome_ledger.closed_at IS 'Timestamp `outcome` was set away from unknown. NULL until closed. SD-LEO-INFRA-REWARD-SPINE-ONE-001-B.';
