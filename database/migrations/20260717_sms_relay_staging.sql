-- Migration: SMS inbound relay staging + persistent auto-suspend
-- SD: SD-LEO-FEAT-SMS-INBOUND-RELAY-001 (FR-2, FR-3)
-- @approved-by: codestreetlabs@gmail.com
-- @chairman-gated: three new RLS-enabled tables (sms_relay_staging, sms_inbound_suspensions,
--   sms_relay_secret) — outside the additive-no-rls delegated-apply scope, so the prod apply
--   requires the chairman/operator to run it explicitly (node scripts/apply-migration.js
--   --prod-deploy), consistent with sms-relay/README.md's chairman-gated cutover checklist
--   in the ehg repo. Deliberately STAGED (not applied as of this PR): the referencing code in
--   lib/chairman/sms-bridge.js is fail-soft against the tables' absence — supabase-js resolves
--   query errors as {data:null,error} rather than throwing, so checkAndApplyAutoSuspend() and
--   drainSmsRelayStaging() degrade to "not suspended" / "nothing to drain" pre-apply, and the
--   currently-live webhook path (api/webhooks/twilio-sms.js) is unaffected until cutover.
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
--
-- SECURITY REVIEW FINDING (SEC-1, closed by this migration): EXECUTE-on-RPC-only grants
-- restrict WHICH TABLES the relay's credential can touch, but do NOT by themselves
-- authenticate the CALLER — anyone holding the project anon key (which Supabase anon
-- keys are designed to be distributable, and MAY already be public in a deployed
-- frontend bundle sharing this project) could call this RPC directly over PostgREST,
-- bypassing the relay's HMAC verification entirely, and stage a forged candidate reply
-- (signature_valid was previously hardcoded TRUE with no caller check). p_relay_secret
-- below closes this: only the relay (which holds the secret as a private, never-shipped
-- serverless-function env var, distinct from the anon key) can produce a request the RPC
-- accepts. This is the "distinct, scoped credential" TR-5 refers to.

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
-- sms_relay_secret: singleton, RLS-deny-all holder of the relay's shared secret.
-- Readable ONLY from inside a SECURITY DEFINER function (bypasses RLS) or a
-- service_role connection — never by anon/authenticated, so leaking the anon key
-- alone is insufficient to read or guess it.
-- ============================================================
CREATE TABLE IF NOT EXISTS sms_relay_secret (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  secret_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE sms_relay_secret IS 'Singleton row holding the relay-only shared secret (SEC-1 hardening, SD-LEO-FEAT-SMS-INBOUND-RELAY-001) — set by the operator, never by the fleet, via a direct service_role insert. RLS-deny-all: no policy is defined for any role, so only a SECURITY DEFINER function body or a service_role connection can read it.';

ALTER TABLE sms_relay_secret ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- fn_relay_insert_sms_candidate: the ONLY write path the relay's credential can reach.
-- Requires BOTH anon-key EXECUTE grant AND the correct p_relay_secret (SEC-1) — anon-key
-- possession alone (which may already be public, e.g. shipped in a frontend bundle
-- sharing this project) is insufficient to stage a forged candidate reply.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_relay_insert_sms_candidate(
  p_provider_message_id TEXT,
  p_from_phone TEXT,
  p_to_phone TEXT,
  p_body_raw TEXT,
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
    -- Same uniform failure as every other reject path (TR-3) — the caller learns
    -- nothing about WHY the call failed from this alone.
    RAISE EXCEPTION 'fn_relay_insert_sms_candidate: unauthorized'
      USING ERRCODE = '28000';
  END IF;

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
-- opened ONLY to anon — the relay authenticates with the project's anon key AS ONE OF TWO
-- factors (the p_relay_secret check above is the other). No read/update/delete grant is
-- ever given.
REVOKE EXECUTE ON FUNCTION fn_relay_insert_sms_candidate(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_relay_insert_sms_candidate(TEXT, TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION fn_relay_insert_sms_candidate(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION fn_relay_insert_sms_candidate(TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

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
