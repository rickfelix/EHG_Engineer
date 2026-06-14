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
dotenv.config();

function getSupabase() {
  return createSupabaseServiceClient();
}

/** First-of-month YYYY-MM-01 (UTC) for an event timestamp — the income_capture_monthly period key. */
export function firstOfMonth(ts) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * Aggregate succeeded ops_payment_events charges into structured monthly inputs in income_capture_monthly.
 *
 * @param {object} [opts]
 * @param {object}  [opts.supabase]        service-role client (lazily created if omitted)
 * @param {boolean} [opts.livemode=true]   aggregate LIVE (true) or TEST-mode (false) charges separately
 * @returns {Promise<Array|null>} the upserted income_capture_monthly rows, or null on error
 */
export async function aggregateIncomeCapture({ supabase, livemode = true } = {}) {
  const sb = supabase || getSupabase();

  const { data: charges, error } = await sb
    .from('ops_payment_events')
    .select('amount_cents, event_ts, livemode, status')
    .eq('status', 'succeeded')
    .eq('livemode', livemode);
  if (error) {
    console.error(`aggregateIncomeCapture read failed: ${error.message}`);
    return null;
  }

  // Group charges by first-of-month (cents summed; net is computed downstream, never stored).
  const byMonth = new Map();
  for (const c of charges || []) {
    if (c.amount_cents == null || c.event_ts == null) continue;
    const period = firstOfMonth(c.event_ts);
    const agg = byMonth.get(period) || { cents: 0, count: 0 };
    agg.cents += Number(c.amount_cents);
    agg.count += 1;
    byMonth.set(period, agg);
  }

  const rows = [];
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
    rows.push(data);
  }
  return rows;
}
