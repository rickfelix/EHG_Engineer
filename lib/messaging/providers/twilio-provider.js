/**
 * Twilio implementation of the MessagingProvider contract.
 * SD-LEO-FEAT-TWO-WAY-CHAIRMAN-001 FR-2.
 *
 * Reuses the .claude/notify-sms.sh account/messaging-service env vars
 * (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE, TWILIO_TO_PHONE).
 * These are chairman-gated and unset until the Business-Profile/10DLC account setup
 * completes outside this SD — send() below fails closed (no network call) when
 * credentials are absent rather than throwing an opaque fetch error.
 *
 * verifyInboundSignature implements Twilio's actual scheme: base64(HMAC-SHA1(authToken,
 * url + sorted-concatenated-form-params)) — NOT the generic raw-body HMAC-SHA256 pattern
 * used by api/webhooks/github-ci-status.js.
 */
import crypto from 'crypto';

function accountSid() { return process.env.TWILIO_ACCOUNT_SID || ''; }
function authToken() { return process.env.TWILIO_AUTH_TOKEN || ''; }
function messagingService() { return process.env.TWILIO_MESSAGING_SERVICE || ''; }
// SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-B FR-2: the public URL Twilio POSTs delivery-status
// callbacks to (handleTwilioStatusCallback). Registered as a StatusCallback form param on the
// outbound send so a delivery callback is actually requested — without it Twilio never calls
// back and delivery-truth can never be confirmed. Fail-soft: unset => no callback requested,
// the obligation stays reconcilable by the worker's attempt-timeout path (FR-3).
function statusCallbackUrl() { return process.env.TWILIO_STATUS_CALLBACK_URL || ''; }

/**
 * SD-LEO-INFRA-FLEET-DEAD-MAN-001 FR-2: lets a caller check config-presence BEFORE
 * attempting a send, so a config-class outage can be skipped without burning a send
 * attempt (send() itself still fails closed independently -- this is an additive
 * pre-check, not a replacement for the guard inside send()).
 * @returns {boolean}
 */
export function isConfigured() {
  return Boolean(accountSid() && authToken());
}

/**
 * @param {{to: string, body: string, mediaUrl?: string}} args
 * @returns {Promise<{provider_message_id: string, status: 'queued'|'sent'|'failed'}>}
 */
export async function send({ to, body, mediaUrl }) {
  const sid = accountSid();
  const token = authToken();
  if (!sid || !token) {
    // Fail closed: no live account configured (chairman-gated setup not yet complete).
    return { provider_message_id: null, status: 'failed', reason: 'twilio_not_configured' };
  }
  const form = new URLSearchParams();
  form.set('To', to);
  form.set('MessagingServiceSid', messagingService());
  form.set('Body', body);
  // FR-2: request a delivery-status callback so delivery-truth can be confirmed (see
  // statusCallbackUrl above). Fail-soft when unset — no callback requested.
  const callbackUrl = statusCallbackUrl();
  if (callbackUrl) form.set('StatusCallback', callbackUrl);
  // SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-D: MMS support. Optional, backward-compatible —
  // omitted mediaUrl produces the exact same form body as before this change.
  if (mediaUrl) form.set('MediaUrl', mediaUrl);

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
    },
    body: form.toString(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { provider_message_id: json.sid || null, status: 'failed', reason: json.message || `http_${res.status}` };
  }
  return { provider_message_id: json.sid, status: 'queued' };
}

/**
 * SD-LEO-INFRA-SMS-DELIVERY-TRUTH-001-A FR-2: query Twilio directly for a message's real
 * current status, keyed by the SID already stamped on the obligation row. Used ONLY as the
 * sent-timeout backstop when no delivery callback ever arrives — never a substitute for the
 * callback path itself. Fails closed (throws) rather than returning a guessed status, so the
 * caller can distinguish "provider confirmed X" from "the check itself didn't work" (Solomon
 * Pin #3: the latter must escalate, never silently resolve as if it were a real answer).
 * @param {string} messageSid
 * @returns {Promise<{status: string}>}
 */
export async function checkMessageStatus(messageSid) {
  const sid = accountSid();
  const token = authToken();
  if (!sid || !token) {
    throw new Error('twilio_not_configured');
  }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages/${messageSid}.json`, {
    method: 'GET',
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}` },
  });
  if (!res.ok) {
    throw new Error(`twilio_status_check_http_${res.status}`);
  }
  const json = await res.json().catch(() => null);
  if (!json || !json.status) {
    throw new Error('twilio_status_check_malformed_response');
  }
  // QF-20260729-286: date_updated is the last time Twilio changed this message's status --
  // for a message whose status is 'delivered', that IS the delivery confirmation time. The
  // caller (sms-outbound-worker.js) uses this instead of its own poll-tick "now" when stamping
  // delivered_at, since this backstop path only runs on a periodic sweep (observed ~60-90min
  // apart), not on receipt of a real-time event -- reusing "now" understated true delivery time
  // by up to the sweep interval, sometimes over 11 hours. Twilio returns this as an RFC 2822
  // string (e.g. "Thu, 30 Jul 2015 20:12:31 +0000"); Date parses it natively.
  const dateUpdated = typeof json.date_updated === 'string' ? json.date_updated : null;
  return { status: json.status, dateUpdated };
}

/**
 * Twilio's request-signature algorithm: base64(HMAC-SHA1(authToken, url + sortedParams)).
 * @param {{url: string, params: Record<string,string>, signature: string}} args
 * @returns {boolean}
 */
export function verifyInboundSignature({ url, params, signature }) {
  const token = authToken();
  if (!token || !signature) return false;
  const sortedKeys = Object.keys(params || {}).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }
  const expected = crypto.createHmac('sha1', token).update(data, 'utf8').digest('base64');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const signatureBuf = Buffer.from(signature, 'utf8');
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

/**
 * @param {Record<string,string>} body - parsed application/x-www-form-urlencoded POST body
 * @returns {{from: string, to: string, body: string, messageSid: string}}
 */
export function normalizeInboundWebhook(body) {
  return {
    from: body.From || '',
    to: body.To || '',
    body: body.Body || '',
    messageSid: body.MessageSid || body.SmsSid || '',
  };
}

/**
 * @param {Record<string,string>} body - parsed status-callback POST body
 * @returns {{messageSid: string, status: string}}
 */
export function parseStatusCallback(body) {
  return {
    messageSid: body.MessageSid || body.SmsSid || '',
    status: body.MessageStatus || body.SmsStatus || 'failed',
  };
}

export const twilioProvider = { send, isConfigured, verifyInboundSignature, normalizeInboundWebhook, parseStatusCallback, checkMessageStatus };
export default twilioProvider;
