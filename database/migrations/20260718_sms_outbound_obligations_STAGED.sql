-- SMS outbound obligations — durable owed-state substrate for the chairman outbound SMS channel.
-- SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-B (FR-1). Closes FAILURE F1: today a Twilio 201
-- POST-accept is treated as SUCCESS and the send runs fire-and-forget in whatever session
-- called it, so a 6AM morning-review can be 'sent' but never DELIVERED and no session survives
-- context compaction to notice.
--
-- WHY A TABLE: every outbound chairman SMS becomes a durable 'owed' obligation row written
-- BEFORE the provider send, so a pending/undelivered send survives session death and is
-- reconcilable by ANY session/worker (lib/chairman/sms-outbound-worker.js reconcileOutboundSms)
-- — not held in a session-local setTimeout that dies on compaction. Delivery-truth (FR-2) is
-- keyed to provider_message_id: the row is marked delivered ONLY on a signature-valid Twilio
-- MessageStatus=delivered callback, NEVER on the 201-accept alone.
--
-- GOVERNANCE — WHO IS STOPPED BY WHAT (mirrors 20260717_sms_relay_staging.sql and
-- 20260717_sms_spend_envelope_STAGED.sql, the ratified chairman-gated STAGED precedents):
--   * anon / ordinary authenticated users are stopped at the RLS LAYER — no anon/authenticated
--     policy exists on this table at all.
--   * the fleet's service_role client is the sole read/write principal, via the explicit
--     service_role FOR ALL policy below (service_role also bypasses RLS by default in Supabase;
--     the explicit policy documents the intended principal, consistent with the precedents).
--
-- STAGED — NOT APPLIED BY THIS SD. requires-chairman-apply. Do NOT auto-apply on merge; there
-- is deliberately NO approved-by attestation directive on this file (a chairman approved-by
-- attestation is inserted at apply time, per the ceremony). APPLY RUNBOOK (chairman ceremony):
--   (1) chairman verbal/written approval;
--   (2) apply via the standard chairman-gated migration path with an approved-by attestation
--       commit (--issue-token -> MIGRATION_APPLY_TOKEN 3-factor ceremony);
--   (3) run `npm run schema:snapshot:lint` and commit the regenerated snapshot in the same PR
--       (removes sms_outbound_obligations from scripts/lint/schema-reference-allowlist.json);
--   (4) verify with a real service_role probe: enqueue an owed row and run reconcileOutboundSms.
-- The referencing code (lib/chairman/sms-bridge.js enqueueChairmanSms/sendChairmanSmsQuestion,
-- lib/chairman/sms-outbound-worker.js reconcileOutboundSms, api/webhooks/twilio-sms.js
-- handleTwilioStatusCallback) is FAIL-SOFT by construction: supabase-js resolves a missing-table
-- query to {data:null,error} rather than throwing, so a real-row liveness probe returns
-- "table absent" and every path degrades to a no-op (enqueue falls back to the pre-existing
-- inline-send behavior; the worker finds nothing; the callback skips the owed-row update) —
-- never crashes the currently-live send/reply path, pre-apply.

-- ============================================================
-- sms_outbound_obligations: one durable owed-state row per outbound chairman SMS.
-- ============================================================
CREATE TABLE IF NOT EXISTS sms_outbound_obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_phone TEXT NOT NULL,
  kind TEXT NOT NULL,                 -- morning_review | decision_question | heartbeat | ...
  decision_id UUID NULL,              -- nullable: informational sends (morning_review) have none
  body TEXT NOT NULL,                 -- composed message, stored so a retry resends byte-identically
  dedupe_key TEXT UNIQUE,             -- idempotent enqueue, e.g. 'morning_review:2026-07-18'
  status TEXT NOT NULL DEFAULT 'owed'
    CHECK (status IN ('owed','sending','sent','delivered','undelivered','failed','canceled')),
  provider_message_id TEXT NULL,      -- Twilio message SID, set after the 201-accept
  attempts INT NOT NULL DEFAULT 0,
  not_before TIMESTAMPTZ NULL,        -- sleep-window: 10PM-6AM ET sends queue to the 6AM batch
  claimed_at TIMESTAMPTZ NULL,        -- single-use claim stamp (serializes concurrent workers)
  claimed_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ NULL,           -- set when the provider ACCEPTS (201) — NOT delivery
  delivered_at TIMESTAMPTZ NULL,      -- set ONLY on a signature-valid MessageStatus=delivered
  last_error TEXT NULL,
  media_url TEXT NULL                 -- SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-D: signed URL for an MMS attachment (e.g. the Gantt PNG); NULL for text-only sends
);

-- Claimable-work index: the worker scans owed rows whose not_before has elapsed, oldest first.
CREATE INDEX IF NOT EXISTS idx_sms_outbound_obligations_claimable
  ON sms_outbound_obligations (created_at)
  WHERE status = 'owed';

-- Delivery-truth lookups (FR-2) key on the Twilio SID.
CREATE INDEX IF NOT EXISTS idx_sms_outbound_obligations_provider_message_id
  ON sms_outbound_obligations (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

COMMENT ON TABLE sms_outbound_obligations IS
  'Durable owed-state for every outbound chairman SMS (SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-B FR-1). Written BEFORE the provider send so a pending/undelivered send survives session death; reconciled by lib/chairman/sms-outbound-worker.js reconcileOutboundSms. delivered_at is set ONLY on a signature-valid Twilio MessageStatus=delivered callback, never on the 201-accept.';
COMMENT ON COLUMN sms_outbound_obligations.dedupe_key IS
  'UNIQUE idempotency key for enqueue (ON CONFLICT DO NOTHING), e.g. morning_review:<date> so the 6AM review enqueues at most once/day.';
COMMENT ON COLUMN sms_outbound_obligations.sent_at IS
  'Stamped when the provider ACCEPTS the message (Twilio 201/queued) — this is NOT delivery. delivered_at carries delivery-truth.';
COMMENT ON COLUMN sms_outbound_obligations.delivered_at IS
  'Stamped ONLY by a signature-valid MessageStatus=delivered status callback (FR-2). A 201-accept alone never sets this — the F1 fix.';
COMMENT ON COLUMN sms_outbound_obligations.not_before IS
  'Sleep-window gate: a row enqueued inside 10PM-6AM ET carries not_before=next-6AM so the worker does not claim it until the morning batch.';
COMMENT ON COLUMN sms_outbound_obligations.media_url IS
  'Short-TTL signed URL (SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-D) for an MMS attachment (e.g. the daily-review Gantt PNG), sourced from a PRIVATE (public:false) Supabase Storage bucket — never a public URL. NULL for text-only sends. Passed to the Twilio provider as the MediaUrl form param.';

-- RLS + policy in the SAME migration (RLS-at-create; SPINE-001-B recurrence guard),
-- mirroring sms_inbound_suspensions_service_all in 20260717_sms_relay_staging.sql. Only the
-- fleet's service_role client may read/write; no anon/authenticated policy is ever defined.
ALTER TABLE sms_outbound_obligations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sms_outbound_obligations_service_all ON sms_outbound_obligations;
CREATE POLICY sms_outbound_obligations_service_all ON sms_outbound_obligations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
