/**
 * lib/agent-readiness/entitlement.js
 * SD-LEO-FEAT-AGENT-READINESS-SERVICE-001 FR-4 / US-008.
 *
 * DELIBERATE MVP SIMPLIFICATION, flagged explicitly rather than silently built: TR-4's schema
 * (agent_readiness_audit_run / agent_readiness_audit_sample / llm_txt_version) covers the
 * measurement side only — PLAN never speced an entitlement/purchase table for the commerce side.
 * Rather than add an unreviewed table under EXEC-phase time pressure, this module treats STRIPE
 * ITSELF as the system of record: "entitled" means "a paid Checkout Session exists with this
 * venture_url in its metadata". A durable entitlements table (for multi-audit-per-purchase,
 * expiry, refund handling) is real follow-up scope, not a corner cut on this SD's core FR-1..FR-3
 * measurement-integrity guarantees.
 */

import { getStripe } from '../payments/stripe-client.js';

/**
 * Called by checkout.completeCheckout() once payment_status === 'paid'. Currently a no-op recorder
 * (Stripe's own session IS the entitlement record) — kept as a named seam so a durable store can be
 * added later without changing checkout.js's call site.
 */
export async function grantEntitlement({ ventureUrl, stripeSessionId, customerEmail }) {
  return { ventureUrl, stripeSessionId, customerEmail, grantedAt: new Date().toISOString() };
}

const MAX_PAGES = 10; // bounded pagination: up to 1000 most-recent sessions account-wide

/**
 * Paginates because Stripe's list API has no metadata filter and Checkout Sessions do not
 * support the Search API (search is scoped to charges/customers/invoices/payment_intents/
 * subscriptions/prices/products only) -- caught by adversarial review on PR #7113: an
 * unpaginated limit:100 call silently stops recognizing a legitimately paid customer as
 * entitled once 100 newer checkout sessions (for ANYTHING in the account) have been created
 * since their purchase, with no error surfaced. Still bounded (not truly unlimited) -- past
 * MAX_PAGES*100 sessions since a purchase, entitlement can still go silently unrecognized.
 * A durable entitlements table (see module header) removes this bound entirely; real
 * follow-up scope, not forced into this MVP pass.
 * @returns {Promise<boolean>} true if a completed (paid) Checkout Session exists for ventureUrl.
 */
export async function hasEntitlement(ventureUrl, env = process.env) {
  const stripe = await getStripe(env);
  let startingAfter;
  for (let page = 0; page < MAX_PAGES; page++) {
    const sessions = await stripe.checkout.sessions.list({ limit: 100, starting_after: startingAfter });
    const match = sessions.data.some(
      (s) => s.payment_status === 'paid' && s.metadata?.ventureUrl === ventureUrl
    );
    if (match) return true;
    if (!sessions.has_more || sessions.data.length === 0) return false;
    startingAfter = sessions.data[sessions.data.length - 1].id;
  }
  return false;
}
