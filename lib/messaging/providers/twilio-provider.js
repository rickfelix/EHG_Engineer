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
 *
 * SD-LEO-INFRA-MICHAEL-TIER2-CHECKPOINT-SEND-001 FR-3: send()/isConfigured() accept an optional
 * `identity` ({accountSid, authToken, messagingService}) so a second caller (Michael's
 * checkpoint-send verb) can use this same transport with its OWN Twilio sub-account, never the
 * fleet-lane TWILIO_* env vars — revoking one identity must never revoke the other. identity is
 * ALL-THREE-FIELDS-OR-TREATED-AS-UNCONFIGURED: a partial identity (e.g. sid+token but no
 * messagingService) is deliberately NOT "close enough" -- TESTING H4 found the pre-fix code would
 * have read messagingService() unguarded and made a real authenticated POST with an empty
 * MessagingServiceSid for exactly that case. resolveTransportIdentity() is the single seam both
 * isConfigured() and send() call, so there is only one place this validation can drift.
 * An identity-bearing send also OMITS StatusCallback entirely (TESTING M5): the shared
 * TWILIO_STATUS_CALLBACK_URL points at Adam's webhook, whose signature verification uses the
 * SHARED authToken() -- an identity-signed callback would never verify, so requesting one at all
 * is pure cross-lane noise, not a partial feature.
 */
import crypto from 'crypto';
import { shouldRefuseRealSend } from '../../notifications/transport-test-isolation-guard.js';

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
 * Pure: resolve {sid, token, messagingService, hasCallback} for a call, given an optional
 * identity override. An identity missing ANY of the three fields resolves to all-empty (never a
 * partial credential set) -- the caller then hits the same "not configured" fail-closed path as a
 * fully-unset environment. hasCallback is false whenever identity is supplied (SD-LEO-INFRA-
 * MICHAEL-TIER2-CHECKPOINT-SEND-001 FR-3/M5) since the shared status-callback URL/signature
 * pairing is only valid for the fleet-lane (env) identity.
 * @param {{accountSid?: string, authToken?: string, messagingService?: string}} [identity]
 */
function resolveTransportIdentity(identity) {
  if (identity) {
    const sid = identity.accountSid || '';
    const token = identity.authToken || '';
    const svc = identity.messagingService || '';
    if (sid && token && svc) return { sid, token, messagingService: svc, hasCallback: false };
    return { sid: '', token: '', messagingService: '', hasCallback: false };
  }
  return { sid: accountSid(), token: authToken(), messagingService: messagingService(), hasCallback: true };
}

/**
 * SD-LEO-INFRA-FLEET-DEAD-MAN-001 FR-2: lets a caller check config-presence BEFORE
 * attempting a send, so a config-class outage can be skipped without burning a send
 * attempt (send() itself still fails closed independently -- this is an additive
 * pre-check, not a replacement for the guard inside send()).
 * @param {{accountSid?: string, authToken?: string, messagingService?: string}} [identity]
 * @returns {boolean}
 */
export function isConfigured(identity) {
  const { sid, token } = resolveTransportIdentity(identity);
  return Boolean(sid && token);
}

/**
 * @param {{to: string, body: string, mediaUrl?: string, identity?: {accountSid: string, authToken: string, messagingService: string}}} args
 * @returns {Promise<{provider_message_id: string, status: 'queued'|'sent'|'failed'}>}
 */
export async function send({ to, body, mediaUrl, identity }) {
  // SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-C: shared transport-layer test-isolation boundary,
  // mirroring the identical guard in lib/notifications/resend-adapter.js. See
  // lib/notifications/transport-test-isolation-guard.js for the fetch-mock detection this
  // relies on to avoid regressing twilio-provider-mediaurl.test.js / twilio-signature.test.js.
  if (shouldRefuseRealSend()) {
    return { provider_message_id: null, status: 'failed', reason: 'test_env_guard' };
  }
  const { sid, token, messagingService: msgSvc, hasCallback } = resolveTransportIdentity(identity);
  if (!sid || !token) {
    // Fail closed: no live account configured (chairman-gated setup not yet complete), OR a
    // partial identity was supplied (treated identically -- never a partial credential set).
    return { provider_message_id: null, status: 'failed', reason: 'twilio_not_configured' };
  }
  const form = new URLSearchParams();
  form.set('To', to);
  form.set('MessagingServiceSid', msgSvc);
  form.set('Body', body);
  // FR-2: request a delivery-status callback so delivery-truth can be confirmed (see
  // statusCallbackUrl above). Fail-soft when unset — no callback requested. Never requested for an
  // identity-bearing send (hasCallback=false) -- see file header, TESTING M5.
  const callbackUrl = hasCallback ? statusCallbackUrl() : '';
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
 * @returns {Promise<{status: string, dateUpdated: ?string, errorCode: ?string, errorMessage: ?string}>}
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
  // QF-20260912-394: Twilio's message resource carries error_code/error_message for a
  // provider-confirmed undelivered/failed status (e.g. 30007 "carrier violation" content
  // filtering) -- previously dropped here, so no caller could ever distinguish a permanent
  // carrier rejection from a transient failure worth retrying.
  const errorCode = json.error_code != null ? String(json.error_code) : null;
  const errorMessage = typeof json.error_message === 'string' ? json.error_message : null;
  return { status: json.status, dateUpdated, errorCode, errorMessage };
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
