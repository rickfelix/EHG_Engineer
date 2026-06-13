/**
 * Stripe Webhook Handler — payment rail capture endpoint.
 * SD-LEO-INFRA-PAYMENT-RAIL-FOUNDATION-001
 *
 * Mirrors the structure of api/webhooks/github-ci-status.js but DELIBERATELY
 * does NOT port its NODE_ENV==='development' signature bypass: a payment webhook
 * verifies signatures in ALL environments (DESIGN sub-agent condition).
 *
 * Contract:
 *  - POST only (405 otherwise).
 *  - Verifies Stripe-Signature over the RAW request body via constructEvent
 *    (handles HMAC + timestamp tolerance / replay window). Bad/missing sig -> 400.
 *  - Idempotent: upsert on stripe_event_id (re-delivery is a no-op).
 *  - DB write failure -> 500 (so Stripe retries) with NO partial row.
 *
 * Route registration MUST use the raw body (e.g. express.raw({type:'application/json'}))
 * and expose it as req.rawBody or req.body (Buffer/string). constructEvent fails on
 * a re-serialized parsed object — that is intentional (raw-body integrity).
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { getStripe } from '../../lib/payments/stripe-client.js';

// Lazy: avoid import-time client construction so pure helpers (mapEventToRow)
// are unit-testable without DB env, and the client is built once on first use.
let _supabase = null;
function db() {
  if (!_supabase) _supabase = createSupabaseServiceClient();
  return _supabase;
}

/** Resolve the raw request body required for signature verification. */
function resolveRawBody(req) {
  if (req.rawBody !== undefined && req.rawBody !== null) return req.rawBody;
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return req.body;
  return null; // a parsed object cannot be verified — caller returns 400
}

/** Structured, inspectable failure marker (DESIGN condition; alert board owned by sibling SD). */
function logWebhookFailure(kind, detail) {
  console.error(`[stripe-webhook][${kind}] ${JSON.stringify({ kind, detail, at: new Date().toISOString() })}`);
}

/** Map a verified Stripe event to an ops_payment_events row. */
export function mapEventToRow(event) {
  const obj = event?.data?.object || {};
  const amount = obj.amount_total ?? obj.amount ?? obj.amount_received ?? null;
  return {
    stripe_event_id: event.id,
    stripe_charge_id: obj.latest_charge || (obj.object === 'charge' ? obj.id : null),
    payment_intent_id: obj.payment_intent || (obj.object === 'payment_intent' ? obj.id : null),
    event_type: event.type,
    amount_cents: typeof amount === 'number' ? amount : null,
    currency: obj.currency || null,
    status: obj.status || null,
    livemode: Boolean(event.livemode),
    event_ts: event.created ? new Date(event.created * 1000).toISOString() : null,
    venture_id: null, // venture-agnostic: never inferred here (PAT-PORT-ISOL-001)
    raw_payload: event
  };
}

/** Main handler. */
export async function handleStripeWebhook(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const rawBody = resolveRawBody(req);

  if (!secret) {
    logWebhookFailure('config', 'STRIPE_WEBHOOK_SECRET not set');
    return res.status(500).json({ error: 'Webhook not configured' });
  }
  if (!sig || rawBody === null) {
    logWebhookFailure('signature', sig ? 'raw body unavailable' : 'missing Stripe-Signature header');
    return res.status(400).json({ error: 'Bad request: missing signature or raw body' });
  }

  // 1) Verify signature in ALL environments (NO dev bypass). constructEvent also
  //    enforces the timestamp tolerance, rejecting stale-timestamp replays.
  let event;
  try {
    const stripe = await getStripe();
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    logWebhookFailure('signature', err?.message || String(err));
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // 2) Idempotent capture. On conflict (re-delivery) do nothing -> no-op.
  try {
    const row = mapEventToRow(event);
    const { error } = await db()
      .from('ops_payment_events')
      .upsert(row, { onConflict: 'stripe_event_id', ignoreDuplicates: true });
    if (error) throw error;
  } catch (err) {
    // 500 so Stripe retries; the single upsert is atomic -> no partial/orphan row.
    logWebhookFailure('capture', err?.message || String(err));
    return res.status(500).json({ error: 'Capture failed' });
  }

  return res.status(200).json({ received: true, id: event.id });
}

export default handleStripeWebhook;
