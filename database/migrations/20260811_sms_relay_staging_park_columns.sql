-- SD-LEO-INFRA-CHAIRMAN-INBOUND-VISIBILITY-001 FR-1/FR-4c
-- @approved-by: codestreetlabs@gmail.com
-- (approval chain: coordinator classification on read 2026-08-11 seat 56f09320 — pure additive
--  nullable IF NOT EXISTS columns, no RLS/GRANT, orthogonal to the drained_at claim; applied by
--  coordinator per two-denial fallback after worker seat classifier denials, signal 1cb9c898)
--
-- Additive-only: two nullable timestamptz columns. drained_at's exactly-once processing
-- claim (lib/chairman/sms-bridge.js drainSmsRelayStaging) is untouched — parked_at/
-- resolved_at are a separate, orthogonal "needs human attention" surface read by both
-- the drain runner (writer) and the Adam quiet-tick (reader), per the SD's CONTRACT line.

ALTER TABLE sms_relay_staging
  ADD COLUMN IF NOT EXISTS parked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

COMMENT ON COLUMN sms_relay_staging.parked_at IS
  'SD-LEO-INFRA-CHAIRMAN-INBOUND-VISIBILITY-001: set when a verified-chairman-number row resolves no_match/rate_limited, so content is never terminal-drained unnoticed. NULL means never parked. Orthogonal to drained_at (the exactly-once processing claim) — never repurpose drained_at for this.';

COMMENT ON COLUMN sms_relay_staging.resolved_at IS
  'SD-LEO-INFRA-CHAIRMAN-INBOUND-VISIBILITY-001: set once a parked row has been explicitly dispositioned (scripts/resolve-parked-chairman-sms.cjs). NULL + parked_at IS NOT NULL means still awaiting a reply/disposition and re-fires QUIET_TICK_SMS_PARKED every tick.';
