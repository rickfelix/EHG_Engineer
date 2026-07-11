-- solomon_advice_outcome_ledger tail-inheritance + deferral-discipline columns.
-- SD-LEO-FIX-SOLOMON-RECOMMENDATION-GUARDRAIL-001 (escalated from QF-20260704-598).
-- Chairman directive 2026-07-04 ("when Solomon speaks, we should listen"): multi-part
-- advisories currently have no mechanism keeping sub-recommendations from rotting once the
-- primary part is stamped, and a 'deferred' decision has no accountability mechanism forcing
-- it to ever be re-examined. Purely additive (2 new nullable columns + one widened CHECK on
-- an existing enum-like column) -- no existing column altered or dropped, every pre-existing
-- row keeps its current decision value and gets NULL for both new columns.
--
-- STAGED, NOT YET APPROVED FOR APPLY. This table's existing migrations all carry an
-- @approved-by: codestreetlabs@gmail.com
-- (chairman verbal approval live in-session 2026-07-11 ~7:35 PM ET, recorded by Adam ac499e67 as scribe)
-- @approved-by tag (chairman-apply-gated DDL convention); this file intentionally omits
-- that tag until the chairman explicitly applies it (see check-migration-readiness.mjs's
-- documented "staged, pending explicit chairman GO" pattern). Application code that depends
-- on these columns (coordinator-ack-adam.cjs's tail-inheritance + deferral-trigger rejection)
-- degrades safely if this migration has not yet been applied (columns simply won't exist yet,
-- and the calling code paths are exercised only via unit tests with a mocked DB until then).
--
-- requires-chairman-apply

ALTER TABLE solomon_advice_outcome_ledger
  ADD COLUMN IF NOT EXISTS parent_correlation_id text,
  ADD COLUMN IF NOT EXISTS defer_trigger text;

CREATE INDEX IF NOT EXISTS idx_solomon_ledger_parent_correlation
  ON solomon_advice_outcome_ledger (parent_correlation_id)
  WHERE parent_correlation_id IS NOT NULL;

ALTER TABLE solomon_advice_outcome_ledger DROP CONSTRAINT IF EXISTS solomon_advice_outcome_ledger_decision_check;
ALTER TABLE solomon_advice_outcome_ledger ADD CONSTRAINT solomon_advice_outcome_ledger_decision_check
  CHECK (decision IN ('pending', 'accepted', 'rejected', 'partial', 'deferred'));

ALTER TABLE solomon_advice_outcome_ledger DROP CONSTRAINT IF EXISTS solomon_advice_outcome_ledger_defer_trigger_required;
ALTER TABLE solomon_advice_outcome_ledger ADD CONSTRAINT solomon_advice_outcome_ledger_defer_trigger_required
  CHECK (decision != 'deferred' OR defer_trigger IS NOT NULL);

COMMENT ON COLUMN solomon_advice_outcome_ledger.parent_correlation_id IS 'When set, this row is a "tail" of the advisory whose correlation_id equals this value -- stamping the primary auto-inherits its decision onto all matching tail rows (coordinator-ack-adam.cjs recordLedgerDecision). NULL for a standalone/primary advisory. SD-LEO-FIX-SOLOMON-RECOMMENDATION-GUARDRAIL-001.';
COMMENT ON COLUMN solomon_advice_outcome_ledger.defer_trigger IS 'Required (DB-enforced) whenever decision=''deferred'' -- names the concrete re-fire event that will force this deferral back into review. NULL for every other decision value. SD-LEO-FIX-SOLOMON-RECOMMENDATION-GUARDRAIL-001.';
