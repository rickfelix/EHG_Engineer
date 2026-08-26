/**
 * Unit pins for the read-only Stripe support skill.
 * SD-LEO-GEN-NEED-WELL-THOUGHT-001 FR-2, TR-2.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

vi.mock('../../../lib/payments/stripe-client.js', () => ({ getStripeForVenture: vi.fn() }));

import { getStripeForVenture } from '../../../lib/payments/stripe-client.js';
import { diagnoseStripeIssue, LOOKUP_TIMEOUT_MS } from '../../../lib/support/stripe-support-skill.js';

beforeEach(() => {
  vi.mocked(getStripeForVenture).mockReset();
});

/** A Stripe client that ONLY allows `.customers/.charges/.subscriptions/.invoices` (each with only
 * `.list`) -- any other property or method access throws, proving read-only-ness at the object
 * level rather than trusting a static scan of literal method names alone (adversarial TESTING
 * finding: a static scan cannot catch computed member access like stripe[method](...)). */
function makeGuardedStripe({ customer = null, charge = null, subscription = null, invoice = null } = {}) {
  const allowedResources = { customers: { list: async () => ({ data: customer ? [customer] : [] }) },
    charges: { list: async () => ({ data: charge ? [charge] : [] }) },
    subscriptions: { list: async () => ({ data: subscription ? [subscription] : [] }) },
    invoices: { list: async () => ({ data: invoice ? [invoice] : [] }) } };
  return new Proxy({}, {
    get(_t, resourceName) {
      // 'then' must resolve to undefined, not throw -- JS's Promise-resolution machinery probes
      // for a .then method on ANY awaited/resolved value to detect thenables (mockResolvedValue()
      // itself does `Promise.resolve(proxy)` internally); throwing here would misreport this proxy
      // as a broken thenable rather than a plain object.
      if (resourceName === 'then') return undefined;
      if (!(resourceName in allowedResources)) throw new Error(`GUARD: unexpected Stripe resource access "${String(resourceName)}"`);
      const resource = allowedResources[resourceName];
      return new Proxy({}, {
        get(_t2, methodName) {
          if (methodName !== 'list') throw new Error(`GUARD: unexpected Stripe method "${String(resourceName)}.${String(methodName)}" -- only .list is allowed`);
          return resource.list;
        },
      });
    },
  });
}

describe('diagnoseStripeIssue (FR-2)', () => {
  it('returns null when customer_ref is not an email (nothing to look up)', async () => {
    const result = await diagnoseStripeIssue({}, 'v-1', { customer_ref: 'not-an-email' });
    expect(result).toBeNull();
    expect(getStripeForVenture).not.toHaveBeenCalled();
  });

  it('FAIL-OPEN: returns null (never throws) when getStripeForVenture refuses (e.g. launch_mode not live)', async () => {
    vi.mocked(getStripeForVenture).mockRejectedValue(new Error("Refusing live-rail Stripe call: launch_mode='simulated'"));
    const result = await diagnoseStripeIssue({}, 'v-1', { customer_ref: 'a@b.com' });
    expect(result).toBeNull();
  });

  it('returns a "no customer record" message when the customer is not found (read-only guard active)', async () => {
    vi.mocked(getStripeForVenture).mockResolvedValue(makeGuardedStripe());
    const result = await diagnoseStripeIssue({}, 'v-1', { customer_ref: 'nobody@example.com' });
    expect(result).toMatch(/No Stripe customer record found/);
  });

  it('READ-ONLY GUARD: combines charge/subscription/invoice status into a diagnosis string using ONLY .list calls', async () => {
    vi.mocked(getStripeForVenture).mockResolvedValue(makeGuardedStripe({
      customer: { id: 'cus_1' },
      charge: { status: 'succeeded', amount: 1999 },
      subscription: { status: 'active' },
      invoice: { status: 'paid' },
    }));
    const result = await diagnoseStripeIssue({}, 'v-1', { customer_ref: 'c@example.com' });
    expect(result).toMatch(/most recent charge: succeeded \(\$19\.99\)/);
    expect(result).toMatch(/subscription: active/);
    expect(result).toMatch(/most recent invoice: paid/);
  });

  it('returns a found-but-empty message when the customer exists but has no charges/subscriptions/invoices', async () => {
    vi.mocked(getStripeForVenture).mockResolvedValue(makeGuardedStripe({ customer: { id: 'cus_2' } }));
    const result = await diagnoseStripeIssue({}, 'v-1', { customer_ref: 'c2@example.com' });
    expect(result).toMatch(/no charges\/subscriptions\/invoices on record/);
  });

  it('TS-9: FAILS OPEN on a HANG (never-resolving Stripe call), not just a thrown error', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(getStripeForVenture).mockResolvedValue({ customers: { list: () => new Promise(() => {}) } });
      const pending = diagnoseStripeIssue({}, 'v-1', { customer_ref: 'a@b.com' });
      await vi.advanceTimersByTimeAsync(LOOKUP_TIMEOUT_MS + 1);
      const result = await pending;
      expect(result).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('N1 (TESTING EXEC-TO-PLAN finding 5b69b337): the timeout timer is cleared once the lookup wins the race, not left pending', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(getStripeForVenture).mockResolvedValue(makeGuardedStripe());
      await diagnoseStripeIssue({}, 'v-1', { customer_ref: 'nobody@example.com' });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('static source guard (FR-2 hard constraint -- no mutation methods, no computed member access)', () => {
  it('the skill file never calls a Stripe mutation method, and never uses computed member access on a stripe object', () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../lib/support/stripe-support-skill.js'), 'utf8');
    const bannedMethods = ['.create(', '.update(', '.del(', '.cancel(', '.capture(', '.refunds'];
    for (const banned of bannedMethods) {
      expect(src).not.toContain(banned);
    }
    // Computed member access on the stripe client (e.g. stripe[methodName](...)) would defeat the
    // literal-method-name scan above -- assert the only bracket-indexed access pattern is absent.
    expect(src).not.toMatch(/stripe\[[^\]]+\]/);
  });
});
