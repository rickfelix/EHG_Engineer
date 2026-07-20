/**
 * Twilio SMS Webhook Handler — inbound chairman reply + delivery status callback.
 * SD-LEO-FEAT-TWO-WAY-CHAIRMAN-001 FR-5/FR-6.
 *
 * Mirrors api/webhooks/stripe.js's posture: signature verified in ALL environments,
 * NO dev bypass (unlike api/webhooks/github-ci-status.js). Body MUST be the parsed
 * application/x-www-form-urlencoded params (Twilio's content type) — route
 * registration should use express.urlencoded({extended:false}), exposing req.body
 * as a plain object, which is what verifyInboundSignature/normalizeInboundWebhook
 * expect.
 *
 * Contract: POST only (405). Missing/invalid signature never reaches decision
 * correlation — lib/chairman/sms-bridge.js logs every attempt (including invalid
 * signatures) to sms_inbound_log for audit, then this handler always returns 200
 * TwiML so Twilio does not retry-storm a rejected message.
 */
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import twilioProvider from '../../lib/messaging/providers/twilio-provider.js';
import { handleInboundSmsReply } from '../../lib/chairman/sms-bridge.js';

let _supabase = null;
function db() {
  if (!_supabase) _supabase = createSupabaseServiceClient();
  return _supabase;
}

/**
 * Twilio's signature is computed over the EXACT URL configured in the console —
 * trusting reconstructed proxy headers (req.protocol/req.get('host')) would let a
 * spoofed Host header pass verification. Prefer an explicit, deployment-configured
 * URL; only fall back to request reconstruction outside production.
 */
function resolveWebhookUrl(req, envVar) {
  const configured = process.env[envVar];
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') return null; // fail closed: no config, no trust
  return `${req.protocol}://${req.get('host')}${req.originalUrl}`;
}

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/**
 * SD-LEO-FEAT-SMS-INBOUND-RELAY-001 FR-4: the public relay (EHG, hooks.execholdings.ai)
 * carves this handler's direct-write path out into an isolated, credential-less surface.
 * Once the operator confirms the relay is live and the red-team acceptance gate is green,
 * setting SMS_RELAY_CUTOVER_COMPLETE=true here decommissions this path WITHOUT deleting
 * or redeploying it — a rollback is just unsetting the flag. Until then (default/unset),
 * behavior is completely unchanged.
 */
function relayCutoverComplete() {
  return process.env.SMS_RELAY_CUTOVER_COMPLETE === 'true';
}

// Twilio's MessageStatus values (queued/sending/sent/delivered/undelivered/failed) are more
// granular than chairman_notifications.status's CHECK constraint
// ('queued'|'sent'|'failed'|'rate_limited'|'deferred') — map onto the closest valid value
// rather than widening a shared table's constraint for this one channel.
//
// NOTE: this collapse (delivered->'sent') applies ONLY to the shared chairman_notifications
// audit row, whose CHECK lacks a 'delivered' state. It must NEVER apply to the owed-state
// table sms_outbound_obligations, whose whole purpose (FR-1/FR-2) is to carry delivery-truth:
// there, delivered is a DISTINCT terminal state set ONLY on MessageStatus=delivered. See
// applyOwedDeliveryTruth below.
const TWILIO_STATUS_TO_NOTIFICATION_STATUS = {
  queued: 'queued',
  sending: 'queued',
  sent: 'sent',
  delivered: 'sent',
  undelivered: 'failed',
  failed: 'failed',
};

// SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-B FR-2: map a Twilio MessageStatus onto the owed-row
// state change — delivery-truth, keyed to provider_message_id (the Twilio SID). A 201-accept
// alone is 'queued'/'sending'/'sent' and NEVER sets delivered_at; delivered is the ONLY status
// that stamps delivered_at; undelivered/failed flip the row onto the reconcile/retry/alert path
// (FR-3). Transient statuses return null => no owed-row write (the row stays on its send path).
function owedRowUpdateForStatus(status, nowIso) {
  if (status === 'delivered') return { status: 'delivered', delivered_at: nowIso };
  if (status === 'undelivered') return { status: 'undelivered' };
  if (status === 'failed') return { status: 'failed' };
  return null; // queued/sending/sent — transient, leave the owed row on its send path
}

// Twilio message SIDs are alphanumeric (e.g. "SM<32 hex chars>"); this codebase's own test
// fixtures also use a hyphenated fake-SID convention (e.g. "SM-SENT-1"), so hyphens are allowed
// too. Validated before use in a hand-built PostgREST .or() filter string (defense in depth —
// the signature check above already guarantees this value is genuinely from Twilio, since params
// are HMAC-signed with the auth token; this guard just keeps the filter string well-formed).
const VALID_MESSAGE_SID = /^[A-Za-z0-9-]+$/;

