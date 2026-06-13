import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { assertKeyAllowed, isLiveKey, isTestKey, isCIContext } from '../../../lib/payments/stripe-client.js';
import { toCapitalTransactionCandidate } from '../../../lib/payments/analytics-bridge.js';
import { buildStripeSignatureHeader, buildEventRawBody } from '../../../lib/test-helpers/stripe-signature.js';
import { mapEventToRow } from '../../../api/webhooks/stripe.js';

describe('stripe-client key guard (fail-closed live keys — SEC-001)', () => {
  it('permits sk_test_ keys', () => {
    expect(assertKeyAllowed('sk_test_abc', { isCI: true, liveModeEnabled: false })).toBe(true);
    expect(isTestKey('sk_test_abc')).toBe(true);
  });
  it('REFUSES sk_live_ in CI/fleet context', () => {
    expect(() => assertKeyAllowed('sk_live_abc', { isCI: true })).toThrow(/CI\/fleet/);
    expect(isLiveKey('sk_live_abc')).toBe(true);
  });
  it('REFUSES sk_live_ when live mode not enabled (even outside CI)', () => {
    expect(() => assertKeyAllowed('sk_live_abc', { isCI: false, liveModeEnabled: false })).toThrow(/STRIPE_RAIL_LIVE_MODE/);
  });
  it('REFUSES sk_live_ when live mode on but not explicitly confirmed (fail-closed)', () => {
    expect(() => assertKeyAllowed('sk_live_abc', { isCI: false, liveModeEnabled: true, liveConfirmed: false })).toThrow(/STRIPE_LIVE_DEPLOY_CONFIRM/);
  });
  it('permits sk_live_ only with not-CI AND live mode AND explicit confirmation', () => {
    expect(assertKeyAllowed('sk_live_abc', { isCI: false, liveModeEnabled: true, liveConfirmed: true })).toBe(true);
  });
  it('throws on missing or unrecognized keys', () => {
    expect(() => assertKeyAllowed(undefined, { isCI: true })).toThrow(/not set/);
    expect(() => assertKeyAllowed('pk_test_abc', { isCI: true })).toThrow(/neither/);
  });
  it('isCIContext detects fleet/agent sessions (CLAUDE_SESSION_ID) and common CI markers', () => {
    expect(isCIContext({ CLAUDE_SESSION_ID: 'x' })).toBe(true);
    expect(isCIContext({ GITHUB_ACTIONS: 'true' })).toBe(true);
    expect(isCIContext({ GITLAB_CI: 'true' })).toBe(true);
    expect(isCIContext({})).toBe(false);
  });
});

