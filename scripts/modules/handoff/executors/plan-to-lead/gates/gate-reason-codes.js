/**
 * Structured reason codes for PLAN-TO-LEAD gate failures.
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-132 (FR-5).
 *
 * Free-form failure strings break downstream pattern aggregation in issue_patterns.
 * Each gate failure path emits a code from this enum so the fingerprinter can
 * group recurring failures (e.g. PAT-HF-PLANTOLEAD-679437bd) by structured reason
 * rather than by error-message text drift.
 */

export const GATE_REASON_CODES = Object.freeze({
  SUCCESS_METRICS_EMPTY_ACTUAL: 'SUCCESS_METRICS_EMPTY_ACTUAL',
  SUCCESS_METRICS_PLACEHOLDER_VALUE: 'SUCCESS_METRICS_PLACEHOLDER_VALUE',
  HEAL_BELOW_THRESHOLD: 'HEAL_BELOW_THRESHOLD',
  HEAL_EXHAUSTED: 'HEAL_EXHAUSTED',
});

/**
 * Literal values that are auto-populate placeholders, NOT real measurements.
 * When a metric carries `_auto_populated: true` AND its `actual` matches one of
 * these literals, the gate fails with SUCCESS_METRICS_PLACEHOLDER_VALUE.
 *
 * Hand-edited values matching these literals (no _auto_populated flag) are NOT
 * treated as placeholders — a human asserting "100%" is treated as authoritative.
 */
export const PLACEHOLDER_ACTUAL_VALUES = new Set([
  '100%',
  'TBD',
  'auto_populated',
  '_auto_populated',
]);

/**
 * @param {unknown} actual
 * @returns {boolean} true when the value is literally one of the placeholders
 */
export function isPlaceholderActual(actual) {
  if (actual == null) return false;
  return PLACEHOLDER_ACTUAL_VALUES.has(String(actual).trim());
}

/** Iteration cap for HEAL_BEFORE_COMPLETE re-heal loop. */
export const MAX_HEAL_ITERATIONS = 3;
