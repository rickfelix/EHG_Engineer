/**
 * Venture-provenance stamping at Stripe checkout-session creation
 * (SD-LEO-INFRA-PAYMENT-RAIL-ATTRIBUTION-002, FR-1).
 *
 * Attribution by construction, not inference: stamps metadata.venture_id +
 * metadata.source_surface on the checkout session at creation time, and ALSO
 * on subscription_data.metadata for subscription-mode sessions so future
 * invoice/subscription webhook events inherit venture provenance directly
 * (resolvable via attribution-resolver.js's extractDirectAttribution without
 * a live Stripe API lookup).
 */

import { getStripeForVenture } from './stripe-client.js';

/**
 * Create a venture-attributed Stripe checkout session.
 *
 * @param {object} params
 * @param {object} params.supabase - Supabase client (passed through to the launch-mode guard)
 * @param {string} params.ventureId
 * @param {string} params.sourceSurface - which platform surface minted this session (e.g. 'pricing_page', 'upgrade_modal')
 * @param {object} params.sessionParams - raw Stripe checkout.sessions.create() params (mode, line_items, success_url, etc.)
 * @param {Function} [params.getStripeForVentureFn] - injectable for tests
 * @returns {Promise<object>} the created Stripe checkout session
 */
export async function createVentureCheckoutSession({
  supabase,
  ventureId,
  sourceSurface,
  sessionParams,
  getStripeForVentureFn = getStripeForVenture,
} = {}) {
  if (!ventureId) throw new Error('createVentureCheckoutSession: ventureId is required');
  if (!sourceSurface) throw new Error('createVentureCheckoutSession: sourceSurface is required');
  if (!sessionParams) throw new Error('createVentureCheckoutSession: sessionParams is required');

  const stripe = await getStripeForVentureFn({ supabase, ventureId });

  const provenance = { venture_id: ventureId, source_surface: sourceSurface };
  const params = {
    ...sessionParams,
    metadata: { ...sessionParams.metadata, ...provenance },
  };

  if (sessionParams.mode === 'subscription') {
    params.subscription_data = {
      ...sessionParams.subscription_data,
      metadata: { ...sessionParams.subscription_data?.metadata, ...provenance },
    };
  }

  return stripe.checkout.sessions.create(params);
}
