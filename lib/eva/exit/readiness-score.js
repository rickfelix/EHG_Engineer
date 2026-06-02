/**
 * EVA Exit Business-Readiness Scoring
 *
 * Extracted from server/routes/eva-exit.js by SD-LEO-REFAC-RECONCILE-EVA-EXIT-001 (FR-3 / M2)
 * when the zero-caller PATCH /readiness/:ventureId route was removed. That route was a dead
 * path (it did an .update()-only on the 0-row, never-inserted venture_exit_readiness table,
 * so it could never match a row), but this scoring + chairman-escalation logic is
 * non-duplicated business IP. It is preserved here as a unit-tested library so it survives
 * the route cut and is independently reusable/testable.
 *
 * The behavior below is a faithful port of the original inline implementation — no semantic
 * change (this SD is a behavior-preserving structural refactor).
 *
 * Originally introduced by SD-LEO-INFRA-EXIT-BUSINESS-READINESS-001.
 */

/** Default readiness threshold (score above which chairman review may latch). */
export const DEFAULT_READINESS_THRESHOLD = 70;

/**
 * Compute business-readiness score from metrics (0-100, integer).
 *
 * Weighted average of whichever ratios are present: ARR (0.4), customer count (0.3),
 * growth rate (0.3). Each ratio is capped at 1.5. Weights are renormalized over only the
 * metrics actually present, so a partial metric set still scores on a 0-100 scale. Returns
 * 0 when no usable ratio exists (no metric with a positive target and a non-null actual).
 *
 * @param {Object} [m]
 * @param {number} [m.target_arr]
 * @param {number} [m.actual_arr]
 * @param {number} [m.target_customer_count]
 * @param {number} [m.actual_customer_count]
 * @param {number} [m.growth_rate_target]
 * @param {number} [m.growth_rate_actual]
 * @returns {number} readiness score, integer 0-100
 */
export function computeReadinessScore({
  target_arr,
  actual_arr,
  target_customer_count,
  actual_customer_count,
  growth_rate_target,
  growth_rate_actual,
} = {}) {
  const ratios = [];
  if (target_arr > 0 && actual_arr != null) ratios.push({ weight: 0.4, value: Math.min(actual_arr / target_arr, 1.5) });
  if (target_customer_count > 0 && actual_customer_count != null) ratios.push({ weight: 0.3, value: Math.min(actual_customer_count / target_customer_count, 1.5) });
  if (growth_rate_target > 0 && growth_rate_actual != null) ratios.push({ weight: 0.3, value: Math.min(growth_rate_actual / growth_rate_target, 1.5) });

  if (ratios.length === 0) return 0;

  const totalWeight = ratios.reduce((s, r) => s + r.weight, 0);
  const weighted = ratios.reduce((s, r) => s + r.value * r.weight, 0) / totalWeight;
  return Math.round(Math.min(100, weighted * 100));
}

/**
 * Decide whether to LATCH the chairman-review flag.
 *
 * Mirrors the original PATCH /readiness escalation rule: latch once when the readiness score
 * is above the threshold for two consecutive periods (the previous score AND the newly
 * computed score) and the flag is not already set. Idempotent — returns false once already
 * triggered — and it never un-sets the flag (callers only ever set it true).
 *
 * A null/undefined previousScore compares false (`undefined > n` === false), matching the
 * original behavior when no prior record existed.
 *
 * @param {Object} [p]
 * @param {number|null|undefined} [p.previousScore] prior readiness_score
 * @param {number} [p.newScore] newly computed readiness_score
 * @param {number} [p.threshold=DEFAULT_READINESS_THRESHOLD]
 * @param {boolean} [p.alreadyTriggered=false] current chairman_review_triggered value
 * @returns {boolean} true => set chairman_review_triggered = true
 */
export function shouldTriggerChairmanReview({
  previousScore,
  newScore,
  threshold = DEFAULT_READINESS_THRESHOLD,
  alreadyTriggered = false,
} = {}) {
  const previousAbove = previousScore > threshold;
  const currentAbove = newScore > threshold;
  return previousAbove && currentAbove && !alreadyTriggered;
}
