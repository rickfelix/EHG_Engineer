-- Migration: SMS inbound relay staging + persistent auto-suspend
-- SD: SD-LEO-FEAT-SMS-INBOUND-RELAY-001 (FR-2, FR-3)
-- @approved-by: codestreetlabs@gmail.com
--
-- Additive only. Builds the INSERT-only staging surface a future untrusted public
-- relay (separate EHG/Vercel project, hooks.execholdings.ai — not yet deployed as of
-- this migration) will write candidate SMS replies into, and the persistent
-- auto-suspend table the trusted consumer (lib/chairman/sms-bridge.js) uses to block a
-- flooding phone number beyond the existing 60-minute rolling rate-limit window.
--
-- Threat model: the relay verifies the Twilio HMAC signature BEFORE ever calling
-- fn_relay_insert_sms_candidate — a failed-verification request never reaches this RPC,
-- so signature_valid is TRUE by construction for every staged row. It is stored (not
-- hardcoded in the consumer) as a defense-in-depth invariant assertion, not a filter.

-- ============================================================
-- sms_relay_staging: INSERT-only candidate replies from the untrusted public relay
-- ============================================================
CREATE TABLE IF NOT EXISTS sms_relay_staging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_message_id TEXT NOT NULL,
  from_phone TEXT NOT NULL,
  to_phone TEXT,
  body_raw TEXT,
  signature_valid BOOLEAN NOT NULL DEFAULT true,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  drained_at TIMESTAMPTZ,
  CONSTRAINT sms_relay_staging_provider_message_id_key UNIQUE (provider_message_id)
);

CREATE INDEX IF NOT EXISTS idx_sms_relay_staging_undrained
  ON sms_relay_staging (received_at)
  WHERE drained_at IS NULL;

COMMENT ON TABLE sms_relay_staging IS 'INSERT-only staging for candidate SMS replies written by the untrusted public relay (SD-LEO-FEAT-SMS-INBOUND-RELAY-001 FR-2); drained by the trusted consumer in lib/chairman/sms-bridge.js';
COMMENT ON COLUMN sms_relay_staging.signature_valid IS 'Always TRUE by construction — the relay never calls fn_relay_insert_sms_candidate for a failed HMAC verification. Defense-in-depth assertion, not a filter.';
COMMENT ON COLUMN sms_relay_staging.drained_at IS 'Stamped by the trusted consumer once handleInboundSmsReply has processed this row — NULL means still pending drain';

-- RLS ON, no policies for anon/authenticated/service_role — the ONLY write path is the
-- SECURITY DEFINER RPC below (bypasses RLS by definer semantics); the ONLY read path is
-- the trusted consumer's service-role client (service_role bypasses RLS by default in
-- Supabase, so no explicit service_role policy is required for reads/updates).
ALTER TABLE sms_relay_staging ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- fn_relay_insert_sms_candidate: the ONLY write path the relay's credential can reach
-- ============================================================
CREATE OR REPLACE FUNCTION fn_relay_insert_sms_candidate(
  p_provider_message_id TEXT,
  p_from_phone TEXT,
  p_to_phone TEXT,
  p_body_raw TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_provider_message_id IS NULL OR length(trim(p_provider_message_id)) = 0 THEN
    RAISE EXCEPTION 'fn_relay_insert_sms_candidate: provider_message_id is required'
      USING ERRCODE = '22004';
  END IF;
  IF p_from_phone IS NULL OR length(trim(p_from_phone)) = 0 THEN
    RAISE EXCEPTION 'fn_relay_insert_sms_candidate: from_phone is required'
      USING ERRCODE = '22004';
  END IF;

  -- Idempotent on provider_message_id (TR-4): a Twilio retry of the same message
  -- never creates a duplicate staging row.
  INSERT INTO sms_relay_staging (provider_message_id, from_phone, to_phone, body_raw, signature_valid)
  VALUES (p_provider_message_id, p_from_phone, p_to_phone, p_body_raw, true)
  ON CONFLICT (provider_message_id) DO NOTHING;
END;
$$;

-- Execution surface: closed by default (functions are PUBLIC-executable unless revoked),
-- opened ONLY to anon — the relay authenticates with the project's anon key, scoped down
-- to exactly this one INSERT-only operation. No read/update/delete grant is ever given.
REVOKE EXECUTE ON FUNCTION fn_relay_insert_sms_candidate(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_relay_insert_sms_candidate(TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION fn_relay_insert_sms_candidate(TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION fn_relay_insert_sms_candidate(TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ============================================================
-- sms_inbound_suspensions: persistent auto-suspend, survives the 60-min rolling window
-- ============================================================
CREATE TABLE IF NOT EXISTS sms_inbound_suspensions (
  from_phone TEXT PRIMARY KEY,
  suspended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT NOT NULL,
  cleared_at TIMESTAMPTZ
);

COMMENT ON TABLE sms_inbound_suspensions IS 'Persistent (non-rolling-window) auto-suspend for a from_phone flooding the inbound SMS path (SD-LEO-FEAT-SMS-INBOUND-RELAY-001 FR-3) — cleared_at IS NULL means the suspension is active; cleared explicitly by an operator, never by time-based expiry';

ALTER TABLE sms_inbound_suspensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY sms_inbound_suspensions_service_all
  ON sms_inbound_suspensions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- sms_inbound_log: widen the outcome vocabulary for the two new FR-3 code paths
-- ============================================================
ALTER TABLE sms_inbound_log DROP CONSTRAINT IF EXISTS sms_inbound_log_outcome_check;
ALTER TABLE sms_inbound_log ADD CONSTRAINT sms_inbound_log_outcome_check
  CHECK (outcome IN ('answered', 'expired', 'no_match', 'invalid_signature', 'rate_limited', 'ambiguous', 'suspended'));

COMMENT ON COLUMN sms_inbound_log.outcome IS 'answered|expired|no_match|invalid_signature|rate_limited|ambiguous (2+ eligible pending candidates, FR-3)|suspended (persistent auto-suspend active, FR-3)';
