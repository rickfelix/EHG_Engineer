-- Additive provenance columns for operator_cash_burn_monthly: track the manual
-- (venture_revenue_entries) component of revenue_usd separately from the automated
-- Stripe-attributed component, so a manual dollar is never mislabelled as live Stripe
-- revenue -- SD-EHG-PRODUCT-FIRSTREV-SUBSTRATE-ROLLUP-001-B.
--
-- Additive only: no existing column on operator_cash_burn_monthly is altered or dropped.
-- revenue_usd continues to be the blended total (Stripe + manual); manual_revenue_usd is
-- the honest breakout of just the manual portion. revenue_livemode's existing meaning is
-- untouched -- it still reflects Stripe attribution status only.
--
-- STAGED, NOT YET APPROVED FOR APPLY. Application code (lib/operator/cash-burn-substrate.js
-- upsertSubstrateInputs, scripts/operator/feed-operator-cash-burn.mjs) writes to these
-- columns only when they exist; until this migration is applied the manual-revenue merge
-- path fails soft (logs and continues) rather than erroring, matching this codebase's
-- established staged-DDL convention (see 20260711120000_upsert_operator_cash_burn_chairman_editable.sql).
--
-- Migration sign-off routes Coordinator -> Adam -> chairman; a fleet worker must not apply
-- this file directly.
--
-- requires-chairman-apply

ALTER TABLE public.operator_cash_burn_monthly
  ADD COLUMN IF NOT EXISTS manual_revenue_usd numeric(14,2),               -- NULL = no manual component known yet
  ADD COLUMN IF NOT EXISTS manual_revenue_last_synced_at timestamptz;      -- stamped whenever manual_revenue_usd is written
