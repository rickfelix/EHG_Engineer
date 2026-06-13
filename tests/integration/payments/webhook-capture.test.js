import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { buildStripeSignatureHeader } from '../../../lib/test-helpers/stripe-signature.js';

/**
 * Integration tests for the Stripe webhook capture rail.
 * SD-LEO-INFRA-PAYMENT-RAIL-FOUNDATION-001 — TS-2/TS-3/TS-7/TS-8/TS-11.
 * Requires: ops_payment_events table applied + stripe SDK installed + Supabase env.
 * Uses locally-signed payloads (NO network, NO real Stripe account).
 */
const WHSEC = 'whsec_test_integration_rail';
process.env.STRIPE_WEBHOOK_SECRET = WHSEC;
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? process.env.STRIPE_SECRET_KEY : 'sk_test_integration_dummy';
delete process.env.STRIPE_RAIL_LIVE_MODE;

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const RUN = 'evt_test_rail_' + Date.now();
let handleStripeWebhook;

function res() { const r = { code: null, body: null }; r.status = (c) => { r.code = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; }
function eventBody(id, overrides = {}) {
  return JSON.stringify({ id, object: 'event', type: 'checkout.session.completed', livemode: overrides.livemode ?? false,
    created: overrides.created ?? Math.floor(Date.now() / 1000),
    data: { object: { object: 'checkout.session', id: 'cs_' + id, payment_intent: 'pi_' + id, amount_total: overrides.amount_total ?? 2500, currency: 'usd', payment_status: 'paid', status: 'complete' } } });
}
async function getRow(eventId) {
  const { data } = await sb.from('ops_payment_events').select('amount_cents,status').eq('stripe_event_id', eventId).maybeSingle();
  return data;
}
async function countRows(eventId) {
  const { count } = await sb.from('ops_payment_events').select('id', { count: 'exact', head: true }).eq('stripe_event_id', eventId);
  return count || 0;
}

beforeAll(async () => { ({ handleStripeWebhook } = await import('../../../api/webhooks/stripe.js')); });
afterAll(async () => { await sb.from('ops_payment_events').delete().like('stripe_event_id', RUN + '%'); });

describe('Stripe webhook capture (integration)', () => {
  it('TS-1/TS-3: valid signed event is captured exactly once and is idempotent on re-delivery', async () => {
    const id = RUN + '_a';
    const body = eventBody(id);
    const sig = buildStripeSignatureHeader(body, WHSEC);
    const r1 = res();
    await handleStripeWebhook({ method: 'POST', headers: { 'stripe-signature': sig }, rawBody: body }, r1);
    expect(r1.code).toBe(200);
    expect(await countRows(id)).toBe(1);
    // re-deliver same event id (idempotent no-op)
    const r2 = res();
    await handleStripeWebhook({ method: 'POST', headers: { 'stripe-signature': sig }, rawBody: body }, r2);
    expect(r2.code).toBe(200);
    expect(await countRows(id)).toBe(1);
  });

  it('TS-2: invalid signature is rejected with 400 and writes nothing', async () => {
    const id = RUN + '_b';
    const body = eventBody(id);
    const r = res();
    await handleStripeWebhook({ method: 'POST', headers: { 'stripe-signature': 't=1,v1=deadbeef' }, rawBody: body }, r);
    expect(r.code).toBe(400);
    expect(await countRows(id)).toBe(0);
  });

  it('missing signature header => 400', async () => {
    const id = RUN + '_c';
    const r = res();
    await handleStripeWebhook({ method: 'POST', headers: {}, rawBody: eventBody(id) }, r);
    expect(r.code).toBe(400);
    expect(await countRows(id)).toBe(0);
  });

  it('TS-8: stale-timestamp replay is rejected (constructEvent tolerance)', async () => {
    const id = RUN + '_d';
    const body = eventBody(id);
    const sig = buildStripeSignatureHeader(body, WHSEC, { timestamp: 1000000000 }); // far past
    const r = res();
    await handleStripeWebhook({ method: 'POST', headers: { 'stripe-signature': sig }, rawBody: body }, r);
    expect(r.code).toBe(400);
    expect(await countRows(id)).toBe(0);
  });

  it('raw-body integrity: a parsed object (no raw body) => 400', async () => {
    const id = RUN + '_e';
    const obj = JSON.parse(eventBody(id));
    const sig = buildStripeSignatureHeader(JSON.stringify(obj), WHSEC);
    const r = res();
    await handleStripeWebhook({ method: 'POST', headers: { 'stripe-signature': sig }, body: obj }, r); // body is parsed object, no rawBody
    expect(r.code).toBe(400);
  });

  it('non-POST method => 405', async () => {
    const r = res();
    await handleStripeWebhook({ method: 'GET', headers: {} }, r);
    expect(r.code).toBe(405);
  });
});

describe('Stripe webhook hardening (adversarial-review regressions)', () => {
  it('PAYRAIL-SIG-001: a correctly-signed event is NOT dropped when STRIPE_SECRET_KEY is unset (verification decoupled from key guard)', async () => {
    const saved = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY; // simulate key misconfig at cutover
    try {
      const id = RUN + '_nokey';
      const body = eventBody(id);
      const sig = buildStripeSignatureHeader(body, WHSEC);
      const r = res();
      await handleStripeWebhook({ method: 'POST', headers: { 'stripe-signature': sig }, rawBody: body }, r);
      expect(r.code).toBe(200);            // NOT 400 'Invalid signature'
      expect(await countRows(id)).toBe(1); // real event captured, not lost
    } finally { if (saved !== undefined) process.env.STRIPE_SECRET_KEY = saved; }
  });

  it('SEC-003: a LIVE event in test mode returns 500 (retryable, not dropped) and is not captured', async () => {
    const id = RUN + '_live';
    const body = eventBody(id, { livemode: true });
    const sig = buildStripeSignatureHeader(body, WHSEC);
    const r = res();
    await handleStripeWebhook({ method: 'POST', headers: { 'stripe-signature': sig }, rawBody: body }, r);
    expect(r.code).toBe(500);
    expect(await countRows(id)).toBe(0);
  });

  it('TS-7: malformed JSON body (valid HMAC over the bytes) => 400, nothing written', async () => {
    const id = RUN + '_malformed';
    const body = '{ not valid json ' + id;
    const sig = buildStripeSignatureHeader(body, WHSEC);
    const r = res();
    await handleStripeWebhook({ method: 'POST', headers: { 'stripe-signature': sig }, rawBody: body }, r);
    expect(r.code).toBe(400);
  });

  it('TS-10: a large int64 amount (> 2^31) is captured correctly (BIGINT)', async () => {
    const id = RUN + '_big';
    const big = 5_000_000_000;
    const body = eventBody(id, { amount_total: big });
    const sig = buildStripeSignatureHeader(body, WHSEC);
    const r = res();
    await handleStripeWebhook({ method: 'POST', headers: { 'stripe-signature': sig }, rawBody: body }, r);
    expect(r.code).toBe(200);
    const row = await getRow(id);
    expect(row?.amount_cents).toBe(big);
    expect(row?.status).toBe('paid'); // payment_status, not lifecycle
  });

  it('TS-9: concurrent re-delivery of the same event id yields exactly one row', async () => {
    const id = RUN + '_race';
    const body = eventBody(id);
    const sig = buildStripeSignatureHeader(body, WHSEC);
    const mk = () => handleStripeWebhook({ method: 'POST', headers: { 'stripe-signature': sig }, rawBody: body }, res());
    await Promise.all([mk(), mk(), mk()]);
    expect(await countRows(id)).toBe(1);
  });
});
