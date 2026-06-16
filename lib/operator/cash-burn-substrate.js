/**
 * lib/operator/cash-burn-substrate.js
 *
 * Honest operator cash/burn substrate (SD-EHG-OPERATOR-RUNWAY-SUBSTRATE-001).
 *
 * CORE CONTRACT — never fabricate a financial number:
 *   - A missing input is NULL (unattested), never 0 (mirrors lib/income/replacement-net-source.js).
 *   - Each input carries its own last_synced_at; an input older than its liveness window is
 *     SUPPRESSED to 'stale / not yet measurable' rather than presented as live
 *     (mirrors scripts/continuity/cloud-cap-feeder.mjs liveness-window suppression).
 *   - The months-of-runway headline renders ONLY when BOTH cash and net-burn are fresh;
 *     otherwise the accessor returns the partials it honestly has + an 'awaiting …' headline.
 *
 * The freshness + compute logic is PURE (row + now + windows in, verdict out) so it is unit-testable
 * without a DB. Read/write helpers take a Supabase service client.
 */

import { createSupabaseServiceClient } from '../supabase-client.js';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Per-input liveness windows (ms). An input refreshed more than this long ago is stale.
 * AI-burn + revenue are fed hourly (generous 3h window absorbs GitHub cron drops).
 * Cash is fed by a separate, lower-cadence sibling SD (36h window). Other-burn is optional.
 */
export const LIVENESS_WINDOWS_MS = Object.freeze({
  cash: 36 * HOUR_MS,
  ai_burn: 3 * HOUR_MS,
  other_burn: 36 * HOUR_MS,
  revenue: 3 * HOUR_MS,
});

export const AI_BURN_LOWER_BOUND_LABEL = 'estimated fleet AI burn, last 30d (lower bound)';

