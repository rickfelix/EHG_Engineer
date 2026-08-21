-- solomon_advice_outcome_ledger: widen the outcome CHECK domain to add 'not_applicable'.
-- SD-LEO-INFRA-SOLOMON-ADVICE-LEDGER-001 (TR-1).
--
-- WHY: the correlation-keyed leg this SD adds resolves outcome for a rejected/refuted
-- advisory that has no downstream artifact to trace (nothing was built, so there is nothing
-- for outcome_ref to point at). The existing 4-value domain (unknown/shipped_clean/reverted/
-- caused_rework) has no honest representation for this state -- forcing it into 'unknown'
-- would leave those rows permanently misreported as not-yet-determined, recreating a smaller
-- version of the same lying-instrument defect this SD exists to close (VALIDATION sub-agent
-- finding, LEAD phase, evidence db79ddc9-b74f-4467-9f94-de0cf24b0b4a).
--
-- Purely additive: widens an existing CHECK constraint (DROP + re-ADD with the superset list,
-- same pattern already established in 20260705_solomon_ledger_tail_and_deferral.sql for the
-- sibling `decision` column). No column added, no existing row's value becomes invalid, no
-- data rewritten. Constraint name confirmed via live pg_constraint introspection (LEAD/PLAN
-- session, 2026-08-19): solomon_advice_outcome_ledger_outcome_check (Postgres's standard
-- <table>_<column>_check auto-generated name for the original unnamed inline CHECK in
-- 20260701_solomon_advice_outcome_ledger.sql:21).
--
-- outcome='not_applicable' is accuracy-math-neutral for scripts/fleet-dashboard.cjs's
-- computeSolomonLedgerRollup: a rejected/refuted row already sits in the JUDGED_DECISIONS
-- denominator via `decision` alone (unaffected by this SD) and already fails the numerator
-- (which requires decision==='accepted'), so writing its outcome does not move the accuracy
-- percentage -- see this SD's PRD FR-3 for the full denominator-exclusion design.
--
-- STAGED, NOT YET APPROVED FOR APPLY. Application code (the new correlation-leg outcome
-- resolver) degrades safely if this migration has not yet been applied -- the resolver simply
-- cannot write outcome='not_applicable' yet (a write attempt would fail the CHECK constraint
-- loudly, not silently), and is exercised only via unit tests with a mocked DB until then,
-- mirroring 20260705_solomon_ledger_tail_and_deferral.sql's documented pattern.
--
-- requires-chairman-apply
--
-- SECURITY sub-agent (EXEC phase, S6): scripts/run-sql-migration.js does not wrap execution in an
-- implicit transaction. Without an explicit BEGIN/COMMIT, a mid-file failure (e.g. the ADD
-- CONSTRAINT step) would leave the table with the DROP already applied and NO outcome CHECK at
-- all -- fail-open on the exact constraint this migration exists to widen. Explicit transaction
-- closes that window; either both statements land or neither does.

BEGIN;

ALTER TABLE solomon_advice_outcome_ledger DROP CONSTRAINT IF EXISTS solomon_advice_outcome_ledger_outcome_check;
ALTER TABLE solomon_advice_outcome_ledger ADD CONSTRAINT solomon_advice_outcome_ledger_outcome_check
  CHECK (outcome IN ('unknown', 'shipped_clean', 'reverted', 'caused_rework', 'not_applicable'));

COMMENT ON COLUMN solomon_advice_outcome_ledger.outcome IS 'Set from the ACTUAL downstream SD/CI/QF/PR result, never from Solomon''s self-report (CONST-002 proposer!=approver). ''not_applicable'' (added SD-LEO-INFRA-SOLOMON-ADVICE-LEDGER-001) is for a correctly rejected/refuted advisory with no downstream artifact to trace -- distinct from ''unknown'' (not yet determined).';

COMMIT;
