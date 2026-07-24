/**
 * lib/income/manual-revenue-portfolio-summary.js
 *
 * Collapses SD-EHG-PRODUCT-FIRSTREV-SUBSTRATE-ROLLUP-001-A's per-venture monthly rollup
 * (lib/income/first-revenue-rollup-aggregator.js: rollupMonthly()/fetchAndRollup(), grouped by
 * month/venture_id/entry_type/currency) into a single portfolio-level manual-revenue total for
 * the operator cash/burn substrate (SD-EHG-PRODUCT-FIRSTREV-SUBSTRATE-ROLLUP-001-B).
 *
 * KNOWN LIMITATION (flagged, not fixed by this SD): database/migrations/
 * 20260711120000_upsert_operator_cash_burn_chairman_editable.sql's upsert_operator_cash_burn
 * RPC unconditionally sets revenue_livemode=true whenever the chairman supplies p_revenue_usd
 * directly (lines 60/72) -- including a manual figure. The automated feed path that calls this
 * module (scripts/operator/feed-operator-cash-burn.mjs) never does that -- it only adds
 * manual_revenue_usd additively and leaves revenue_livemode governed entirely by the existing
 * Stripe-attribution logic. The RPC's behavior is a pre-existing condition in a different SD's
 * staged file; correcting it is a recommended (not implemented here) follow-up.
 */

const MONETARY_ENTRY_TYPES = new Set(['first_dollar', 'mrr']);
const SUMMARY_CURRENCY = 'USD';

/**
 * Sum monetary rollup records (first_dollar + mrr, USD only) across all ventures for one month.
 * Pure: does not mutate rollupRecords. signup_count records are excluded (not a currency
 * amount). Non-USD records are excluded (FX conversion is out of scope) rather than converted
 * or silently included. Non-array/null input returns a zeroed summary rather than throwing.
 *
 * @param {Array<{month:string, venture_id:string, entry_type:string, currency:string, total_amount?:number, total_count?:number}>} rollupRecords
 *   Output shape of SD-EHG-PRODUCT-FIRSTREV-SUBSTRATE-ROLLUP-001-A's rollupMonthly()/fetchAndRollup().
 * @param {string} targetMonth - 'YYYY-MM' (UTC), matching -A's month key format.
 * @returns {{ total_usd: number, excluded_non_usd_count: number, matched_record_count: number }}
 */
export function summarizeManualRevenue(rollupRecords, targetMonth) {
  if (!Array.isArray(rollupRecords) || !targetMonth) {
    return { total_usd: 0, excluded_non_usd_count: 0, matched_record_count: 0 };
  }

  let totalUsd = 0;
  let excludedNonUsd = 0;
  let matched = 0;

  for (const record of rollupRecords) {
    if (!record || record.month !== targetMonth) continue;
    if (!MONETARY_ENTRY_TYPES.has(record.entry_type)) continue; // signup_count excluded
    if (record.currency !== SUMMARY_CURRENCY) {
      excludedNonUsd++;
      continue; // FX conversion out of scope -- exclude, never silently mis-sum
    }
    const amount = Number(record.total_amount);
    if (!Number.isFinite(amount)) continue;
    totalUsd += amount;
    matched++;
  }

  if (excludedNonUsd > 0) {
    console.warn(`[manual-revenue-portfolio-summary] excluded ${excludedNonUsd} non-USD record(s) for ${targetMonth} (FX conversion out of scope)`);
  }

  return {
    total_usd: Number(totalUsd.toFixed(2)),
    excluded_non_usd_count: excludedNonUsd,
    matched_record_count: matched,
  };
}

/**
 * Convenience wrapper: dynamically imports SD-...-001-A's fetchAndRollup() and summarizes the
 * result for targetMonth. FAIL-SOFT, matching feed-operator-cash-burn.mjs's house style: if the
 * sibling module is not yet available (not merged to main at call time) or the fetch fails,
 * returns a zeroed total with source_available:false rather than throwing -- the automated feed
 * path must stay loadable and runnable even before SD-...-001-A lands.
 *
 * @param {object} supabase - Supabase service client
 * @param {string} targetMonth - 'YYYY-MM'
 * @returns {Promise<{ total_usd: number, excluded_non_usd_count: number, matched_record_count: number, source_available: boolean }>}
 */
export async function fetchManualRevenueTotal(supabase, targetMonth) {
  try {
    const mod = await import('./first-revenue-rollup-aggregator.js');
    if (typeof mod.fetchAndRollup !== 'function') {
      throw new Error('first-revenue-rollup-aggregator.js loaded but fetchAndRollup is not exported');
    }
    const records = await mod.fetchAndRollup(supabase, {});
    const summary = summarizeManualRevenue(records, targetMonth);
    return { ...summary, source_available: true };
  } catch (e) {
    console.warn(`[manual-revenue-portfolio-summary] SD-...-001-A aggregator unavailable (${e.message}) -- manual revenue left at $0 for ${targetMonth}`);
    return { total_usd: 0, excluded_non_usd_count: 0, matched_record_count: 0, source_available: false };
  }
}
