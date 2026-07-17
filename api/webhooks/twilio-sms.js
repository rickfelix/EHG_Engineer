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
const TWILIO_STATUS_TO_NOTIFICATION_STATUS = {
  queued: 'queued',
  sending: 'queued',
  sent: 'sent',
  delivered: 'sent',
  undelivered: 'failed',
  failed: 'failed',
};

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

export async function handleTwilioStatusCallback(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const params = (req.body && typeof req.body === 'object') ? req.body : {};
  const url = resolveWebhookUrl(req, 'TWILIO_STATUS_CALLBACK_URL');
  const signature = req.headers['x-twilio-signature'];
  const signatureValid = Boolean(url) && twilioProvider.verifyInboundSignature({ url, params, signature });

  if (!signatureValid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { messageSid, status } = twilioProvider.parseStatusCallback(params);
  if (messageSid) {
    // FR-6: delivery status only — no new fallback daemon. An unanswered SMS
    // question stays chairman_decisions.status='pending', which the EXISTING
    // lib/eva/chairman-decision-timeout.js poller already re-escalates to email.
    const mappedStatus = TWILIO_STATUS_TO_NOTIFICATION_STATUS[status] || 'failed';
    await db()
      .from('chairman_notifications')
      .update({ status: mappedStatus })
      .eq('provider_message_id', messageSid)
      .eq('channel', 'sms');
  }

  return res.status(200).json({ received: true });
}

export default handleTwilioSmsWebhook;
