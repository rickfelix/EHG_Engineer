/**
 * Read-only Stripe diagnosis skill for the venture support loop.
 * SD-LEO-GEN-NEED-WELL-THOUGHT-001 FR-2.
 *
 * DIAGNOSE-AND-EXPLAIN ONLY (TR-2/FR-2 hard constraint): every Stripe call below is a literal
 * `.retrieve`/`.list` method access -- never a mutation method (create/update/del/cancel/capture/
 * refunds), and never a bracket-indexed/computed method lookup on the client object, which would
 * defeat a static scan for the literal method names. Verified by a Proxy-based fake-Stripe test
 * that throws on any property access other than retrieve/list (a static scan alone cannot prove this).
 *
 * Reuses lib/payments/stripe-client.js#getStripeForVenture -- no new Stripe client/key handling.
 * Fails open (returns null) on ANY error, including a launch_mode refusal from
 * assertVentureLiveAllowed(), a timeout, or an unresolvable customer -- never throws, never blocks
 * the caller's own canned-resolution fallback (TR-3).
 */
'use strict';

import { getStripeForVenture } from '../payments/stripe-client.js';

const LOOKUP_TIMEOUT_MS = 5000;

function withTimeout(promise, ms) {
  // TESTING finding N1 (EXEC-TO-PLAN, evidence 5b69b337): clearTimeout regardless of which side
  // of the race settled first, so a won race doesn't keep a short-lived process alive for the
  // full timeout window.
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`stripe-support-skill: lookup exceeded ${ms}ms`)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Diagnose a stripe-tagged ticket: resolve the customer by email (ticket.customer_ref), then
 * report the most recent charge status, subscription status, and invoice status. Read-only.
 * @returns {Promise<string|null>} a short diagnosis string, or null (fail-open) on any failure.
 */
export async function diagnoseStripeIssue(supabase, ventureId, ticket = {}) {
  try {
    return await withTimeout(runDiagnosis(supabase, ventureId, ticket), LOOKUP_TIMEOUT_MS);
  } catch {
    return null;
  }
}

async function runDiagnosis(supabase, ventureId, ticket) {
  const email = typeof ticket.customer_ref === 'string' && ticket.customer_ref.includes('@') ? ticket.customer_ref : null;
  if (!email) return null;

  const stripe = await getStripeForVenture({ supabase, ventureId });
  if (!stripe) return null;

  const customers = await stripe.customers.list({ email, limit: 1 });
  const customer = customers?.data?.[0];
  if (!customer) return `No Stripe customer record found for ${email}.`;

  const [charges, subscriptions, invoices] = await Promise.all([
    stripe.charges.list({ customer: customer.id, limit: 1 }),
    stripe.subscriptions.list({ customer: customer.id, limit: 1 }),
    stripe.invoices.list({ customer: customer.id, limit: 1 }),
  ]);

  const parts = [];
  const lastCharge = charges?.data?.[0];
  if (lastCharge) parts.push(`most recent charge: ${lastCharge.status} ($${(lastCharge.amount / 100).toFixed(2)})`);
  const sub = subscriptions?.data?.[0];
  if (sub) parts.push(`subscription: ${sub.status}`);
  const invoice = invoices?.data?.[0];
  if (invoice) parts.push(`most recent invoice: ${invoice.status}`);

  if (parts.length === 0) return `Stripe customer found for ${email}, but no charges/subscriptions/invoices on record.`;
  return `Stripe account status for ${email} -- ${parts.join('; ')}.`;
}

export { LOOKUP_TIMEOUT_MS };
