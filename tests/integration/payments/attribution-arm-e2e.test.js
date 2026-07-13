import { describe, it, expect, afterAll } from 'vitest';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { main as runSweep, SD_KEY } from '../../../scripts/cron/payment-attribution-sweep.mjs';
import { armedProcessKey } from '../../../lib/machinery-class/armed-registration.js';

/**
 * End-to-end proof for SD-LEO-INFRA-VENTURE-REVENUE-ATTRIBUTION-ARM-001 (FR-4).
 *
 * EXEC-phase grounding correction: the live Stripe account has zero products/
 * prices/payment links configured (confirmed via read-only stripe.products.list
 * etc.) and only a LIVE-mode STRIPE_SECRET_KEY is present in this environment --
 * creating a real checkout session, even an uncompleted one, would be an
 * unauthorized live-account side effect. This test instead inserts one synthetic
 * ops_payment_events row shaped EXACTLY as lib/payments/checkout-provenance.js's
 * createVentureCheckoutSession() stamps a real session (metadata.venture_id +
 * metadata.source_surface merged onto the Stripe object, per its own source),
 * then runs the real armed cron entry point end-to-end (registration + resolve +
 * liveness stamp) against the live Supabase project, proving the full mechanism
 * -- not just the pure resolver functions already covered in
 * tests/unit/payments/attribution-resolver.test.js.
 */
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ALT_TEXT_VENTURE_ID = '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9';
const RUN = 'evt_test_arm_proof_' + Date.now();

function syntheticCheckoutCompletedPayload(eventId) {
  // Shape mirrors createVentureCheckoutSession(): provenance = { venture_id, source_surface }
  // merged into sessionParams.metadata, which Stripe echoes back onto the session object
  // included on the checkout.session.completed webhook payload's data.object.
  return {
    id: eventId,
    object: 'event',
    type: 'checkout.session.completed',
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        object: 'checkout.session',
        id: 'cs_' + eventId,
        payment_intent: 'pi_' + eventId,
        amount_total: 2500,
        currency: 'usd',
        payment_status: 'paid',
        status: 'complete',
        metadata: { venture_id: ALT_TEXT_VENTURE_ID, source_surface: 'arm_001_e2e_proof' },
      },
    },
  };
}

afterAll(async () => {
  await sb.from('ops_payment_events').delete().like('stripe_event_id', RUN + '%');
});

describe('payment-attribution-sweep end-to-end proof (FR-4)', () => {
  it('a synthetic Alt-Text checkout event attributes to venture_id=50763b6a after one real armed-cron cycle', async () => {
    const eventId = RUN + '_positive';
    const payload = syntheticCheckoutCompletedPayload(eventId);

    const { error: insertError } = await sb.from('ops_payment_events').insert({
      stripe_event_id: eventId,
      stripe_charge_id: null,
      payment_intent_id: payload.data.object.payment_intent,
      event_type: payload.type,
      amount_cents: payload.data.object.amount_total,
      currency: payload.data.object.currency,
      status: payload.data.object.status,
      livemode: false,
      event_ts: new Date(payload.created * 1000).toISOString(),
      venture_id: null,
      raw_payload: payload,
    });
    expect(insertError).toBeNull();

    const result = await runSweep(process.argv, { supabase: sb });
    expect(result.exitCode).toBe(0);
    expect(result.action).toBe('swept');
    expect(result.summary.resolved).toBeGreaterThanOrEqual(1);

    const { data: row, error: fetchError } = await sb
      .from('ops_payment_events')
      .select('venture_id, attribution_status, attribution_method')
      .eq('stripe_event_id', eventId)
      .single();
    expect(fetchError).toBeNull();
    expect(row.venture_id).toBe(ALT_TEXT_VENTURE_ID);
    expect(row.attribution_status).toBe('resolved');
    expect(row.attribution_method).toBe('direct_metadata');

    const processKey = armedProcessKey(SD_KEY);
    const { data: registryRow, error: registryError } = await sb
      .from('periodic_process_registry')
      .select('last_fired_at')
      .eq('process_key', processKey)
      .single();
    expect(registryError).toBeNull();
    expect(registryRow.last_fired_at).not.toBeNull();
    const firedAgoMs = Date.now() - new Date(registryRow.last_fired_at).getTime();
    expect(firedAgoMs).toBeLessThan(60_000);
  });

  it('negative case: an event with no venture metadata and no lineage match stays venture_id=NULL (never mis-attributed)', async () => {
    const eventId = RUN + '_negative';
    const { error: insertError } = await sb.from('ops_payment_events').insert({
      stripe_event_id: eventId,
      stripe_charge_id: null,
      payment_intent_id: 'pi_' + eventId,
      event_type: 'checkout.session.completed',
      amount_cents: 1000,
      currency: 'usd',
      status: 'complete',
      livemode: false,
      event_ts: new Date().toISOString(),
      venture_id: null,
      raw_payload: { data: { object: { object: 'checkout.session', metadata: {} } } },
    });
    expect(insertError).toBeNull();

    const result = await runSweep(process.argv, { supabase: sb });
    expect(result.exitCode).toBe(0);

    const { data: row, error: fetchError } = await sb
      .from('ops_payment_events')
      .select('venture_id, attribution_status')
      .eq('stripe_event_id', eventId)
      .single();
    expect(fetchError).toBeNull();
    expect(row.venture_id).toBeNull();
    expect(row.attribution_status).toBe('unattributed');
  });
});
