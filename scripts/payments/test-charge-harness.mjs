#!/usr/bin/env node
/**
 * Stripe TEST-mode end-to-end charge harness.
 * SD-LEO-INFRA-PAYMENT-RAIL-FOUNDATION-001  (FR-4)
 *
 * Proves the rail end-to-end with ZERO real money: creates a TEST-mode
 * PaymentIntent (or Checkout Session) and lets the webhook capture it into
 * ops_payment_events. CHAIRMAN-GATED INPUT: requires a real Stripe account's
 * sk_test_ key + STRIPE_WEBHOOK_SECRET. Skips cleanly (exit 0) when absent, so
 * the fleet can build everything else without these credentials.
 *
 * Usage: node scripts/payments/test-charge-harness.mjs [--amount 2500]
 */
import 'dotenv/config';
import { getStripe, isTestKey } from '../../lib/payments/stripe-client.js';

const amount = Number((process.argv.find(a => a.startsWith('--amount='))?.split('=')[1]) || 2500);

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !isTestKey(key)) {
    console.log('[harness] SKIP: STRIPE_SECRET_KEY (sk_test_) not set — chairman-gated input. The rail scaffolding is built; provide a Stripe TEST key + STRIPE_WEBHOOK_SECRET to run the real end-to-end charge.');
    process.exit(0);
  }
  if (process.env.STRIPE_RAIL_LIVE_MODE === 'true') {
    console.error('[harness] REFUSING to run with STRIPE_RAIL_LIVE_MODE=true — this harness is TEST mode only.');
    process.exit(1);
  }

  const stripe = await getStripe();
  console.log(`[harness] Creating TEST-mode PaymentIntent for ${amount} ${'usd'} ...`);
  const pi = await stripe.paymentIntents.create({
    amount,
    currency: 'usd',
    payment_method: 'pm_card_visa',     // Stripe test PM (4242...)
    confirm: true,
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    description: 'Payment-rail TEST charge (SD-LEO-INFRA-PAYMENT-RAIL-FOUNDATION-001)'
  });
  console.log(`[harness] PaymentIntent ${pi.id} status=${pi.status} (charge=${pi.latest_charge})`);
  console.log('[harness] Now confirm the webhook captured a matching ops_payment_events row:');
  console.log("           select * from ops_payment_events where payment_intent_id = '" + pi.id + "';");
  console.log('[harness] DONE (TEST mode, no real money moved).');
}

main().catch(e => { console.error('[harness] FAILED:', e?.message || e); process.exit(1); });
