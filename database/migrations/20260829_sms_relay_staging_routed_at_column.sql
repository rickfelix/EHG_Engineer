-- SD-LEO-INFRA-CHAIRMAN-SMS-RELAY-001
--
-- Additive-only: one nullable timestamptz column. Splits the "mechanically routed" moment
-- from the "genuinely handled" moment for a parked chairman SMS row -- the fix for the
-- 2026-08-29 blind window where resolved_at was stamped at ROUTE time (the same tick as
-- the mechanical no_match->Adam routing insert in lib/chairman/sms-bridge.js), so the
-- QUIET_TICK_SMS_PARKED interrupt (scripts/adam-quiet-tick.mjs's surfaceParkedChairmanSms,
-- keyed on resolved_at IS NULL) stopped firing for that row the instant it was routed, even
-- though nobody had actually looked at the resulting coordination message yet.

ALTER TABLE sms_relay_staging
  ADD COLUMN IF NOT EXISTS routed_at TIMESTAMPTZ;

COMMENT ON COLUMN sms_relay_staging.routed_at IS
  'SD-LEO-INFRA-CHAIRMAN-SMS-RELAY-001: set when a verified-chairman no_match row is mechanically routed to Adam (lib/chairman/sms-bridge.js drainSmsRelayStaging). Distinct from resolved_at, which is set only at genuine handling (explicit disposition or a confirmed reply send) -- the surfaceParkedChairmanSms interrupt stays keyed on resolved_at IS NULL, so a routed-but-unhandled row keeps re-firing until it is actually handled, not merely routed.';
