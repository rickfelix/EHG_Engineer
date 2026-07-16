-- Migration: Two-way chairman SMS bridge schema
-- SD: SD-LEO-FEAT-TWO-WAY-CHAIRMAN-001 (FR-1)
--
-- Additive only: existing chairman_notifications / chairman_decisions rows and
-- consumers are unaffected (new columns have safe defaults / are nullable).

-- ============================================================
-- chairman_notifications: add an SMS channel alongside existing email delivery
-- ============================================================
-- notification_type (immediate/daily_digest/weekly_summary) is a CADENCE field,
-- orthogonal to the delivery channel — this adds the channel dimension.
ALTER TABLE chairman_notifications
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'sms')),
  ADD COLUMN IF NOT EXISTS recipient_phone TEXT;

COMMENT ON COLUMN chairman_notifications.channel IS 'Delivery channel: email (default, existing behavior) or sms (SD-LEO-FEAT-TWO-WAY-CHAIRMAN-001)';
COMMENT ON COLUMN chairman_notifications.recipient_phone IS 'E.164 phone number for channel=sms sends; null for email';

-- ============================================================
-- chairman_decisions: single-use, TTL-bound reply token + fail-closed consequence level
-- ============================================================
ALTER TABLE chairman_decisions
  ADD COLUMN IF NOT EXISTS sms_reply_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS sms_reply_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sms_reply_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consequence_level TEXT CHECK (consequence_level IN ('low', 'medium', 'high'));

COMMENT ON COLUMN chairman_decisions.sms_reply_token IS 'Single-use opaque nonce binding an outbound SMS question to its reply; unique so no two decisions can share a token';
COMMENT ON COLUMN chairman_decisions.sms_reply_token_expires_at IS 'Token TTL — a reply after this time is rejected and logged as expired';
COMMENT ON COLUMN chairman_decisions.sms_reply_used_at IS 'Stamped on first successful reply — enforces single-use (a replay of the same token after this is set is rejected)';
COMMENT ON COLUMN chairman_decisions.consequence_level IS 'Fail-closed LOW/MEDIUM/HIGH classification from lib/chairman/consequence-classifier.js; HIGH is never SMS-eligible';

-- ============================================================
-- sms_inbound_log: audit trail for EVERY inbound SMS webhook attempt,
-- including rejected/expired/spoofed (not just successful answers)
-- ============================================================
CREATE TABLE IF NOT EXISTS sms_inbound_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_phone TEXT NOT NULL,
  to_phone TEXT,
  body_raw TEXT,
  provider_message_id TEXT,
  signature_valid BOOLEAN NOT NULL,
  matched_decision_id UUID REFERENCES chairman_decisions(id),
  outcome TEXT NOT NULL CHECK (outcome IN ('answered', 'expired', 'no_match', 'invalid_signature', 'rate_limited')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-number inbound rate limiting (blunt a spoofer flooding the webhook)
CREATE INDEX IF NOT EXISTS idx_sms_inbound_log_from_phone_rate
  ON sms_inbound_log (from_phone, created_at);

-- Correlate log entries back to the decision they answered
CREATE INDEX IF NOT EXISTS idx_sms_inbound_log_decision
  ON sms_inbound_log (matched_decision_id)
  WHERE matched_decision_id IS NOT NULL;

COMMENT ON TABLE sms_inbound_log IS 'Audit log of every inbound SMS webhook attempt (SD-LEO-FEAT-TWO-WAY-CHAIRMAN-001 FR-1/FR-5) — logs rejected/expired/spoofed attempts, not just successful answers';

-- RLS: service role only. No authenticated/anon policy is defined, so RLS
-- (once enabled) denies all access outside service_role by default — this is
-- an internal audit table with no per-user scoping column.
ALTER TABLE sms_inbound_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY sms_inbound_log_service_all
  ON sms_inbound_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
