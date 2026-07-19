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

export const twilioProvider = { send, verifyInboundSignature, normalizeInboundWebhook, parseStatusCallback };
export default twilioProvider;
