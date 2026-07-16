// @wire-check-exempt: test-only helper (Twilio signed-webhook builder), not production-wired.
/**
 * Deterministic Twilio-signature test helper.
 * SD-LEO-FEAT-TWO-WAY-CHAIRMAN-001
 *
 * Builds a valid X-Twilio-Signature header using the SAME scheme Twilio uses
 * (base64(HMAC-SHA1(authToken, url + sorted-concatenated-params))), so webhook
 * signature tests run fully in-process with NO network and NO live account.
 * Mirrors lib/test-helpers/stripe-signature.js's pattern for the Stripe rail.
 */
import crypto from 'crypto';

/**
 * @param {string} url - the exact webhook URL Twilio would have POSTed to
 * @param {Record<string,string>} params - the form params of the inbound request
 * @param {string} authToken - the Twilio auth token used as the HMAC key
 * @returns {string} a valid X-Twilio-Signature header value
 */
export function buildTwilioSignature(url, params, authToken) {
  const sortedKeys = Object.keys(params || {}).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }
  return crypto.createHmac('sha1', authToken).update(data, 'utf8').digest('base64');
}
