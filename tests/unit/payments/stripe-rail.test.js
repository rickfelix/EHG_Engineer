import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { assertKeyAllowed, isLiveKey, isTestKey } from '../../../lib/payments/stripe-client.js';
import { toCapitalTransactionCandidate } from '../../../lib/payments/analytics-bridge.js';
import { buildStripeSignatureHeader, buildEventRawBody } from '../../../lib/test-helpers/stripe-signature.js';
import { mapEventToRow } from '../../../api/webhooks/stripe.js';

describe('stripe-client key guard (RISK/security conditions)', () => {
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
  it('permits sk_live_ only when chairman-gated live mode is on AND not CI', () => {
    expect(assertKeyAllowed('sk_live_abc', { isCI: false, liveModeEnabled: true })).toBe(true);
  });
  it('throws on missing or unrecognized keys', () => {
    expect(() => assertKeyAllowed(undefined, { isCI: true })).toThrow(/not set/);
    expect(() => assertKeyAllowed('pk_test_abc', { isCI: true })).toThrow(/neither/);
  });
});

describe('mapEventToRow (pure)', () => {
  it('maps a checkout.session.completed event to a capture row', () => {
    const event = { id: 'evt_1', type: 'checkout.session.completed', livemode: false, created: 1700000000,
      data: { object: { object: 'checkout.session', id: 'cs_1', payment_intent: 'pi_1', amount_total: 2500, currency: 'usd', status: 'complete' } } };
    const row = mapEventToRow(event);
    expect(row.stripe_event_id).toBe('evt_1');
    expect(row.payment_intent_id).toBe('pi_1');
    expect(row.amount_cents).toBe(2500);
    expect(row.currency).toBe('usd');
    expect(row.livemode).toBe(false);
    expect(row.venture_id).toBeNull(); // venture-agnostic
    expect(row.event_ts).toBe(new Date(1700000000 * 1000).toISOString());
  });
});

describe('analytics-bridge forward-only mapping (FR-5 Phase-1)', () => {
  it('converts cents to major units and never resolves a venture', () => {
    const cand = toCapitalTransactionCandidate({ stripe_event_id: 'evt_2', amount_cents: 2500, currency: 'usd', stripe_charge_id: 'ch_2' });
    expect(cand.amount).toBe(25);
    expect(cand.stripe_event_id).toBe('evt_2');
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
    const files = [
      'lib/payments/stripe-client.js',
      'lib/payments/analytics-bridge.js',
      'api/webhooks/stripe.js'
    ];
    const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    for (const f of files) {
      const src = readFileSync(resolve(process.cwd(), f), 'utf8');
      expect(src, `${f} must not hardcode a UUID (venture/account literal)`).not.toMatch(uuidRe);
    }
  });
});
