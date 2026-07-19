-- solomon_advice_outcome_ledger batch-stamp exclusion marker.
-- SD-LEO-INFRA-ROLE-MEASUREMENT-INTEGRITY-001 (W2, FR-5/TR-3).
--
-- The disease: 198 of the decided rows had their decision stamped in ONE non-contemporaneous retro
-- batch on 2026-07-12 (decision_at in [2026-07-12, 2026-07-13); every one of them has a decision_at
-- more than an hour after its created_at — ZERO are contemporaneous). Those retro dispositions are
-- narrative reconciliations ("consumed", "EXECUTED", "OBE", ...), not contemporaneous accept-decisions
-- with a verified downstream outcome, so folding them into the accuracy denominator makes the accuracy
-- number meaningless. FR-5 marks them with a DURABLE column and the rollup EXCLUDES marked rows from
-- both the numerator and the denominator (TR-3: keyed on the durable column, never a re-derived
-- timestamp heuristic, so the rollup is deterministic and re-runnable).
--
-- Purely ADDITIVE (one new nullable column, DEFAULT false — every pre-existing row is backfilled to
-- false by the default). No existing column altered or dropped; no data loss. RLS unchanged (adding a
-- nullable column to an existing RLS-enabled table needs none). The backfill UPDATE below is
-- idempotent (fixed 2026-07-12 window + IS DISTINCT FROM guard) so re-applying is a no-op.
-- @approved-by: SD-LEO-INFRA-ROLE-MEASUREMENT-INTEGRITY-001 EXEC (W2; additive nullable column, parent-directed apply 2026-07-19)

ALTER TABLE solomon_advice_outcome_ledger
  ADD COLUMN IF NOT EXISTS batch_stamped boolean DEFAULT false;

COMMENT ON COLUMN solomon_advice_outcome_ledger.batch_stamped IS 'Durable exclusion marker (SD-LEO-INFRA-ROLE-MEASUREMENT-INTEGRITY-001 W2, FR-5/TR-3): true iff this row''s decision was stamped in the 2026-07-12 non-contemporaneous retro backfill (198 rows). The accuracy rollup (fleet-dashboard.cjs computeSolomonLedgerRollup) EXCLUDES batch_stamped=true rows from BOTH the numerator and denominator so accuracy reflects only trustworthy contemporaneous evidence. Deterministic durable column, NOT a re-derived timestamp heuristic. false (the default) = a normal contemporaneous row.';

-- Backfill: mark the ONE known retro batch — every row decided in the 2026-07-12 UTC window (verified
-- 198 rows, 0 of them contemporaneous). The RESULT is stored durably in the column above; the rollup
-- never re-derives it from timestamps.
UPDATE solomon_advice_outcome_ledger
   SET batch_stamped = true
 WHERE decision_at >= '2026-07-12T00:00:00Z'
   AND decision_at <  '2026-07-13T00:00:00Z'
   AND batch_stamped IS DISTINCT FROM true;
