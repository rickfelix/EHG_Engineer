-- solomon_advice_outcome_ledger cost-capture marker.
-- SD-LEO-INFRA-ROLE-MEASUREMENT-INTEGRITY-001 (W3, FR-6/TR-4).
-- cost_tokens + cost_wall_ms already exist on this table (20260701_solomon_advice_outcome_ledger.sql);
-- W3 populates them at write time from the writing session's authoritative telemetry. This migration
-- adds ONLY the durable cost_captured marker the fail-soft path needs: when telemetry is unavailable
-- the ledger row still lands with cost_tokens/cost_wall_ms = NULL and cost_captured = false, and the
-- budget rollup counts ONLY cost_captured rows so a missing datum never blocks a write nor silently
-- distorts the rollup (TR-4).
--
-- Purely ADDITIVE (one new nullable column, DEFAULT false — every pre-existing row is backfilled to
-- false by the default, i.e. "cost was never captured for it"). No existing column altered or dropped,
-- no data loss. RLS unchanged (adding a nullable column to an existing RLS-enabled table needs none).
-- @approved-by: SD-LEO-INFRA-ROLE-MEASUREMENT-INTEGRITY-001 EXEC (W3; additive nullable column, parent-directed apply 2026-07-19)

ALTER TABLE solomon_advice_outcome_ledger
  ADD COLUMN IF NOT EXISTS cost_captured boolean DEFAULT false;

COMMENT ON COLUMN solomon_advice_outcome_ledger.cost_captured IS 'Durable marker: true iff cost_tokens/cost_wall_ms were captured from the writing session''s authoritative telemetry at write time (SD-LEO-INFRA-ROLE-MEASUREMENT-INTEGRITY-001 W3, FR-6/TR-4). false (the fail-soft default) means telemetry was unavailable and the cost columns are NULL. The weekly Fable budget rollup counts ONLY cost_captured=true rows so a missing datum never distorts spend share.';
