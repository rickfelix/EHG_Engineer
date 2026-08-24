-- Migration: SMS status-callback relay staging
-- SD: SD-LEO-INFRA-SMS-DELIVERY-STATUS-001 (FR-2, FR-5)
-- @approved-by: codestreetlabs@gmail.com
-- @chairman-gated: a new RLS-enabled table (sms_status_staging) — outside the additive-no-rls
--   delegated-apply scope, mirroring the inbound relay's own chairman-gated precedent
--   (database/migrations/20260717_sms_relay_staging.sql). Deliberately STAGED (not applied as
--   of this PR): the referencing code (lib/chairman/sms-bridge.js drainSmsStatusStaging) is
--   fail-soft against the table's absence, and the SD's completion criteria are "performable",
--   not "cutover live" — see docs/runbooks/sms-relay-drain-go-live.md's own scope boundary,
--   which this SD explicitly follows (LEAD-corrected risk R1).
--
-- Additive only. Builds the INSERT-only staging surface a future public status-callback relay
-- route (EHG repo, sms-relay/api/status.js — see the companion PR in that repo) writes Twilio
-- status callbacks into, drained by lib/chairman/sms-bridge.js:drainSmsStatusStaging into the
-- EXISTING sms_outbound_obligations table via the EXISTING (extracted) owed-delivery-truth
-- writer (lib/chairman/owed-delivery-truth.js) — no new delivery-truth mapping is introduced
-- here, only a new transport surface for the existing one.
--
-- Threat model: mirrors 20260717_sms_relay_staging.sql exactly. The relay verifies the Twilio
-- HMAC signature BEFORE ever calling fn_relay_insert_sms_status; a failed-verification request
-- never reaches this RPC, so signature_valid is TRUE by construction. p_relay_secret is checked
-- against the EXISTING sms_relay_secret singleton (SD-LEO-FEAT-SMS-INBOUND-RELAY-001) — reused,
-- not duplicated, since it is the same relay project's shared secret regardless of which route
-- (inbound vs status) is calling.
--
-- UNIQUENESS (SD-LEO-INFRA-SMS-DELIVERY-STATUS-001 VALIDATION finding W4 / TR-4): deliberately
-- NOT UNIQUE(provider_message_id) alone, unlike the inbound relay's precedent. Twilio sends one
-- status callback PER STATUS TRANSITION for a message (queued/sending/sent/delivered/undelivered/
-- failed are each a distinct event for the same MessageSid) — a single-column unique constraint
-- copied verbatim from the inbound relay would silently collapse these via ON CONFLICT DO
-- NOTHING, permanently losing whichever status arrives second. The composite key below is
-- (provider_message_id, message_status): idempotent against a Twilio retry of the SAME status
-- event, but never collapses two DIFFERENT status events for the same message.

-- ============================================================
-- sms_status_staging: INSERT-only status callbacks from the untrusted public status relay
-- ============================================================
CREATE TABLE IF NOT EXISTS sms_status_staging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_message_id TEXT NOT NULL,
  message_status TEXT NOT NULL,
  raw_payload JSONB,
  signature_valid BOOLEAN NOT NULL DEFAULT true,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  drained_at TIMESTAMPTZ,
  CONSTRAINT sms_status_staging_sid_status_key UNIQUE (provider_message_id, message_status)
);

CREATE INDEX IF NOT EXISTS idx_sms_status_staging_undrained
  ON sms_status_staging (received_at)
  WHERE drained_at IS NULL;

COMMENT ON TABLE sms_status_staging IS 'INSERT-only staging for Twilio status callbacks written by the untrusted public status relay (SD-LEO-INFRA-SMS-DELIVERY-STATUS-001 FR-1/FR-2); drained by lib/chairman/sms-bridge.js:drainSmsStatusStaging into sms_outbound_obligations via lib/chairman/owed-delivery-truth.js';
COMMENT ON COLUMN sms_status_staging.signature_valid IS 'Always TRUE by construction — the relay never calls fn_relay_insert_sms_status for a failed HMAC verification. Defense-in-depth assertion, not a filter.';
COMMENT ON COLUMN sms_status_staging.drained_at IS 'Stamped (claim-first) by drainSmsStatusStaging once processed — NULL means still pending drain. A missing delivery_status_source column on sms_outbound_obligations leaves this NULL too (schema-not-ready, retried next tick), never silently discarded.';
COMMENT ON CONSTRAINT sms_status_staging_sid_status_key ON sms_status_staging IS 'Composite, NOT single-column: status callbacks are many-per-MessageSid (one per state transition). A bare UNIQUE(provider_message_id) would silently drop a later status for an already-staged SID.';

-- RLS ON, no policies for anon/authenticated/service_role — the ONLY write path is the
-- SECURITY DEFINER RPC below (bypasses RLS by definer semantics); the ONLY read path is
-- the trusted consumer's service-role client (service_role bypasses RLS by default).
ALTER TABLE sms_status_staging ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- fn_relay_insert_sms_status: the ONLY write path the status relay's credential can reach.
-- Requires BOTH anon-key EXECUTE grant AND the correct p_relay_secret — mirrors
-- fn_relay_insert_sms_candidate exactly, reusing the SAME sms_relay_secret singleton.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_relay_insert_sms_status(
  p_provider_message_id TEXT,
  p_message_status TEXT,
  p_raw_payload JSONB,
  p_relay_secret TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expected_secret TEXT;
BEGIN
  SELECT secret_value INTO v_expected_secret FROM sms_relay_secret WHERE id = 1;
  IF v_expected_secret IS NULL OR p_relay_secret IS NULL OR p_relay_secret != v_expected_secret THEN
    -- Same uniform failure as every other reject path — the caller learns nothing about
    -- WHY the call failed from this alone.
    RAISE EXCEPTION 'fn_relay_insert_sms_status: unauthorized'
      USING ERRCODE = '28000';
  END IF;

  IF p_provider_message_id IS NULL OR length(trim(p_provider_message_id)) = 0 THEN
    RAISE EXCEPTION 'fn_relay_insert_sms_status: provider_message_id is required'
      USING ERRCODE = '22004';
  END IF;
  IF p_message_status IS NULL OR length(trim(p_message_status)) = 0 THEN
    RAISE EXCEPTION 'fn_relay_insert_sms_status: message_status is required'
      USING ERRCODE = '22004';
  END IF;

  -- Idempotent on (provider_message_id, message_status): a Twilio retry of the SAME status
  -- event never creates a duplicate row, but a DIFFERENT status event for the same SID
  -- (e.g. sent then delivered) always inserts its own row.
  INSERT INTO sms_status_staging (provider_message_id, message_status, raw_payload, signature_valid)
  VALUES (p_provider_message_id, p_message_status, p_raw_payload, true)
  ON CONFLICT (provider_message_id, message_status) DO NOTHING;
END;
$$;

-- Execution surface: closed by default (functions are PUBLIC-executable unless revoked),
-- opened ONLY to anon — the relay authenticates with the project's anon key AS ONE OF TWO
-- factors (the p_relay_secret check above is the other). No read/update/delete grant is
-- ever given.
REVOKE EXECUTE ON FUNCTION fn_relay_insert_sms_status(TEXT, TEXT, JSONB, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_relay_insert_sms_status(TEXT, TEXT, JSONB, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION fn_relay_insert_sms_status(TEXT, TEXT, JSONB, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION fn_relay_insert_sms_status(TEXT, TEXT, JSONB, TEXT) TO service_role;
