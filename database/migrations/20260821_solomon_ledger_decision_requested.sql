-- solomon_advice_outcome_ledger admission discriminator: does this advisory REQUEST a decision?
-- SD-ALTIFYAI-LEO-FIX-SOLOMON-ADVICE-LEDGER-001 (FR-1b).
--
-- The disease: the ledger admits a row because AN ADVISORY WAS SENT, not because A DECISION IS
-- REQUIRED (decision defaults to 'pending' for every send, scripts/solomon-advisory.cjs's
-- captureLedgerRow omits decision entirely from its upsert literal). Arrival is comms volume;
-- disposal is decisions. The two rates have no causal relationship, which is why the gap grows
-- monotonically (originating QF-20260728-223).
--
-- WHY A NEW COLUMN AND NOT A `decision` ENUM VALUE. Widening the decision CHECK is a documented
-- anti-pattern in THIS codebase: fleet-dashboard.cjs's JUDGED_DECISIONS allow-list plus
-- tests/unit/fleet-dashboard-judged-allowlist.test.js exist because routing judgment-expiry through
-- the decision column was simulated and silently dropped computed accuracy 16% -> 6%. The ratified
-- answer there was a SEPARATE column (judgment_expired_at/by). Same answer here.
-- THIS MIGRATION DOES NOT TOUCH solomon_advice_outcome_ledger_decision_check.
--
-- DEFAULT true IS AN EXPLICIT, DOCUMENTED ASSUMPTION, NOT A NEUTRAL CHOICE. Backfilling the real
-- signal is infeasible: session_coordination (the payload source) purges at ~13 days (measured
-- window 2026-08-08 -> 2026-08-21) and the large majority of ledger rows have no recoverable source
-- payload. Of the 34 rows that ARE still traceable (preserved as
-- tests/fixtures/solomon-ledger-decision-requested-counterexample.json before this window closed),
-- 15 received a real disposition (6 accepted, 9 deferred) -- so DEFAULT false would retroactively
-- suppress 100% of the rows that demonstrably needed and got a decision. true is the non-suppressing
-- direction and makes this migration a strict no-op for every existing consumer on the day it lands.
--
-- NOT NULL (diverging from the nullable 20260719_solomon_ledger_batch_stamped.sql precedent): this
-- column is a PARTITION whose complement is also queried (by the pending-count resurfacer's
-- exclusion filter), and a NULL row would be invisible to BOTH .eq(...,true) and .eq(...,false) at
-- once -- an undetectable third state. Fast-default on PG 11+: metadata-only, no table rewrite.
--
-- Purely ADDITIVE. No existing column altered or dropped; no data loss on decision_requested's own
-- account. RLS unchanged (the table's existing solomon_advice_outcome_ledger_read / _service_write
-- policies are column-agnostic). Idempotent (IF NOT EXISTS) -- re-applying is a no-op.
--
-- LOCK_TIMEOUT: SET LOCAL wrapper, matching this repo's established pattern for ALTER TABLE against
-- a live-written table (20260416_leo_wiring_validations.sql C5; 20260423_add_scope_slice_to_sds.sql).
-- The column add is metadata-only (fast-default, no rewrite) but ACCESS EXCLUSIVE lock ACQUISITION
-- can still queue indefinitely behind a long-running reader on a table advisory sends write to live.
--
-- decision_by CHECK (ADVERSARIAL REVIEW FINDING, ship gate deep-tier pass): normalizeDecisionBy()
-- (scripts/coordinator-ack-adam.cjs) enforces "identity token, not notes" at the two write paths this
-- SD controls, but nothing at the DATA layer enforced that invariant -- a third, unidentified writer
-- (documented in scripts/one-off/backfill-solomon-ledger-decision-by.mjs's header, found by TESTING's
-- EXEC-2 review) could silently keep writing prose forever with zero signal. This CHECK makes the
-- invariant structural: any NEW write violating it now fails LOUDLY at write time instead of silently
-- succeeding. Matches normalizeDecisionBy's own contract exactly (<=40 chars, no whitespace) so it is
-- a NO-OP against both enforced write paths -- verified: normalizeDecisionBy's output is never longer
-- than 40 chars and never contains whitespace (see scripts/coordinator-ack-adam.cjs's own tests). NOT
-- a fix for already-lost historical rationale (that data is gone, see
-- .artifacts/incident-damage-manifest-20260821.json) -- this closes the ongoing/future risk only.
--
-- NOT VALID, DELIBERATELY: live-measured (2026-08-21, this SD's own EXEC phase) 11 EXISTING rows
-- currently violate this shape (the same unidentified-writer prose this constraint exists to stop
-- going forward), and that count is growing while the writer remains active. A validating ADD
-- CONSTRAINT would FAIL THE WHOLE MIGRATION outright the moment the chairman applies it -- including
-- the unrelated decision_requested column add in the same transaction -- which would be strictly
-- worse than shipping no constraint at all. NOT VALID enforces the CHECK on every new INSERT/UPDATE
-- immediately (closing the forward-looking risk this migration exists to close) while grandfathering
-- existing violators. Follow-up (NOT in this migration, needs its own change once violators are
-- cleaned up via the backfill script or otherwise): `ALTER TABLE solomon_advice_outcome_ledger
-- VALIDATE CONSTRAINT solomon_advice_outcome_ledger_decision_by_identity_check;` (SHARE UPDATE
-- EXCLUSIVE lock, does not block concurrent reads/writes, unlike the initial ADD).
--
-- requires-chairman-apply

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE solomon_advice_outcome_ledger
  ADD COLUMN IF NOT EXISTS decision_requested boolean NOT NULL DEFAULT true;

ALTER TABLE solomon_advice_outcome_ledger
  DROP CONSTRAINT IF EXISTS solomon_advice_outcome_ledger_decision_by_identity_check;

ALTER TABLE solomon_advice_outcome_ledger
  ADD CONSTRAINT solomon_advice_outcome_ledger_decision_by_identity_check
  CHECK (decision_by IS NULL OR (length(decision_by) <= 40 AND decision_by !~ '\s'))
  NOT VALID;

COMMENT ON COLUMN solomon_advice_outcome_ledger.decision_requested IS 'Admission discriminator (SD-ALTIFYAI-LEO-FIX-SOLOMON-ADVICE-LEDGER-001 FR-1b): true iff the sending Solomon advisory REQUESTS a decision; false iff informational-only. Sender-stamped at send time from scripts/solomon-advisory.cjs --informational (opt-OUT: absent => true, the non-suppressing direction) via payload.decision_requested. Read by scripts/solomon-ledger-pending-resurface.cjs planStalePending (the actionable-workload queue). DELIBERATELY NOT read by lib/solomon/conduct-probes.js staleOpenAdviceCount, which is a separate governance probe holding an explicit anti-aging principle -- do not fold the two predicates into one helper. All pre-existing rows are true by DEFAULT: an explicitly documented assumption, NOT a measurement (source payloads purge at ~13 days and were unrecoverable for the large majority of them).';

COMMENT ON CONSTRAINT solomon_advice_outcome_ledger_decision_by_identity_check ON solomon_advice_outcome_ledger IS 'decision_by must be a bare identity token (<=40 chars, no whitespace) -- see scripts/coordinator-ack-adam.cjs normalizeDecisionBy. Added SD-ALTIFYAI-LEO-FIX-SOLOMON-ADVICE-LEDGER-001 in response to a ship-gate adversarial review finding that the two enforced write paths were not backed by a data-layer invariant, leaving a documented unidentified third writer free to silently re-contaminate the column indefinitely. NOT VALID: 11 pre-existing rows violate it as of 2026-08-21 (same unidentified writer); run VALIDATE CONSTRAINT separately once those are cleaned up.';

COMMIT;
