-- Migration: 20260613_capital_transactions_stripe_bridge.sql
-- SD: SD-LEO-INFRA-PAYMENT-RAIL-FOUNDATION-001 (Phase-1 payment rail)
-- Purpose: FORWARD-ONLY additive bridge columns linking a future
--          capital_transactions row back to its source Stripe event.
-- NOTE (Phase-2 deferral): the existing lib/eva/services/ops-revenue-collector.js
--          reads capital_transactions.status (absent) and transaction_type IN
--          ('revenue','expansion','contraction') (not in the live enum). Wiring
--          captured events INTO the collector requires enum+status reconciliation
--          and is DEFERRED to Phase-2. Phase-1 only adds these nullable columns so
--          the bridge is ready; it does NOT insert capital_transactions rows
--          (venture_id is NOT NULL there). Additive + nullable = zero-risk.

ALTER TABLE capital_transactions ADD COLUMN IF NOT EXISTS stripe_charge_id TEXT;
ALTER TABLE capital_transactions ADD COLUMN IF NOT EXISTS stripe_event_id  TEXT;

-- Defense-in-depth idempotency: one Stripe event cannot create duplicate capital rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_capital_transactions_stripe_event
  ON capital_transactions (stripe_event_id) WHERE stripe_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_capital_transactions_stripe_charge
  ON capital_transactions (stripe_charge_id) WHERE stripe_charge_id IS NOT NULL;

-- ============================================================================
-- ROLLBACK (manual):
--   DROP INDEX IF EXISTS uq_capital_transactions_stripe_event;
--   DROP INDEX IF EXISTS idx_capital_transactions_stripe_charge;
--   ALTER TABLE capital_transactions DROP COLUMN IF EXISTS stripe_charge_id;
--   ALTER TABLE capital_transactions DROP COLUMN IF EXISTS stripe_event_id;
-- ============================================================================
