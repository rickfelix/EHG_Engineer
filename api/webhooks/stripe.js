/**
 * Stripe Webhook Handler — payment rail capture endpoint.
 * SD-LEO-INFRA-PAYMENT-RAIL-FOUNDATION-001
 *
 * Mirrors api/webhooks/github-ci-status.js but DELIBERATELY does NOT port its
 * NODE_ENV==='development' signature bypass: a payment webhook verifies
 * signatures in ALL environments.
 *
 * Hardened per adversarial review (workflow wqn1prokq):
 *  - Signature verification is DECOUPLED from the API-key guard. constructEvent
 *    needs only the raw body + signature + STRIPE_WEBHOOK_SECRET (NOT
 *    STRIPE_SECRET_KEY), so a STRIPE_SECRET_KEY/guard misconfig can never cause a
 *    real, correctly-signed event to be dropped as "Invalid signature"
 *    (PAYRAIL-SIG-001 / PAYRAIL-ERR-003).
 *  - mapEventToRow is event-type-aware (checkout/payment_intent/charge/refund),
 *    uses payment_status / amount_received / amount_refunded correctly, and guards
 *    malformed amount/created (PAY-RAIL-001..004, PAYRAIL-DOS-001/002).
 *  - livemode-mismatch protection: a LIVE event arriving while the rail is not in
 *    live mode returns 500 (retryable, never dropped) + a loud config marker (SEC-003).
 *
 * Contract: POST only (405). Bad/missing sig -> 400. Missing config / live-mismatch
 *  / capture failure -> 500 (so Stripe retries; the single upsert is atomic =>
 *  no partial/orphan row). Success -> 200.
 *
 * Route registration MUST use the RAW body (e.g. express.raw({type:'application/json'}))
 * exposed as req.rawBody or req.body (Buffer/string). A re-serialized parsed object
 * cannot be verified — that is intentional (raw-body integrity).
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';

// Lazy Supabase client (unit-testable pure helpers without DB env).
let _supabase = null;
function db() {
  if (!_supabase) _supabase = createSupabaseServiceClient();
  return _supabase;
}

// Key-INDEPENDENT webhook verifier. constructEvent does not use the API key, so
// this never touches assertKeyAllowed — decoupling ingest from STRIPE_SECRET_KEY
// policy (PAYRAIL-SIG-001). A placeholder key is fine when none is configured.
let _verifier = null;
async function getWebhookVerifier() {
  if (_verifier) return _verifier;
  const { default: Stripe } = await import('stripe');
  _verifier = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_webhook_verifier_unused');
  return _verifier;
}

/** Resolve the raw request body required for signature verification. */
function resolveRawBody(req) {
  if (req.rawBody !== undefined && req.rawBody !== null) return req.rawBody;
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return req.body;
  return null; // a parsed object cannot be verified — caller returns 400
}

/** Structured, inspectable failure marker (alert board owned by the sibling SD). */
function logWebhookFailure(kind, detail) {
  console.error(`[stripe-webhook][${kind}] ${JSON.stringify({ kind, detail, at: new Date().toISOString() })}`);
}

