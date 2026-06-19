/**
 * lib/operator/cash-sources/stripe-balance.js
 *
 * SD-EHG-OPERATOR-CASH-BANK-FEED-001 — FR-3: read-only Stripe Balance cash slice.
 *
 * Funds sitting in Stripe are a low-sensitivity slice of cash-on-hand. This uses
 * the already-wired getStripe() client (lib/payments/stripe-client.js, which
 * fail-closes live keys in fleet/CI so this runs in TEST mode) and calls ONLY
 * stripe.balance.retrieve() — a READ. No charge / payout / transfer / refund is
 * ever invoked here (TR-2, RISK: accidental write scope).
 *
 * Fail-soft: any error returns null so the feeder leaves cash stale rather than
 * crashing or fabricating a number.
 */

import { getStripe } from '../../payments/stripe-client.js';

/**
 * Read the available USD balance held in Stripe as a cash slice.
 * Uses `available` (settled) only — the conservative cash-on-hand figure; pending
 * in-flight funds are excluded.
 *
 * @param {object} [opts]
 * @param {object} [opts.stripeClient] - injected Stripe client (tests); defaults to getStripe()
 * @param {object} [opts.env] - environment for the key guard
 * @returns {Promise<{usd:number, source:'stripe'}|null>} null on any error
 */
export async function readStripeCashSlice({ stripeClient, env = process.env } = {}) {
  try {
    const stripe = stripeClient || (await getStripe(env));
    const bal = await stripe.balance.retrieve(); // READ-ONLY
    const available = Array.isArray(bal?.available) ? bal.available : null;
    if (!available) return null;
    const usdCents = available
      .filter((b) => String(b?.currency || '').toLowerCase() === 'usd')
      .reduce((sum, b) => sum + (Number(b?.amount) || 0), 0);
    return { usd: Number((usdCents / 100).toFixed(2)), source: 'stripe' };
  } catch {
    return null; // fail-soft: leave cash stale, never throw into the feeder
  }
}
