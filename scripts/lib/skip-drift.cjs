'use strict';

/**
 * Bounded skip-count drift detector for the no-DB unit delta gates.
 * SD-FDBK-INFRA-VITEST-PROJECT-SPLIT-001 FR-5 (QF-20260523-727).
 *
 * The vitest db/no-db split made the no-DB `unit` baseline a DELTA model:
 * compare-test-baseline.cjs (local session hook) and compare-to-main-snapshot.mjs
 * (CI ratchet) flag only NEW *failures* vs a recorded baseline. Neither watched
 * the SKIPPED count — so a run where every DB-guarded suite silently skips (e.g.
 * the DB credentials fail to inject and describeDb self-skips the whole suite)
 * shows failed=0 and passes as a false "green". This detector flags that
 * vacuous-green: it reports SKIP_DRIFT when the current skipped count falls
 * outside ±tolerance of the recorded baseline skipped count.
 *
 * Delta-model semantics: the recorded baseline IS the expected skip count
 * (green = stable vs the recorded baseline, NOT zero skips). Cold start (no
 * baseline skip count recorded yet) returns status 'NEW' so the caller passes
 * the gate and records `currentSkipped` going forward — identical to how the
 * failed-count ratchet treats a missing prior snapshot.
 *
 * The band uses an absolute floor (default 10) in addition to the percentage so
 * a small baseline (e.g. CI runs WITH a DB, where only a handful of .skip/.todo
 * tests are pending) does not trip on benign ±1 churn — only a genuine cliff
 * (hundreds of suites suddenly self-skipping) breaks the floor.
 */

const DEFAULT_TOLERANCE = 0.10; // ±10%
const DEFAULT_ABS_FLOOR = 10; // never flag drift smaller than ±10 tests

function toCount(v) {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * @param {object} params
 * @param {number|null|undefined} params.baselineSkipped recorded baseline skip count (null/undefined => cold start)
 * @param {number} params.currentSkipped current run skip count
 * @param {number} [params.tolerance=0.10] fractional band (0.10 = ±10%)
 * @param {number} [params.absFloor=10] minimum absolute band half-width
 * @returns {{status:'OK'|'NEW'|'SKIP_DRIFT', baselineSkipped:number|null, currentSkipped:number, drift:number, lowerBound:number|null, upperBound:number|null, tolerance:number, absFloor:number}}
 */
function skipDriftStatus({ baselineSkipped, currentSkipped, tolerance = DEFAULT_TOLERANCE, absFloor = DEFAULT_ABS_FLOOR } = {}) {
  const cur = toCount(currentSkipped);
  const tol = Number.isFinite(Number(tolerance)) && Number(tolerance) >= 0 ? Number(tolerance) : DEFAULT_TOLERANCE;
  const floor = Number.isFinite(Number(absFloor)) && Number(absFloor) >= 0 ? Number(absFloor) : DEFAULT_ABS_FLOOR;

  // Cold start: no baseline recorded yet — pass and let the caller record `cur`.
  if (baselineSkipped === null || baselineSkipped === undefined || !Number.isFinite(Number(baselineSkipped))) {
    return { status: 'NEW', baselineSkipped: null, currentSkipped: cur, drift: 0, lowerBound: null, upperBound: null, tolerance: tol, absFloor: floor };
  }

  const base = toCount(baselineSkipped);
  const margin = Math.max(base * tol, floor);
  const lowerBound = Math.max(0, base - margin);
  const upperBound = base + margin;
  const drift = cur - base;
  const status = cur < lowerBound || cur > upperBound ? 'SKIP_DRIFT' : 'OK';

  return { status, baselineSkipped: base, currentSkipped: cur, drift, lowerBound, upperBound, tolerance: tol, absFloor: floor };
}

module.exports = { skipDriftStatus, DEFAULT_TOLERANCE, DEFAULT_ABS_FLOOR };