/** Safe unix-seconds -> ISO; null on anything malformed (PAYRAIL-DOS-002). */
function safeEventTs(created) {
  const n = Number(created);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Reject amounts that are not safe integers (defense-in-depth; column is BIGINT). */
function safeAmount(a) {
  return typeof a === 'number' && Number.isSafeInteger(a) ? a : null;
}

/**
 * Map a verified Stripe event to an ops_payment_events row — event-type-aware.
 * Refunds record the refunded value as a NEGATIVE amount (money out) with a
 * refund status; checkout sessions use payment_status; payment_intents prefer
 * amount_received. Pure + exported for unit testing.
 */
export function mapEventToRow(event) {
  const obj = (event && event.data && event.data.object) || {};
  const type = (event && event.type) || '';

  let amount_cents = null;
  let status = null;
  let stripe_charge_id = null;
  let payment_intent_id = null;

  if (type.startsWith('checkout.session')) {
    amount_cents = safeAmount(obj.amount_total);
    status = obj.payment_status || obj.status || null; // payment outcome, not lifecycle
    payment_intent_id = obj.payment_intent || null;
  } else if (type.startsWith('payment_intent')) {
    amount_cents = safeAmount(obj.amount_received ?? obj.amount); // collected, not intended
    status = obj.status || null;
    payment_intent_id = obj.id || null;
    stripe_charge_id = obj.latest_charge || null;
  } else if (obj.object === 'charge' || type.startsWith('charge')) {
    payment_intent_id = obj.payment_intent || null;
    stripe_charge_id = obj.id || null;
    const refundedMinor = safeAmount(obj.amount_refunded);
    if (type === 'charge.refunded' || (obj.refunded && refundedMinor)) {
      amount_cents = refundedMinor != null ? -Math.abs(refundedMinor) : null; // negative = money out
      const full = obj.amount != null && refundedMinor != null && refundedMinor >= obj.amount;
      status = full ? 'refunded' : 'partially_refunded';
    } else {
      amount_cents = safeAmount(obj.amount);
      status = obj.status || null;
    }
  } else {
    // unknown/other event types: best-effort, never fabricate
    amount_cents = safeAmount(obj.amount);
    status = obj.status || null;
    payment_intent_id = obj.payment_intent || null;
    stripe_charge_id = obj.latest_charge || (obj.object === 'charge' ? obj.id : null);
  }

  return {
    stripe_event_id: event.id,
    stripe_charge_id,
    payment_intent_id,
    event_type: type,
    amount_cents,
    currency: obj.currency || null,
    status,
    livemode: Boolean(event.livemode),
    event_ts: safeEventTs(event.created),
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
    return res.status(500).json({ error: 'Webhook not configured' }); // retryable
  }
  if (!sig || rawBody === null) {
    logWebhookFailure('signature', sig ? 'raw body unavailable' : 'missing Stripe-Signature header');
    return res.status(400).json({ error: 'Bad request: missing signature or raw body' });
  }

  // 1) Verify signature in ALL environments (NO dev bypass; NO dependency on the
  //    API-key guard). constructEvent enforces timestamp tolerance (replay window).
  let event;
  try {
    const verifier = await getWebhookVerifier();
    event = verifier.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    logWebhookFailure('signature', err?.message || String(err));
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // 2) livemode-mismatch protection (SEC-003): a REAL (live) event arriving while
  //    the rail is not in live mode is a config error — 500 (retryable, NEVER
  //    dropped) + loud marker, rather than silently capturing or losing it.
  const liveModeEnabled = process.env.STRIPE_RAIL_LIVE_MODE === 'true';
  if (event.livemode && !liveModeEnabled) {
    logWebhookFailure('livemode_mismatch', `live event ${event.id} received while STRIPE_RAIL_LIVE_MODE not enabled`);
    return res.status(500).json({ error: 'Live event received in test mode (config mismatch)' });
  }

  // 3) Idempotent capture. On conflict (re-delivery) ignore -> no-op. .select()
  //    makes the outcome observable (insert vs duplicate); a real write error
  //    throws -> 500 (atomic single upsert => no partial/orphan row).
  try {
    const row = mapEventToRow(event);
    const { data, error } = await db()
      .from('ops_payment_events')
      .upsert(row, { onConflict: 'stripe_event_id', ignoreDuplicates: true })
      .select('id');
    if (error) throw error;
    const inserted = Array.isArray(data) && data.length > 0;
    if (!inserted) console.log(`[stripe-webhook][idempotent] ${event.id} already captured (no-op)`);
  } catch (err) {
    logWebhookFailure('capture', err?.message || String(err));
    return res.status(500).json({ error: 'Capture failed' });
  }

  return res.status(200).json({ received: true, id: event.id });
}

export default handleStripeWebhook;
