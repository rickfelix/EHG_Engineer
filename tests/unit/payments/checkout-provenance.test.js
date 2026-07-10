import { describe, it, expect, vi } from 'vitest';
import { createVentureCheckoutSession } from '../../../lib/payments/checkout-provenance.js';

function buildStripeStub() {
  const create = vi.fn(() => Promise.resolve({ id: 'cs_test_123' }));
  return { stripe: { checkout: { sessions: { create } } }, create };
}

describe('createVentureCheckoutSession (SD-LEO-INFRA-PAYMENT-RAIL-ATTRIBUTION-002 FR-1)', () => {
  it('TS-1: stamps metadata.venture_id + metadata.source_surface on a payment-mode session', async () => {
    const { stripe, create } = buildStripeStub();
    const getStripeForVentureFn = vi.fn(() => Promise.resolve(stripe));

    await createVentureCheckoutSession({
      supabase: {},
      ventureId: 'v-123',
      sourceSurface: 'pricing_page',
      sessionParams: { mode: 'payment', line_items: [{ price: 'price_1', quantity: 1 }], success_url: 'https://x/success' },
      getStripeForVentureFn,
    });

    expect(getStripeForVentureFn).toHaveBeenCalledWith({ supabase: {}, ventureId: 'v-123' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { venture_id: 'v-123', source_surface: 'pricing_page' },
      }),
    );
  });

  it('TS-1: ALSO stamps subscription_data.metadata for subscription-mode sessions (not just top-level metadata)', async () => {
    const { stripe, create } = buildStripeStub();
    const getStripeForVentureFn = vi.fn(() => Promise.resolve(stripe));

    await createVentureCheckoutSession({
      supabase: {},
      ventureId: 'v-456',
      sourceSurface: 'upgrade_modal',
      sessionParams: { mode: 'subscription', line_items: [{ price: 'price_2', quantity: 1 }] },
      getStripeForVentureFn,
    });

    const callArgs = create.mock.calls[0][0];
    expect(callArgs.metadata).toEqual({ venture_id: 'v-456', source_surface: 'upgrade_modal' });
    expect(callArgs.subscription_data.metadata).toEqual({ venture_id: 'v-456', source_surface: 'upgrade_modal' });
  });

  it('does not add subscription_data for payment-mode sessions', async () => {
    const { stripe, create } = buildStripeStub();
    const getStripeForVentureFn = vi.fn(() => Promise.resolve(stripe));

    await createVentureCheckoutSession({
      supabase: {},
      ventureId: 'v-789',
      sourceSurface: 'pricing_page',
      sessionParams: { mode: 'payment' },
      getStripeForVentureFn,
    });

    expect(create.mock.calls[0][0].subscription_data).toBeUndefined();
  });

  it('preserves caller-supplied metadata/subscription_data.metadata alongside the stamped provenance', async () => {
    const { stripe, create } = buildStripeStub();
    const getStripeForVentureFn = vi.fn(() => Promise.resolve(stripe));

    await createVentureCheckoutSession({
      supabase: {},
      ventureId: 'v-1',
      sourceSurface: 'api',
      sessionParams: { mode: 'subscription', metadata: { order_ref: 'ORD-1' }, subscription_data: { metadata: { plan_tier: 'pro' } } },
      getStripeForVentureFn,
    });

    const callArgs = create.mock.calls[0][0];
    expect(callArgs.metadata).toEqual({ order_ref: 'ORD-1', venture_id: 'v-1', source_surface: 'api' });
    expect(callArgs.subscription_data.metadata).toEqual({ plan_tier: 'pro', venture_id: 'v-1', source_surface: 'api' });
  });

  it('throws without ventureId/sourceSurface/sessionParams', async () => {
    await expect(createVentureCheckoutSession({ supabase: {}, sourceSurface: 'x', sessionParams: {} })).rejects.toThrow(/ventureId is required/);
    await expect(createVentureCheckoutSession({ supabase: {}, ventureId: 'v-1', sessionParams: {} })).rejects.toThrow(/sourceSurface is required/);
    await expect(createVentureCheckoutSession({ supabase: {}, ventureId: 'v-1', sourceSurface: 'x' })).rejects.toThrow(/sessionParams is required/);
  });

  it('TR-4: calls getStripeForVenture (the venture-scoped guarded entry point), not the bare getStripe', async () => {
    const source = await import('node:fs').then((fs) => fs.readFileSync(
      new URL('../../../lib/payments/checkout-provenance.js', import.meta.url),
      'utf8',
    ));
    expect(source).toMatch(/import \{ getStripeForVenture \} from '\.\/stripe-client\.js'/);
    expect(source).not.toMatch(/\bgetStripe\(/);
  });
});
