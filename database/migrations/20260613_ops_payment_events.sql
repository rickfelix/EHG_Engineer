-- Migration: 20260613_ops_payment_events.sql
-- SD: SD-LEO-INFRA-PAYMENT-RAIL-FOUNDATION-001 (Phase-1 payment rail)
-- Purpose: Raw Stripe charge/event capture table (the correct destination for
--          webhook capture). NOT ops_revenue_metrics (a Phase-2 aggregate).
-- Idempotency anchor: UNIQUE(stripe_event_id). venture_id nullable for a
--          venture-agnostic, transferable rail (PAT-PORT-ISOL-001).
-- Reversible: see rollback block at the bottom.

CREATE TABLE IF NOT EXISTS ops_payment_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id    TEXT NOT NULL UNIQUE,            -- idempotency anchor (evt_...)
  stripe_charge_id   TEXT,                            -- ch_...
  payment_intent_id  TEXT,                            -- pi_...
  event_type         TEXT NOT NULL,                   -- e.g. checkout.session.completed
  amount_cents       BIGINT,                          -- Stripe minor units (int64; negative = refund/money-out)
  currency           TEXT,                            -- ISO 4217 lower-case (e.g. usd)
  status             TEXT,                            -- captured | succeeded | refunded | ...
  livemode           BOOLEAN NOT NULL DEFAULT false,  -- false = Stripe TEST mode
  event_ts           TIMESTAMPTZ,                     -- Stripe event created time
  venture_id         UUID REFERENCES ventures(id) ON DELETE SET NULL,  -- NULLABLE: pre-attribution / transferable
  raw_payload        JSONB NOT NULL,                  -- full verified Stripe event
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_payment_events_charge   ON ops_payment_events (stripe_charge_id)  WHERE stripe_charge_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ops_payment_events_pi        ON ops_payment_events (payment_intent_id) WHERE payment_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ops_payment_events_venture   ON ops_payment_events (venture_id)         WHERE venture_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ops_payment_events_event_ts  ON ops_payment_events (event_ts DESC);

-- RLS: financial data containing the FULL Stripe event (raw_payload may include
-- customer PII / partial card metadata). Service-role ONLY — webhook ingest and
-- backend reads use the service-role client. Authenticated/anon get NO direct
-- access (adversarial-review PAY-RAIL-002); a sanitized, PII-free VIEW is the
-- intended surface for any future dashboard (Phase-2).
ALTER TABLE ops_payment_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ops_payment_events' AND policyname='ops_payment_events_service') THEN
    CREATE POLICY ops_payment_events_service ON ops_payment_events FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE ops_payment_events IS 'Raw Stripe payment-event capture (SD-LEO-INFRA-PAYMENT-RAIL-FOUNDATION-001). Idempotent on stripe_event_id. Not an aggregate (ops_revenue_* is Phase-2).';

-- ============================================================================
-- ROLLBACK (manual):
--   DROP TABLE IF EXISTS ops_payment_events;   -- also drops its indexes + policies
-- ============================================================================
