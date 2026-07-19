// Shared Brier scoring + calibration helpers.
// SD-LEO-FEAT-FORECAST-LEDGER-001: canonical extraction of the Brier math that was inline in
//   - lib/eva/experiments/baseline-accuracy.js  (analyzeAccuracy: (predProb - actualBinary)**2, round3(mean))
//   - lib/agents/venture-ceo/truth-layer.js      (_computeCalibrationDelta: Math.pow(confidence - actual, 2))
// REUSE, do not reimplement — those consumers import from here (FR-4). Pure functions, no I/O.

/** Clamp a probability to [0,1]. */
export function clamp01(p) {
  const n = Number(p);
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
}

/** Round to 3 decimals — byte-identical to baseline-accuracy.js round3(). */
export function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/**
 * RAW Brier score for a single probabilistic forecast: (clamp01(p) - outcomeBinary)^2.
 * outcome: truthy => 1, falsy => 0. Deliberately UNrounded — callers round the MEAN, not each
 * point (matches baseline-accuracy.js). NOTE the IEEE-754 hazard: brierScore(0.7,true) ===
 * 0.09000000000000002, so compare with round3()/toBeCloseTo, never ===0.09.
 */
export function brierScore(p, outcome) {
  const actual = outcome ? 1 : 0;
  return (clamp01(p) - actual) ** 2;
}

/**
 * Mean Brier over an array of raw per-point scores OR {p, outcome} objects.
 * Empty => 1 (worst), matching baseline-accuracy.js's total===0 convention. Rounded to 3dp.
 */
export function meanBrier(items) {
  if (!Array.isArray(items) || items.length === 0) return 1;
  const sum = items.reduce(
    (s, it) => s + (typeof it === 'number' ? it : brierScore(it.p, it.outcome)),
    0,
  );
  return round3(sum / items.length);
}

/** Human interpretation of a mean Brier — same thresholds as baseline-accuracy.js interpretResults. */
export function interpretBrier(brier) {
  if (brier == null) return 'No resolved forecasts yet.';
  if (brier <= 0.15) return 'Calibration is good (Brier ≤ 0.15).';
  if (brier <= 0.25) return 'Calibration is moderate (Brier ≤ 0.25).';
  return 'Calibration is poor — forecasts may need recalibration.';
}
