// @wire-check-exempt: test-only helper (Stripe signed-payload builder) used by tests/unit|integration/payments and the FR-4 proof; not production-wired.
/**
 * Deterministic Stripe-signature test helper.
 * SD-LEO-INFRA-PAYMENT-RAIL-FOUNDATION-001
 *
 * Builds a valid (or deliberately stale) Stripe-Signature header over a raw body
 * using the SAME scheme Stripe uses (t=<ts>,v1=<hmacSHA256(`${ts}.${body}`)>),
 * so webhook signature tests run fully in-process with NO network and NO live SDK.
 */
import crypto from 'crypto';

/**
 * @param {string} rawBody - the exact raw JSON string that will be POSTed
 * @param {string} secret  - the webhook signing secret (whsec_...)
 * @param {object} [opts]
 * @param {number} [opts.timestamp] - unix seconds; default "now"
 * @returns {string} a Stripe-Signature header value
 */
export function buildStripeSignatureHeader(rawBody, secret, opts = {}) {
  const ts = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${rawBody}`;
  const v1 = crypto.createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
  return `t=${ts},v1=${v1}`;
}

/** Convenience: a minimal well-formed Stripe event object as a raw JSON string. */
export function buildEventRawBody(overrides = {}) {
  const event = {
    id: overrides.id || 'evt_test_' + crypto.randomBytes(8).toString('hex'),
    object: 'event',
    type: overrides.type || 'checkout.session.completed',
    livemode: false,
    created: overrides.created ?? Math.floor(Date.now() / 1000),
    data: { object: overrides.dataObject || { object: 'checkout.session', id: 'cs_test_1', payment_intent: 'pi_test_1', amount_total: 2500, currency: 'usd', status: 'complete' } }
  };
  return JSON.stringify(event);
}
