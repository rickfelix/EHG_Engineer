/**
 * Verify-score contract validator — the tri-party self-improvement loop's "verify it stuck" step.
 * SD-LEO-INFRA-ENABLE-WIRE-AUTOMATIC-001 (FR-3, the named core fix).
 *
 * Pure + dependency-injected (NO DB I/O — the caller fetches the rows). Enforces the contract
 * canonicalized in leo_protocol_sections id=601 / .claude/commands/coordinator.md:
 *   1. A self-score with a below-threshold dimension but ZERO committed_actions is INVALID
 *      (the dormant-review / vanity-measurement failure mode).
 *   2. A self-score that does NOT verify the prior cycle's committed_actions (prior_action_outcomes
 *      empty when the prior cycle committed actions) is INVALID — this is the missing VERIFY step.
 *   3. A dimension that stays below-threshold for N consecutive cycles despite committed actions
 *      ESCALATES to the operator.
 * Missing/unparseable metrics yield INCONCLUSIVE (never INVALID) so a data outage can't fabricate
 * a failure or cascade an infinite invalid loop.
 *
 * Score-row shape (the `description` JSON of a feedback row, category=coordinator_review /
 * adam_self_assessment):
 *   { overall, session, dimensions: { name: number, ... },
 *     below_threshold?: string[], committed_actions: object[], prior_action_outcomes?: object[] }
 *
 * @module lib/fleet/verify-score-contract
 */

/** Default: a dimension scoring at/below this is "below-threshold" (matches the contract's ≤2). */
export const DEFAULT_BELOW_THRESHOLD_AT = 2;

/** Default: escalate after this many consecutive below-threshold cycles despite committed actions. */
export const DEFAULT_ESCALATE_AFTER_N = 3;

/**
 * Parse a feedback row into a score object. Accepts a row ({description}), a JSON string, or an
 * already-parsed object. Returns null when it is not a score row (no numeric `dimensions` map) —
 * so callers can filter capture rows (raw signal text) from actual self-score rows.
 *
 * @param {Object|string} rowOrDescription
 * @returns {Object|null}
 */
export function parseScore(rowOrDescription) {
  if (!rowOrDescription) return null;
  let obj = rowOrDescription;
  if (typeof obj === 'object' && 'description' in obj && !('dimensions' in obj)) obj = obj.description;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch { return null; }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  if (!obj.dimensions || typeof obj.dimensions !== 'object' || Array.isArray(obj.dimensions)) return null;
  return obj;
}

/**
 * Partition a dimensions map into below-threshold vs inconclusive (non-numeric) names.
 *
 * @param {Object} dimensions - { name: number, ... }
 * @param {number} belowThresholdAt
 * @returns {{ below: string[], inconclusive: string[] }}
 */
export function classifyDimensions(dimensions, belowThresholdAt = DEFAULT_BELOW_THRESHOLD_AT) {
  const below = [];
  const inconclusive = [];
  for (const [name, score] of Object.entries(dimensions || {})) {
    if (typeof score !== 'number' || Number.isNaN(score)) { inconclusive.push(name); continue; }
    if (score <= belowThresholdAt) below.push(name);
  }
  return { below, inconclusive };
}

const isNonEmptyArray = (v) => Array.isArray(v) && v.length > 0;

/**
 * Validate a proposed self-score against the verify-step contract.
 *
 * @param {Object} args
 * @param {Object|string} args.current - the proposed/latest score row or its description
 * @param {Object|string|null} [args.prior] - the previous cycle's score row (null if first cycle)
 * @param {number} [args.priorStreak=0] - consecutive below-threshold cycles carried from before
 * @param {number} [args.belowThresholdAt]
 * @param {number} [args.escalateAfterN]
 * @returns {{ valid: boolean|null, inconclusive: boolean, violations: string[],
 *   belowThreshold: string[], inconclusiveDims: string[],
 *   escalation: { triggered: boolean, streak: number, dimensions: string[] } }}
 *   valid=null means INCONCLUSIVE (could not parse the current score).
 */
export function validateScoreContract({
  current,
  prior = null,
  priorStreak = 0,
  belowThresholdAt = DEFAULT_BELOW_THRESHOLD_AT,
  escalateAfterN = DEFAULT_ESCALATE_AFTER_N,
} = {}) {
  const cur = parseScore(current);
  if (!cur) {
    return {
      valid: null, inconclusive: true,
      violations: ['INCONCLUSIVE: current score row has no parseable numeric dimensions'],
      belowThreshold: [], inconclusiveDims: [],
      escalation: { triggered: false, streak: priorStreak, dimensions: [] },
    };
  }

  const { below, inconclusive } = classifyDimensions(cur.dimensions, belowThresholdAt);
  const violations = [];

  // Rule 1: below-threshold dimension(s) with zero committed_actions => INVALID.
  if (below.length > 0 && !isNonEmptyArray(cur.committed_actions)) {
    violations.push(
      `INVALID: below-threshold dimension(s) [${below.join(', ')}] with no committed_actions ` +
      `(a self-score that names a gap but commits no action is a vanity measurement)`);
  }

  // Rule 2: skipped the verify step => INVALID. The prior cycle committed actions but this score
  // did not record their outcomes (did each land? did the dimension move?).
  const priorScore = parseScore(prior);
  if (priorScore && isNonEmptyArray(priorScore.committed_actions) && !isNonEmptyArray(cur.prior_action_outcomes)) {
    violations.push(
      `INVALID: did not verify the prior cycle's ${priorScore.committed_actions.length} committed_actions ` +
      `(prior_action_outcomes is empty) — grade→commit→act→VERIFY, the verify step was skipped`);
  }

  // Rule 3: escalation — consecutive below-threshold cycles despite committed actions.
  const streak = below.length > 0 ? (priorStreak + 1) : 0;
  const escalationTriggered = streak >= escalateAfterN;
  if (escalationTriggered) {
    violations.push(
      `ESCALATE: ${streak} consecutive below-threshold cycle(s) (≥ ${escalateAfterN}) despite committed actions ` +
      `— dimension(s) [${below.join(', ')}] are not moving; surface to the operator`);
  }

  return {
    valid: violations.length === 0,
    inconclusive: false,
    violations,
    belowThreshold: below,
    inconclusiveDims: inconclusive,
    escalation: { triggered: escalationTriggered, streak, dimensions: escalationTriggered ? below : [] },
  };
}
