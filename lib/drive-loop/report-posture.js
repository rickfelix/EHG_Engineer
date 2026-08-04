/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — FR-7: fail-loud, propose-only, self-staleness.
 *
 * Three postures the report must hold. Two are code; one is negative space and lives in the test.
 *
 * ── FAIL-LOUD: unavailable IS NOT ZERO ────────────────────────────────────────────────────
 * House style copied rather than invented — computeBuildGauge (lib/vision/vdr-registry.js:380) is
 * fail-soft on every branch and returns available:false with a measured_at_note instead of a false
 * 0%. The distinction is the whole point: a 0 that means "measured, and it is zero" and a 0 that
 * means "could not measure" are the same number on a dashboard, and the second one silently reads
 * as the first. A drive score of 0/8 because the belt is starved and a 0/8 because the query threw
 * demand opposite responses.
 *
 * ── SELF-STALENESS: NO NEW MECHANISM ──────────────────────────────────────────────────────
 * periodic_process_registry plus periodic-liveness-watcher.mjs:55 already compute a breach as
 * expected_interval_seconds * grace_multiplier, and the watcher self-registers, so that path is
 * exercised rather than hypothetical. "Past 2x cadence" is therefore grace_multiplier: 2 on the
 * existing primitive — not a second staleness rule that could disagree with the first.
 *
 * ── PROPOSE-ONLY: TESTABLE AS NEGATIVE SPACE ──────────────────────────────────────────────
 * The report proposes; it never acts. There is no function here for that, because the property is
 * an ABSENCE — no write path reaches a claim, a dispatch or an SD insert. Asserting an absence in
 * the code it governs is impossible; the test walks the modules and proves no such path exists.
 * See tests/unit/drive-loop/report-posture.test.js.
 */

export const DEFAULT_GRACE_MULTIPLIER = 2;

/**
 * The fail-loud shape. NEVER returns a number — a caller that wants one must handle `available`
 * first, which is exactly the branch a false 0 lets them skip.
 *
 * @param {string} reason why the measurement could not be taken, in the reader's terms
 * @param {string} [measuredAt] ISO stamp of the attempt, so "when did we last know?" is answerable
 */
export function unavailable(reason, measuredAt = null) {
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    // An unavailable with no reason is the same shrug as a null with no null_means: it tells a
    // reader something failed and nothing about what, which is not fail-loud, it is fail-quiet.
    throw new Error('unavailable(): a reason is required — "unavailable" without a reason is a shrug');
  }
  return Object.freeze({
    available: false,
    value: null,
    reason: reason.trim(),
    measured_at_note: measuredAt
      ? `last attempted ${measuredAt}`
      : 'no successful measurement recorded in this run',
  });
}

/** True iff this reading is a real measurement. Use before touching `.value`. */
export function isAvailable(reading) {
  return !!reading && reading.available === true;
}

/**
 * Is the report itself overdue, per the SAME primitive the fleet already uses?
 *
 * @param {object} o
 * @param {{expected_interval_seconds:number, last_run_at?:string}} o.registryRow from periodic_process_registry
 * @param {number} o.nowMs
 * @param {number} [o.graceMultiplier] 2 = "past 2x cadence"
 * @returns {{stale:boolean, ageSec:number|null, breachSec:number|null, reason:string}}
 */
export function isSelfStale({ registryRow, nowMs, graceMultiplier = DEFAULT_GRACE_MULTIPLIER } = {}) {
  if (!Number.isFinite(nowMs)) {
    throw new Error('isSelfStale(): nowMs must be provided — an implicit clock cannot be tested at its boundary');
  }
  const interval = registryRow?.expected_interval_seconds;
  if (!Number.isFinite(interval) || interval <= 0) {
    // Unknown cadence is NOT "fresh". A report that cannot say how often it should run cannot claim
    // to be on time, and defaulting to fresh is how a dead scheduler reads as healthy.
    return { stale: true, ageSec: null, breachSec: null, reason: 'no expected_interval_seconds on the registry row — cadence unknown, which is not the same as on-time' };
  }
  const t = Date.parse(registryRow?.last_run_at);
  if (!Number.isFinite(t)) {
    return { stale: true, ageSec: null, breachSec: interval * graceMultiplier, reason: 'no parseable last_run_at — never run, or the stamp is malformed' };
  }
  const ageSec = (nowMs - t) / 1000;
  const breachSec = interval * graceMultiplier;
  return {
    stale: ageSec > breachSec,
    ageSec,
    breachSec,
    reason: ageSec > breachSec
      ? `last run ${Math.round(ageSec)}s ago, past ${graceMultiplier}x cadence (${breachSec}s)`
      : `last run ${Math.round(ageSec)}s ago, within ${graceMultiplier}x cadence (${breachSec}s)`,
  };
}