describe('mapEventToRow — event-type-aware (PAY-RAIL-001..004, PAYRAIL-DOS-001/002)', () => {
  it('checkout.session.completed uses payment_status (not lifecycle status) + amount_total', () => {
    const row = mapEventToRow({ id: 'evt_c', type: 'checkout.session.completed', livemode: false, created: 1700000000,
      data: { object: { object: 'checkout.session', id: 'cs_1', payment_intent: 'pi_c', amount_total: 2500, currency: 'usd', payment_status: 'paid', status: 'complete' } } });
    expect(row.amount_cents).toBe(2500);
    expect(row.status).toBe('paid'); // payment outcome, not 'complete'
    expect(row.payment_intent_id).toBe('pi_c');
    expect(row.venture_id).toBeNull();
  });
  it('payment_intent.succeeded prefers amount_received (collected) over amount', () => {
    const row = mapEventToRow({ id: 'evt_pi', type: 'payment_intent.succeeded', livemode: false, created: 1700000000,
      data: { object: { object: 'payment_intent', id: 'pi_x', amount: 5000, amount_received: 2500, latest_charge: 'ch_x', currency: 'usd', status: 'succeeded' } } });
    expect(row.amount_cents).toBe(2500); // amount_received, not 5000
    expect(row.payment_intent_id).toBe('pi_x');
    expect(row.stripe_charge_id).toBe('ch_x');
  });
  it('charge.refunded records the REFUNDED value as negative with refunded status', () => {
    const full = mapEventToRow({ id: 'evt_rf', type: 'charge.refunded', livemode: false, created: 1700000000,
      data: { object: { object: 'charge', id: 'ch_r', payment_intent: 'pi_r', amount: 5000, amount_refunded: 5000, refunded: true, currency: 'usd', status: 'succeeded' } } });
    expect(full.amount_cents).toBe(-5000);
    expect(full.status).toBe('refunded');
    expect(full.stripe_charge_id).toBe('ch_r');
    const partial = mapEventToRow({ id: 'evt_rp', type: 'charge.refunded', livemode: false, created: 1700000000,
      data: { object: { object: 'charge', id: 'ch_p', amount: 5000, amount_refunded: 2000, refunded: true, currency: 'usd', status: 'succeeded' } } });
    expect(partial.amount_cents).toBe(-2000);
    expect(partial.status).toBe('partially_refunded');
  });
  it('large int64 amount (> 2^31) is preserved (BIGINT column)', () => {
    const big = 5_000_000_000; // $50M in cents, overflows INT4
    const row = mapEventToRow({ id: 'evt_big', type: 'payment_intent.succeeded', livemode: false, created: 1700000000,
      data: { object: { object: 'payment_intent', id: 'pi_big', amount_received: big, currency: 'usd', status: 'succeeded' } } });
    expect(row.amount_cents).toBe(big);
  });
  it('unsafe/NaN amount is nulled (no overflow poison)', () => {
    const row = mapEventToRow({ id: 'evt_bad', type: 'payment_intent.succeeded', livemode: false, created: 1700000000,
      data: { object: { object: 'payment_intent', id: 'pi_bad', amount_received: Number.MAX_SAFE_INTEGER + 10, currency: 'usd' } } });
    expect(row.amount_cents).toBeNull();
  });
  it('malformed event.created does not throw — event_ts is null (PAYRAIL-DOS-002)', () => {
    expect(mapEventToRow({ id: 'evt_t1', type: 'charge.succeeded', created: 'not-a-number', data: { object: { object: 'charge', id: 'ch_t', amount: 100 } } }).event_ts).toBeNull();
    expect(mapEventToRow({ id: 'evt_t2', type: 'charge.succeeded', created: NaN, data: { object: { object: 'charge', id: 'ch_t', amount: 100 } } }).event_ts).toBeNull();
    expect(mapEventToRow({ id: 'evt_t3', type: 'charge.succeeded', created: 1700000000, data: { object: { object: 'charge', id: 'ch_t', amount: 100 } } }).event_ts).toBe(new Date(1700000000000).toISOString());
  });
});

describe('analytics-bridge forward-only mapping (FR-5 Phase-1)', () => {
  it('converts cents to major units and never resolves a venture', () => {
    const cand = toCapitalTransactionCandidate({ stripe_event_id: 'evt_2', amount_cents: 2500, currency: 'usd', stripe_charge_id: 'ch_2' });
    expect(cand.amount).toBe(25);
    expect(cand.venture_id).toBeNull();
    expect(cand._phase2_deferred).toBe(true);
  });
});

describe('stripe signature test helper', () => {
  it('produces a deterministic t=,v1= header for a fixed timestamp', () => {
    const body = buildEventRawBody({ id: 'evt_3' });
    const h1 = buildStripeSignatureHeader(body, 'whsec_x', { timestamp: 1700000000 });
    const h2 = buildStripeSignatureHeader(body, 'whsec_x', { timestamp: 1700000000 });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^t=1700000000,v1=[a-f0-9]{64}$/);
  });
});

describe('venture-agnostic / transferability audit (FR-7 / TS-4)', () => {
  it('rail source contains no hardcoded UUID (no venture/account literal)', () => {
    const files = ['lib/payments/stripe-client.js', 'lib/payments/analytics-bridge.js', 'api/webhooks/stripe.js'];
    const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    for (const f of files) {
      const src = readFileSync(resolve(process.cwd(), f), 'utf8');
      expect(src, `${f} must not hardcode a UUID`).not.toMatch(uuidRe);
    }
  });
});