/** First-of-month date string (YYYY-MM-01) for a given Date (defaults to the caller-supplied now). */
export function periodMonthOf(now) {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

/**
 * Freshness of a single timestamp against a window.
 * @returns {{ status: 'unattested'|'stale'|'live', ageMs: number|null }}
 */
export function freshness(lastSyncedAt, windowMs, nowMs) {
  if (lastSyncedAt == null) return { status: 'unattested', ageMs: null };
  const t = Date.parse(lastSyncedAt);
  if (!Number.isFinite(t)) return { status: 'unattested', ageMs: null };
  const ageMs = nowMs - t;
  if (ageMs > windowMs) return { status: 'stale', ageMs };
  return { status: 'live', ageMs };
}

/**
 * Build the honest partial for one input. A value is only surfaced when status === 'live';
 * a stale value is withheld (suppressed) so an old number is never shown as current.
 */
function inputPartial(valueUsd, lastSyncedAt, windowMs, nowMs, extra = {}) {
  const f = freshness(lastSyncedAt, windowMs, nowMs);
  const base = {
    last_synced_at: lastSyncedAt ?? null,
    age_ms: f.ageMs,
    status: f.status,
    ...extra,
  };
  if (f.status === 'live') {
    return { ...base, value_usd: valueUsd == null ? null : Number(valueUsd), label: null };
  }
  if (f.status === 'stale') {
    // Suppress the stale value — do NOT present it as live.
    return { ...base, value_usd: null, label: 'stale / not yet measurable' };
  }
  return { ...base, value_usd: null, label: 'not yet measured' };
}

/**
 * FR-6 accessor — compute the honest distance-to-broke verdict from a substrate row.
 * PURE: no DB. months_of_runway is non-null ONLY when cash is live AND net-burn is live.
 *
 * net_burn = ai_burn + other_burn - revenue (revenue/other_burn absent => treated as 0 in the
 * net, which is the CONSERVATIVE direction: it never understates burn). net-burn is "live" iff
 * ai_burn (the dominant, always-required term) is live.
 *
 * @param {object} row - operator_cash_burn_monthly row (or null)
 * @param {object} [opts] - { nowMs, windows }
 */
export function computeRunway(row, opts = {}) {
  const nowMs = opts.nowMs ?? Date.now();
  const w = { ...LIVENESS_WINDOWS_MS, ...(opts.windows || {}) };

  if (!row) {
    return {
      months_of_runway: null,
      headline: 'awaiting cash source',
      partials: {
        cash: { value_usd: null, status: 'unattested', label: 'not yet measured', last_synced_at: null, age_ms: null },
        ai_burn: { value_usd: null, status: 'unattested', label: 'not yet measured', last_synced_at: null, age_ms: null, is_lower_bound: true },
        other_burn: { value_usd: null, status: 'unattested', label: 'not yet measured', last_synced_at: null, age_ms: null },
        revenue: { value_usd: null, status: 'unattested', label: 'not yet measured', last_synced_at: null, age_ms: null },
        net_burn: { value_usd: null, status: 'unattested', label: 'not yet measured' },
      },
    };
  }

  const cash = inputPartial(row.cash_usd, row.cash_last_synced_at, w.cash, nowMs);
  const aiBurn = inputPartial(row.ai_burn_usd, row.ai_burn_last_synced_at, w.ai_burn, nowMs, {
    is_lower_bound: row.ai_burn_is_lower_bound !== false,
    lower_bound_label: AI_BURN_LOWER_BOUND_LABEL,
  });
  const otherBurn = inputPartial(row.other_burn_usd, row.other_burn_last_synced_at, w.other_burn, nowMs);
  const revenue = inputPartial(row.revenue_usd, row.revenue_last_synced_at, w.revenue, nowMs, {
    livemode: row.revenue_livemode === true,
    test_mode: row.revenue_livemode === false,
  });

  // net-burn is live iff ai_burn is live (dominant required term). Absent other_burn/revenue
  // contribute 0 (conservative: never understates burn).
  let netBurn;
  if (aiBurn.status === 'live') {
    const ai = aiBurn.value_usd ?? 0;
    const other = otherBurn.status === 'live' ? (otherBurn.value_usd ?? 0) : 0;
    const rev = revenue.status === 'live' ? (revenue.value_usd ?? 0) : 0;
    netBurn = { value_usd: Number((ai + other - rev).toFixed(2)), status: 'live', label: null };
  } else {
    netBurn = { value_usd: null, status: aiBurn.status, label: aiBurn.label };
  }

  let months_of_runway = null;
  let headline;
  if (cash.status !== 'live') {
    headline = 'awaiting cash source';
  } else if (netBurn.status !== 'live') {
    headline = 'awaiting burn data';
  } else if (netBurn.value_usd <= 0) {
    // Net positive (revenue >= burn) — not burning down; runway is not "broke"-bounded.
    months_of_runway = null;
    headline = 'net cash-positive (no burn-down)';
  } else {
    months_of_runway = Number((cash.value_usd / netBurn.value_usd).toFixed(1));
    headline = `${months_of_runway} months of runway`;
  }

  return { months_of_runway, headline, partials: { cash, ai_burn: aiBurn, other_burn: otherBurn, revenue, net_burn: netBurn } };
}

/** Read the substrate row for a period (defaults to current month). */
export async function readSubstrateRow(periodMonth, supabase = createSupabaseServiceClient()) {
  const pm = periodMonth || periodMonthOf(Date.now());
  const { data, error } = await supabase
    .from('operator_cash_burn_monthly')
    .select('*')
    .eq('period_month', pm)
    .maybeSingle();
  if (error) throw new Error(`operator_cash_burn_monthly read failed: ${error.message}`);
  return data || null;
}

/**
 * Honest distance-to-broke read for the cockpit tile (FR-6). Returns the computeRunway verdict
 * for the period (current month by default).
 */
export async function getDistanceToBroke(periodMonth, supabase = createSupabaseServiceClient(), opts = {}) {
  const row = await readSubstrateRow(periodMonth, supabase);
  return computeRunway(row, opts);
}

/**
 * Upsert one or more inputs for a period, stamping the matching *_last_synced_at. Only writes the
 * fields provided (never zeroes an input it isn't feeding). nowIso is the sync stamp.
 *
 * @param {object} fields - subset of { cash_usd, ai_burn_usd, ai_burn_is_lower_bound,
 *                                       other_burn_usd, revenue_usd, revenue_livemode }
 */
export async function upsertSubstrateInputs(periodMonth, fields, supabase = createSupabaseServiceClient(), nowIso = new Date().toISOString()) {
  const pm = periodMonth || periodMonthOf(Date.now());
  const row = { period_month: pm, updated_at: nowIso };
  if ('cash_usd' in fields) { row.cash_usd = fields.cash_usd; row.cash_last_synced_at = nowIso; }
  if ('ai_burn_usd' in fields) {
    row.ai_burn_usd = fields.ai_burn_usd;
    row.ai_burn_last_synced_at = nowIso;
    row.ai_burn_is_lower_bound = fields.ai_burn_is_lower_bound !== false;
  }
  if ('other_burn_usd' in fields) { row.other_burn_usd = fields.other_burn_usd; row.other_burn_last_synced_at = nowIso; }
  if ('revenue_usd' in fields) {
    row.revenue_usd = fields.revenue_usd;
    row.revenue_last_synced_at = nowIso;
    if ('revenue_livemode' in fields) row.revenue_livemode = fields.revenue_livemode;
  }
  const { data, error } = await supabase
    .from('operator_cash_burn_monthly')
    .upsert(row, { onConflict: 'period_month' })
    .select()
    .single();
  if (error) throw new Error(`operator_cash_burn_monthly upsert failed: ${error.message}`);
  return data;
}
