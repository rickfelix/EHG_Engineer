-- Migration: 20260710_ops_payment_events_attribution.sql
-- SD: SD-LEO-INFRA-PAYMENT-RAIL-ATTRIBUTION-002 (Phase-2 payment rail)
-- Purpose: additive, nullable attribution columns on ops_payment_events.
--          Ingester (api/webhooks/stripe.js) still stamps venture_id: null
--          unconditionally (PAT-PORT-ISOL-001, unchanged) -- these columns
--          are written ONLY by the resolver (lib/payments/attribution-resolver.js),
--          never at capture time. Matches the forward-only-additive convention
--          established by 20260613_capital_transactions_stripe_bridge.sql.

ALTER TABLE ops_payment_events ADD COLUMN IF NOT EXISTS attribution_status TEXT
  CHECK (attribution_status IN ('resolved', 'unattributed'));
ALTER TABLE ops_payment_events ADD COLUMN IF NOT EXISTS attribution_method TEXT
  CHECK (attribution_method IN ('direct_metadata', 'lineage_payment_intent', 'lineage_charge'));
ALTER TABLE ops_payment_events ADD COLUMN IF NOT EXISTS attribution_reason TEXT;
ALTER TABLE ops_payment_events ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- Resolver's own scan predicate (WHERE venture_id IS NULL AND attribution_status IS NULL).
CREATE INDEX IF NOT EXISTS idx_ops_payment_events_unresolved
  ON ops_payment_events (created_at) WHERE venture_id IS NULL AND attribution_status IS NULL;

-- ============================================================================
-- ROLLBACK (manual):
--   DROP INDEX IF EXISTS idx_ops_payment_events_unresolved;
--   ALTER TABLE ops_payment_events DROP COLUMN IF EXISTS resolved_at;
--   ALTER TABLE ops_payment_events DROP COLUMN IF EXISTS attribution_reason;
--   ALTER TABLE ops_payment_events DROP COLUMN IF EXISTS attribution_method;
--   ALTER TABLE ops_payment_events DROP COLUMN IF EXISTS attribution_status;
-- ============================================================================
