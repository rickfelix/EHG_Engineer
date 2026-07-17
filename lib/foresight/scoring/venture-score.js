/**
 * Section 13 Venture Scoring Model (docs/design/ehg-venture-foresight-board-spec.md).
 * Pure, standalone -- no database dependency. Namespaced separately from
 * lib/*plane1-scoring* / blueprint-scoring / stage-capability-weights.js (VALIDATION
 * sub-agent advisory, PRD implementation_approach.namespacing) to avoid conflation
 * with those unrelated scorers.
 *
 * Confidence scale is pinned to 0-1 (never 0-100) -- the spec's own worked example
 * (raw 82, confidence 55% -> confidence-adjusted 45) leaves the scale and rounding
 * rule unpinned; this module IS the pin (PRD technical_requirements): confidence input
 * is 0-1, confidence_adjusted_score = round(raw_score * confidence).
 */

export const CRITERIA_WEIGHTS = {
  customer_pain: 20,
  ehg_agentic_advantage: 20,
  distribution_accessibility: 15,
  technical_timing: 15,
  revenue_potential: 10,
  defensibility: 10,
  cross_venture_reuse: 5,
  future_option_value: 5,
};

export const PASS_FAIL_GATES = [
  'legal_viability',
  'ethical_acceptability',
  'financial_survivability',
  'security_viability',
  'data_access_legitimacy',
];

/**
 * Sum the 8 weighted criteria into a raw attractiveness score (0-100, spec 13).
 * Each criterionScores[key] is clamped to [0, CRITERIA_WEIGHTS[key]]; a missing or
 * non-finite value contributes 0 rather than throwing, since a partial specialist
 * assessment is a normal input shape, not an error condition.
 */
export function computeWeightedScore(criterionScores = {}) {
  let total = 0;
  for (const [key, weight] of Object.entries(CRITERIA_WEIGHTS)) {
    const raw = criterionScores[key];
    const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
    total += Math.max(0, Math.min(weight, value));
  }
  return total;
}

/**
 * Evaluate the 5 pass/fail gates (spec 13.1). A single failure overrides any weighted
 * score: "A high weighted score should not override failure in one of these areas."
 * A gate is treated as passed unless explicitly `false` -- an omitted gate is not
 * evidence of failure, only an unevaluated one.
 */
export function checkPassFailGates(gateResults = {}) {
  const failedGates = PASS_FAIL_GATES.filter((gate) => gateResults[gate] === false);
  return {
    passed: failedGates.length === 0,
    failed_gates: failedGates,
  };
}

/**
 * Confidence-adjusted score (spec 13.2). `confidence` is 0-1, NOT 0-100, and is
 * clamped to that range -- an out-of-range input (e.g. a caller accidentally passing
 * a 0-100 value) must not silently inflate or negate a score feeding a chairman
 * decision (security-agent EXEC-TO-PLAN review finding).
 * confidence_adjusted_score = round(raw_score * confidence).
 */
export function computeConfidenceAdjustedScore(rawScore, confidence) {
  const c = typeof confidence === 'number' && Number.isFinite(confidence)
    ? Math.max(0, Math.min(1, confidence))
    : 0;
  return Math.round(rawScore * c);
}

/**
 * Full section 13.2 output shape: raw_score, evidence_confidence,
 * confidence_adjusted_score, and gate_results -- never a bare number. A failed gate
 * forces overall_recommendation to 'fail' regardless of confidence_adjusted_score.
 *
 * @param {Object} params
 * @param {Object} [params.criterionScores] - per-criterion scores, see CRITERIA_WEIGHTS
 * @param {Object} [params.gateResults] - per-gate booleans, see PASS_FAIL_GATES
 * @param {number} [params.confidence] - evidence confidence, 0-1
 */
export function scoreVenture({ criterionScores = {}, gateResults = {}, confidence = 0 } = {}) {
  const rawScore = computeWeightedScore(criterionScores);
  const gates = checkPassFailGates(gateResults);
  const confidenceAdjustedScore = computeConfidenceAdjustedScore(rawScore, confidence);

  return {
    raw_score: rawScore,
    evidence_confidence: confidence,
    confidence_adjusted_score: confidenceAdjustedScore,
    gate_results: gates,
    overall_recommendation: gates.passed ? 'pass' : 'fail',
  };
}

export default { CRITERIA_WEIGHTS, PASS_FAIL_GATES, computeWeightedScore, checkPassFailGates, computeConfidenceAdjustedScore, scoreVenture };
