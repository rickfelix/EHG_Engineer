/**
 * Variant outcome derivation (successes/failures) from daily_rollups-shaped rows.
 * SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C (FR-2)
 *
 * daily_rollups has no successes/failures columns natively -- it has
 * impressions/engagements/clicks/conversions/spend_cents. This is the ONE shared place that
 * derivation happens, so lib/creative/variant-scoring-bridge.js (this SD) and sibling -D's
 * ehg-app UI (VideoVariantTesting.tsx/PerformanceDashboard.tsx, a second independent
 * consumer) cannot silently disagree on "which variant won". Pure function, zero DB I/O, so
 * it stays trivially unit-testable and portable across repos.
 *
 * FR-6: daily_rollups genuinely has NO WRITER anywhere in the codebase (read-only consumers:
 * venture-activation-gate.js, cpa-gauge-cli.mjs) -- this is the table this function reads.
 * marketing_attribution DOES have a live writer (lib/marketing/publisher/index.js), but that
 * writer only inserts event_type='dispatch' provenance rows (UTM/platform/campaign at publish
 * time), never a conversion/success outcome -- so it supplies no usable signal here either,
 * for a DIFFERENT reason than daily_rollups. Do not collapse these into one "neither table is
 * written to" claim; they are two distinct diagnoses.
 */

/**
 * @param {Array<{variant_id: string, impressions?: number, conversions?: number}>} dailyRollupsRows
 * @returns {Array<{id: string, successes: number, failures: number}>}
 */
export function deriveVariantOutcomes(dailyRollupsRows) {
  const rows = Array.isArray(dailyRollupsRows) ? dailyRollupsRows : [];
  const totals = new Map();

  for (const row of rows) {
    const variantId = row?.variant_id;
    if (!variantId) continue;

    const impressions = Number.isFinite(row.impressions) ? row.impressions : 0;
    const conversions = Number.isFinite(row.conversions) ? row.conversions : 0;

    const entry = totals.get(variantId) || { impressions: 0, conversions: 0 };
    entry.impressions += impressions;
    entry.conversions += conversions;
    totals.set(variantId, entry);
  }

  return Array.from(totals.entries()).map(([id, { impressions, conversions }]) => ({
    id,
    successes: conversions,
    failures: Math.max(0, impressions - conversions),
  }));
}
