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
-- Purely ADDITIVE. No existing column altered or dropped; no data loss. RLS unchanged (the table's
-- existing solomon_advice_outcome_ledger_read / _service_write policies are column-agnostic).
-- Idempotent (IF NOT EXISTS) -- re-applying is a no-op.
--
-- requires-chairman-apply

BEGIN;

ALTER TABLE solomon_advice_outcome_ledger
  ADD COLUMN IF NOT EXISTS decision_requested boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN solomon_advice_outcome_ledger.decision_requested IS 'Admission discriminator (SD-ALTIFYAI-LEO-FIX-SOLOMON-ADVICE-LEDGER-001 FR-1b): true iff the sending Solomon advisory REQUESTS a decision; false iff informational-only. Sender-stamped at send time from scripts/solomon-advisory.cjs --informational (opt-OUT: absent => true, the non-suppressing direction) via payload.decision_requested. Read by scripts/solomon-ledger-pending-resurface.cjs planStalePending (the actionable-workload queue). DELIBERATELY NOT read by lib/solomon/conduct-probes.js staleOpenAdviceCount, which is a separate governance probe holding an explicit anti-aging principle -- do not fold the two predicates into one helper. All pre-existing rows are true by DEFAULT: an explicitly documented assumption, NOT a measurement (source payloads purge at ~13 days and were unrecoverable for the large majority of them).';

COMMIT;
