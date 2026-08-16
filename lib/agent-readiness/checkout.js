/**
 * lib/agent-readiness/checkout.js
 * SD-LEO-FEAT-AGENT-READINESS-SERVICE-001 FR-4 / US-008.
 *
 * Human-paid checkout is the SOLE revenue path for the MVP (x402 remains an optional additive rail
 * per the existing x402-ready-not-dependent ruling, never required — see scripts/agent-readiness-x402-scan.mjs
 * for the mechanical check that this file and entitlement.js stay x402-free).
 *
 * Reuses the existing, safety-guarded lib/payments/stripe-client.js (SD-LEO-INFRA-PAYMENT-RAIL-FOUNDATION-001)
 * rather than a fresh Stripe integration: getStripe() is fail-closed on live keys in any automated/CI
 * context (isCIContext() true for any session with CLAUDE_SESSION_ID set), so this module never needs
 * its own live/test switch — "sandbox/test mode" is already the only mode a fleet session can reach.
 */

import { getStripe } from '../payments/stripe-client.js';
import { grantEntitlement } from './entitlement.js';

export const FEATURE_FLAG_ENV = 'AGENT_READINESS_AUDIT_ENABLED';

/** AC-008-2: the endpoint is gated behind the feature flag. */
export function isCheckoutEnabled(env = process.env) {
  return env[FEATURE_FLAG_ENV] === 'true';
}

/**
 * Create a Stripe Checkout Session for one audit purchase. Caller redirects the customer to the
 * returned url; completion is confirmed via completeCheckout() (webhook or polling the session status).
 * @param {{ventureUrl:string, customerEmail:string, priceUsdCents:number, successUrl:string, cancelUrl:string}} params
 */
export async function createCheckoutSession({ ventureUrl, customerEmail, priceUsdCents, successUrl, cancelUrl }, env = process.env) {
  if (!isCheckoutEnabled(env)) {
    throw new Error(`Checkout is disabled: ${FEATURE_FLAG_ENV} is not 'true'`);
  }
  const stripe = await getStripe(env);
  return stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: customerEmail,
    line_items: [{
      price_data: {
        currency: 'usd',
        unit_amount: priceUsdCents,
        product_data: { name: `Agent Readiness Audit — ${ventureUrl}` }
      },
      quantity: 1
    }],
    metadata: { ventureUrl },
    success_url: successUrl,
    cancel_url: cancelUrl
  });
}

/**
 * AC-008-1 / AC-008-3: confirm a session's payment status and grant (or refuse) entitlement.
 * A declined/incomplete payment surfaces its status to the caller and grants NOTHING.
 */
export async function completeCheckout(sessionId, env = process.env) {
  const stripe = await getStripe(env);
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.payment_status !== 'paid') {
    return { completed: false, status: session.payment_status, entitlementGranted: false };
  }

  const ventureUrl = session.metadata?.ventureUrl;
  await grantEntitlement({ ventureUrl, stripeSessionId: sessionId, customerEmail: session.customer_email });
  return { completed: true, status: session.payment_status, entitlementGranted: true, ventureUrl };
}
