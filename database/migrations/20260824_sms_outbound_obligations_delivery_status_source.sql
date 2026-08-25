-- SD-LEO-INFRA-SMS-DELIVERY-STATUS-001 FR-4
-- Additive-only: one nullable TEXT column + two CHECK constraints + a backfill. No RLS/GRANT
-- touch — lighter governance tier than the CREATE-TABLE-with-RLS migration in
-- database/chairman-gated/20260824_sms_status_staging.sql, mirroring the precedent split
-- established by database/migrations/20260811_sms_relay_staging_park_columns.sql (additive
-- ALTER, no ceremony) vs 20260717_sms_relay_staging.sql (chairman-gated CREATE).
--
-- delivery_status_source is nullable + CHECK-constrained to delivered_at's presence, NOT a
-- blanket NOT NULL — a blanket NOT NULL would break every row where delivered_at is still NULL
-- (never delivered) at migration time. The invariant is "every DELIVERED row must say how it
-- knows", expressed exactly, not approximated by a table-wide NOT NULL.

ALTER TABLE sms_outbound_obligations
  ADD COLUMN IF NOT EXISTS delivery_status_source TEXT;

COMMENT ON COLUMN sms_outbound_obligations.delivery_status_source IS
  'SD-LEO-INFRA-SMS-DELIVERY-STATUS-001: how delivered_at was learned. carrier_push = a Twilio status-callback webhook (legacy direct route or the new status-relay drain). carrier_poll = Pass 1c''s sent-no-callback backstop confirmed delivery via a direct Twilio API check (lib/chairman/sms-outbound-worker.js). local_clock_fallback = Pass 1c''s own poll succeeded but Twilio''s date_updated was absent/unparseable, so this poll tick''s own clock was used. NULL means not yet delivered. Never inferred — always stamped explicitly by the writer that set delivered_at.';

-- Backfill BEFORE the CHECK constraints land: the live table already has delivered rows with
-- delivery_status_source still NULL (no push/poll-source concept existed before this SD). Adding
-- delivery_status_source_requires_delivered_at first would fail migration apply with 23514 the
-- instant it validates against those existing rows (PLAN_VERIFICATION VAL-C1, reproduced against
-- a live-shaped fixture: 970 pre-existing delivered rows with the column NULL).
--
-- Backfill: every EXISTING delivered row was, by construction, confirmed only via Pass 1c's
-- poll tier (no push callback path existed before this SD) — carrier_poll is accurate for all
-- of them, not a guess.
UPDATE sms_outbound_obligations
  SET delivery_status_source = 'carrier_poll'
  WHERE delivered_at IS NOT NULL AND delivery_status_source IS NULL;

ALTER TABLE sms_outbound_obligations
  DROP CONSTRAINT IF EXISTS delivery_status_source_requires_delivered_at;
ALTER TABLE sms_outbound_obligations
  ADD CONSTRAINT delivery_status_source_requires_delivered_at
  CHECK (delivered_at IS NULL OR delivery_status_source IS NOT NULL);

ALTER TABLE sms_outbound_obligations
  DROP CONSTRAINT IF EXISTS delivery_status_source_valid_values;
ALTER TABLE sms_outbound_obligations
  ADD CONSTRAINT delivery_status_source_valid_values
  CHECK (delivery_status_source IS NULL OR delivery_status_source IN ('carrier_push', 'carrier_poll', 'local_clock_fallback'));