/**
 * Stamp delivery-truth onto the owed obligation row matched by provider_message_id (FR-2), OR
 * (SD-LEO-INFRA-SMS-DELIVERY-TRUTH-001-A Solomon Pin #2) — for a 'delivered' callback ONLY — by
 * containment in prior_provider_message_ids. A resend preserves the ORIGINAL SID there, so a late
 * 'delivered' callback for it still resolves against this row instead of silently no-op'ing once
 * provider_message_id was overwritten by the newest attempt: delivery-truth achieved by ANY
 * attempt satisfies the obligation, no matter which SID confirms it.
 *
 * PRIOR-SID SCOPE (adversarial-review finding, deep-tier review, /ship EXEC-TO-PLAN): a
 * 'undelivered'/'failed' callback is matched ONLY against the CURRENT provider_message_id, never
 * against prior_provider_message_ids. A superseded (pre-resend) attempt's late failure tells us
 * nothing about the newer attempt actively in flight — applying it there would wrongly terminate
 * a row whose current send may still succeed (or may have already delivered, awaiting its own
 * callback), the exact "silently lost obligation" failure mode this SD exists to close.
 *
 * STATUS GUARD (adversarial-review finding, deep-tier SECURITY sub-agent, EXEC-TO-PLAN):
 * excludes rows already 'delivered' or 'canceled' — a late/duplicate callback for a SID the row
 * has EVER carried must never regress an already-correct terminal state. Without this guard, a
 * late callback for a prior (pre-resend) SID could flip an already-'delivered' row's status
 * backwards, or race a concurrent in-flight resend (see the matching .eq('status','sending')
 * guard on the Pass-2 send-outcome update in lib/chairman/sms-outbound-worker.js).
 *
 * FAIL-SOFT: while the STAGED sms_outbound_obligations migration is unapplied the table is
 * absent and supabase-js resolves the update to {data:null,error} (or throws in a fake) — either
 * way this degrades to a no-op and never crashes the callback path. Runs AFTER the 401 signature
 * reject, so a forged callback can never reach it.
 */
async function applyOwedDeliveryTruth(supabase, { messageSid, status }) {
  const patch = owedRowUpdateForStatus(status, new Date().toISOString());
  if (!patch || !VALID_MESSAGE_SID.test(messageSid || '')) return;
  // 'delivered' may resolve via prior-SID history (any attempt delivering satisfies the
  // obligation); 'undelivered'/'failed' is scoped to the CURRENT SID only (see PRIOR-SID SCOPE).
  const matchFilter = patch.status === 'delivered'
    ? `provider_message_id.eq.${messageSid},prior_provider_message_ids.cs.{${messageSid}}`
    : `provider_message_id.eq.${messageSid}`;
  try {
    await supabase
      .from('sms_outbound_obligations')
      .update(patch)
      .not('status', 'in', '(delivered,canceled)')
      .or(matchFilter);
  } catch {
    /* table absent (STAGED) — fail-soft no-op */
  }
}

export async function handleTwilioSmsWebhook(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (relayCutoverComplete()) {
    // Decommissioned (FR-4) — the public relay is now the only live inbound path. This
    // handler stays mounted (not removed) for an instant rollback, but no longer touches
    // chairman_decisions with a service-role client, and no longer logs to sms_inbound_log
    // (the relay + trusted consumer own that audit trail post-cutover).
    res.set('Content-Type', 'text/xml');
    return res.status(200).send(EMPTY_TWIML);
  }

  const url = resolveWebhookUrl(req, 'TWILIO_SMS_WEBHOOK_URL');
  const params = (req.body && typeof req.body === 'object') ? req.body : {};
  const signature = req.headers['x-twilio-signature'];

  const signatureValid = Boolean(url) && twilioProvider.verifyInboundSignature({ url, params, signature });
  const normalized = twilioProvider.normalizeInboundWebhook(params);

  await handleInboundSmsReply(db(), {
    from: normalized.from,
    to: normalized.to,
    body: normalized.body,
    messageSid: normalized.messageSid,
    signatureValid,
  });

  // Always 200 + empty TwiML — Twilio does not need a reply message from us, and a
  // non-2xx response causes retry-storms on legitimate deliveries.
  res.set('Content-Type', 'text/xml');
  return res.status(200).send(EMPTY_TWIML);
}

/**
 * @param {object} req
 * @param {object} res
 * @param {{supabase?: object, provider?: object}} [deps] - test seams (default: module
 *   service-role client + the real twilioProvider), mirroring the injectable-seam convention
 *   used elsewhere in the chairman path.
 */
export async function handleTwilioStatusCallback(req, res, { supabase, provider = twilioProvider } = {}) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const params = (req.body && typeof req.body === 'object') ? req.body : {};
  const url = resolveWebhookUrl(req, 'TWILIO_STATUS_CALLBACK_URL');
  const signature = req.headers['x-twilio-signature'];
  const signatureValid = Boolean(url) && provider.verifyInboundSignature({ url, params, signature });

  // Signature reject BEFORE any database write — a forged/invalid-signature callback can
  // neither mark an undelivered message delivered nor mutate any obligation (FR-2 / TR-4).
  if (!signatureValid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const sb = supabase || db();
  const { messageSid, status } = provider.parseStatusCallback(params);
  if (messageSid) {
    // FR-6: delivery status only — no new fallback daemon. An unanswered SMS
    // question stays chairman_decisions.status='pending', which the EXISTING
    // lib/eva/chairman-decision-timeout.js poller already re-escalates to email.
    // chairman_notifications keeps its existing collapsed mapping (its CHECK lacks 'delivered').
    const mappedStatus = TWILIO_STATUS_TO_NOTIFICATION_STATUS[status] || 'failed';
    await sb
      .from('chairman_notifications')
      .update({ status: mappedStatus })
      .eq('provider_message_id', messageSid)
      .eq('channel', 'sms');

    // FR-2: delivery-truth on the owed-state row — delivered ONLY on MessageStatus=delivered;
    // undelivered/failed onto the reconcile path; a 201-accept alone is never delivered.
    await applyOwedDeliveryTruth(sb, { messageSid, status });
  }

  return res.status(200).json({ received: true });
}

export default handleTwilioSmsWebhook;
