// SD-LEO-INFRA-REPLACEMENT-NET-CAPTURE-SUBSTRATE-001 — venture-agnostic charge -> structured-net aggregator.
//
// Reads SUCCEEDED charges from ops_payment_events (the payment rail's raw-capture table,
// SD-LEO-INFRA-PAYMENT-RAIL-FOUNDATION-001) and UPSERTS the structured monthly replacement-net inputs into
// income_capture_monthly. Service-role only. Writes ONLY revenue/count/source/livemode — it NEVER writes the
// chairman-gated deduction columns (ppo/retirement_solo_401k/se_tax stay NULL = unattested; those are written
// only by applyDeductionAttestation in replacement-net-source.js from an approved chairman attestation).
// Idempotent per (period_month, livemode): re-aggregating updates revenue without touching the deductions.

import { createSupabaseServiceClient } from '../supabase-client.js';
import dotenv from 'dotenv';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8: aggregates ALL revenue rows across time
// from the growing ops_payment_events table into monthly income — a silent 1000-row cap would
// undercount revenue feeding the replacement-net gauge. Paginate (fail-open: returns null on error).
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';
dotenv.config();

function getSupabase() {
  return createSupabaseServiceClient();
}

/** First-of-month YYYY-MM-01 (UTC) for an event timestamp — the income_capture_monthly period key. */
export function firstOfMonth(ts) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

// The rail (api/webhooks/stripe.js mapEventToRow) records money movement under these statuses:
//   POSITIVE: 'succeeded' (payment_intent.succeeded + charge.succeeded — BOTH fire for one payment) and
//             'paid' (checkout.session payment_status); NEGATIVE: 'refunded'/'partially_refunded' (refunds).
// We must (a) include 'paid' (checkout revenue), (b) count each payment ONCE despite the pi+charge+checkout
// overlap, and (c) net refunds. Recognition keys on payment_intent_id (every positive event carries it;
// refunds carry it too) — so the pi.succeeded/charge.succeeded/checkout rows for one payment dedupe to one.
const REVENUE_STATUSES = ['succeeded', 'paid', 'refunded', 'partially_refunded'];

/**
 * Aggregate ops_payment_events money-movement rows into structured monthly inputs in income_capture_monthly.
 * Revenue is recognized per PAYMENT (deduped by payment_intent_id, falling back to stripe_charge_id) so the
 * payment_intent.succeeded + charge.succeeded + checkout overlap is counted once; refund rows (negative
 * amount_cents) net against revenue in the month they occur.
 *
 * @param {object} [opts]
 * @param {object}  [opts.supabase]        service-role client (lazily created if omitted)
 * @param {boolean} [opts.livemode=true]   aggregate LIVE (true) or TEST-mode (false) charges separately
 * @returns {Promise<Array|null>} the upserted income_capture_monthly rows, or null on error
 */
export async function aggregateIncomeCapture({ supabase, livemode = true } = {}) {
  const sb = supabase || getSupabase();

  let rows;
  try {
    rows = await fetchAllPaginated(() => sb
      .from('ops_payment_events')
      .select('amount_cents, event_ts, status, payment_intent_id, stripe_charge_id, livemode')
      .eq('livemode', livemode)
      .in('status', REVENUE_STATUSES)
      .order('id', { ascending: true })); // id tiebreaker: stable page boundaries (FR-6)
  } catch (error) {
    console.error(`aggregateIncomeCapture read failed: ${error.message}`);
    return null;
  }

  // Recognize revenue per payment; net refunds. Net is computed downstream, never stored.
  const byMonth = new Map();
  const seenPayment = new Set(); // dedupe positive revenue per payment (pi + charge + checkout overlap)
  for (const r of rows || []) {
    if (r.amount_cents == null || r.event_ts == null) continue;
    const period = firstOfMonth(r.event_ts);
    const cents = Number(r.amount_cents);
    const agg = byMonth.get(period) || { cents: 0, count: 0 };
    if (cents >= 0) {
      // Positive revenue: count ONCE per payment (every positive event carries payment_intent_id).
      const key = r.payment_intent_id || r.stripe_charge_id || null;
      if (key) {
        if (seenPayment.has(key)) { byMonth.set(period, agg); continue; }
        seenPayment.add(key);
      }
      agg.cents += cents;
      agg.count += 1;
    } else {
      // Refund: each refund event is a distinct row; net it (no count increment).
      agg.cents += cents;
    }
    byMonth.set(period, agg);
  }

  const upserted = [];
  const nowIso = new Date().toISOString();
  for (const [period_month, agg] of byMonth) {
    // Only revenue-side columns — NEVER ppo/retirement_solo_401k/se_tax/deduction_attestation_ref.
    // On conflict, upsert updates only the columns provided here, so chairman-attested deductions survive.
    const row = {
      period_month,
      recurring_revenue: agg.cents / 100, // bigint cents -> dollars
      revenue_event_count: agg.count,
      revenue_source: 'ops_payment_events_aggregate',
      livemode,
      computed_at: nowIso,
      updated_at: nowIso,
    };
    const { data, error: upErr } = await sb
      .from('income_capture_monthly')
      .upsert(row, { onConflict: 'period_month,livemode' })
      .select()
      .single();
    if (upErr) {
      console.error(`aggregateIncomeCapture upsert failed (${period_month}): ${upErr.message}`);
      return null;
    }
    upserted.push(data);
  }
  return upserted;
}
