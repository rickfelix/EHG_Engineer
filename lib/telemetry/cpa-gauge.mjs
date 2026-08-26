/**
 * CPA (cost-per-acquisition) gauge — SD-LEO-GEN-NEED-ABLE-CONTINUALLY-001 FR-1.
 *
 * Honest, never-fabricated cost-effectiveness measurement, following the same
 * three-state contract as lib/telemetry/funnel-gauge.mjs's computeGaugeState():
 * a number is only ever reported when it was genuinely computed from real rows.
 *
 * Deliberately does NOT report a 'stale' state: unlike venture_telemetry (which
 * has a declared writer + expected pull cadence, DEFAULT_CADENCE_HOURS), no
 * ratified cadence contract exists for daily_rollups. Inventing a staleness
 * heuristic without one would itself be a fabrication — the same failure mode
 * this gauge exists to avoid. So this gauge only ever returns 'no_writer_yet'
 * or 'live'; a future SD may add 'stale' once a cadence is ratified.
 *
 * Pure function — no I/O. The caller (lib/marketing/venture-activation-gate.js
 * or scripts/query-cpa-gauge.mjs) is responsible for querying daily_rollups and
 * passing rows in. This mirrors funnel-gauge.mjs's own I/O-free design so both
 * are unit-testable without a live database connection.
 *
 * @module lib/telemetry/cpa-gauge
 */

/**
 * @param {object} opts
 * @param {Array<{spend_cents?: number, conversions?: number}>} opts.dailyRollupRows
 *   daily_rollups rows already scoped by the caller to one venture (and, per
 *   TR-2, summed across ALL platforms — this function does not group by
 *   platform; per-channel breakdown is the caller's responsibility if needed).
 * @returns {{state: 'no_writer_yet'|'live', value_cents_per_conversion: number|null, reason: string}}
 */
export function computeCpaGaugeState({ dailyRollupRows }) {
  if (!Array.isArray(dailyRollupRows) || dailyRollupRows.length === 0) {
    return {
      state: 'no_writer_yet',
      value_cents_per_conversion: null,
      reason: 'no daily_rollups rows exist for this venture in the lookback window',
    };
  }

  const totalSpendCents = dailyRollupRows.reduce((sum, row) => sum + (row.spend_cents || 0), 0);
  const totalConversions = dailyRollupRows.reduce((sum, row) => sum + (row.conversions || 0), 0);

  if (totalConversions === 0) {
    // Spend with zero conversions is a real, distinct signal — never reported as a fabricated 0
    // (which would falsely read as "free acquisitions") or Infinity (a division artifact, not a
    // measurement).
    return {
      state: 'live',
      value_cents_per_conversion: null,
      reason: `spend of ${totalSpendCents} cents recorded across ${dailyRollupRows.length} row(s) but zero conversions in the lookback window -- cost-per-acquisition is unmeasurable, not zero`,
    };
  }

  return {
    state: 'live',
    value_cents_per_conversion: Math.round(totalSpendCents / totalConversions),
    reason: `SUM(spend_cents)=${totalSpendCents} / SUM(conversions)=${totalConversions} across ${dailyRollupRows.length} daily_rollups row(s)`,
  };
}

export default { computeCpaGaugeState };
