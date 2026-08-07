/**
 * Trend-Eyes run-receipt liveness — SD-LEO-INFRA-TREND-EYES-OFF-001 FR-6.
 *
 * A receipt nobody reads cannot raise an alarm, so the receipt is only half the mechanism; this
 * pure predicate is the other half, and it is deliberately EXTERNAL to the sweep. A runner that
 * checks its own liveness reports healthy precisely when it is dead. Copied from the pattern at
 * lib/governance/gauge-runner-liveness.js, whose reader (scripts/coordinator-hourly-review.cjs) is
 * a separately-cron'd process for exactly this reason.
 *
 * WHY THIS MATTERS HERE SPECIFICALLY: Trend-Eyes is quiet by design — most days there is no trend
 * to report. "No candidates" and "the sweep died three weeks ago" produce identical silence on
 * every surface except this one.
 */

/** The sweep runs daily; a day and a half of silence means it missed a run, not that it was quiet. */
export const STALE_RECEIPT_THRESHOLD_MS = 36 * 60 * 60 * 1000; // 36h

/** The codebase_health_snapshots dimension the sweep stamps. Shared with the writer. */
export const TREND_EYES_RECEIPT_DIMENSION = 'trend_eyes_sweep_receipt';

/**
 * Pure: is the sweep's last run-receipt stale beyond the threshold?
 *
 * A NULL receipt is alarm:true, never a pass. Never having run is the worst case of "not observably
 * alive", and it is also the exact state a merged-but-unwired workflow produces — the failure mode
 * this SD was chartered against (scripts/eva/eva-trend-snapshot.mjs and scripts/eva/trend-detector.mjs
 * both shipped COMPLETED and unwired). Returning a pass here would hide it.
 *
 * @param {string|null|undefined} lastReceiptAt ISO timestamp of the last recorded sweep run
 * @param {number} nowMs
 * @param {number} [thresholdMs]
 * @returns {{ alarm: boolean, ageMs: number|null, reason: string }}
 */
export function checkTrendEyesLiveness(lastReceiptAt, nowMs, thresholdMs = STALE_RECEIPT_THRESHOLD_MS) {
  if (!lastReceiptAt) {
    return { alarm: true, ageMs: null, reason: 'no run-receipt has ever been recorded — the sweep has never run, or is not wired' };
  }
  const ageMs = nowMs - new Date(lastReceiptAt).getTime();
  if (!Number.isFinite(ageMs)) {
    return { alarm: true, ageMs: null, reason: `unparseable receipt timestamp ${JSON.stringify(lastReceiptAt)}` };
  }
  if (ageMs > thresholdMs) {
    return { alarm: true, ageMs, reason: `last sweep receipt is ${Math.round(ageMs / 3600000)}h old (threshold ${Math.round(thresholdMs / 3600000)}h)` };
  }
  return { alarm: false, ageMs, reason: `last sweep receipt is ${Math.round(ageMs / 3600000)}h old` };
}
