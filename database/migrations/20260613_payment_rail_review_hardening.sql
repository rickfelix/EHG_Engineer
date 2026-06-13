-- Migration: 20260613_payment_rail_review_hardening.sql
-- SD: SD-LEO-INFRA-PAYMENT-RAIL-FOUNDATION-001
-- Purpose: apply adversarial-review hardening to the ALREADY-APPLIED
--          ops_payment_events table (CREATE IF NOT EXISTS no-ops on re-run, so the
--          updated base migration cannot retrofit an existing table — this delta does).
--   PAY-RAIL-001/PAYRAIL-DOS-001: amount_cents INTEGER (32-bit) overflows on large
--          int64 Stripe amounts -> widen to BIGINT (table has 0 rows; zero-risk).
--   PAY-RAIL-002: raw_payload (full Stripe event, PII) was readable by every
--          authenticated user -> drop the broad authenticated SELECT policy;
--          service-role retains full access (ingest + backend reads).

ALTER TABLE ops_payment_events ALTER COLUMN amount_cents TYPE BIGINT;

DROP POLICY IF EXISTS ops_payment_events_select ON ops_payment_events;

-- ============================================================================
-- ROLLBACK (manual):
--   ALTER TABLE ops_payment_events ALTER COLUMN amount_cents TYPE INTEGER;  -- (only safe while 0 large rows)
--   CREATE POLICY ops_payment_events_select ON ops_payment_events FOR SELECT TO authenticated USING (true);
-- ============================================================================
