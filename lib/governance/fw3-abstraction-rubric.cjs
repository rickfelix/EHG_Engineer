'use strict';

/**
 * FW-3 abstraction/depth detection rubric — the pure eligibility function ("the min_tier_rank
 * analog", docs/design/fw3-effort-distribution-tier-design.md §1.3/§2 P1/§5).
 *
 * Classifies a framing/escalation candidate as instrument-class (concrete, ADDS LEAVES to the
 * SD tree, routes below-flow to Adam-sourcing) or pick-class (abstract, RE-ROOTS/RE-PARTITIONS
 * the tree, routes to chairman-escalation), per the design's collapsed signal set: cross-system
 * recurrence, self-reversal, negative-space, CMV-drift.
 *
 * FAIL-CLOSED (design §5): PICK is the default outcome. INSTRUMENT requires an explicit,
 * provable concreteness signal (candidate.sd_tree_effect === 'add_leaf') AND the absence of
 * any pick-signal — any pick-signal dominates, even alongside an add_leaf claim.
 *
 * SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-F. Modeled on lib/fleet/sd-tier-rank.mjs
 * computeMinTierRank() (multi-signal contribution scoring, conservative-up) and
 * lib/fleet/claim-eligibility.cjs tierAxes() (fail-closed multi-axis predicate). Mirrors the
 * lib/governance/fw3-*.cjs pure-core convention established by sibling Child C
 * (fw3-cmv-rejecter.cjs): no process.env, no process.exit, no I/O in this file.
 */

// Design §1.3 collapsed abstraction axes. Curated, documented, small keyword lists.
// Word-boundary (\b), case-insensitive matching so a keyword never false-positives as a
// substring of a larger word (e.g. 'recurring' must not match inside 'nonrecurring').
const AXIS_KEYWORDS = {
  crossSystemRecurrence: ['recurred', 'recurring', 'recurrence', 'systemic', 'cross-system', 'cross system', 'same pattern across'],
  selfReversal: ['self-reversal', 'reverse the prior', 'reversal of', 'walk back', 'walked back', 'undo the prior', 'contradicts our earlier', 'contradicts the prior'],
  negativeSpace: ['negative space', 'missing mechanism', 'no mechanism exists', 'never built', 'genuinely absent', 'structural gap'],
  cmvDrift: ['cmv-drift', 'cmv drift', 'drift from the north star', 'drift from cmv', 'off-thesis', 'misaligned with the north star', 'contradicts the vision'],
};

const STRUCTURAL_PICK_VALUES = new Set(['re_root', 're_partition']);
const STRUCTURAL_INSTRUMENT_VALUE = 'add_leaf';

function textOf(candidate) {
  return [candidate && candidate.title, candidate && candidate.description, candidate && candidate.summary]
    .filter((v) => typeof v === 'string' && v.length > 0)
    .join(' ')
    .toLowerCase();
}

/** Word-boundary, case-insensitive scan. Returns the matched phrase or null. */
function matchesAny(text, phrases) {
  if (!text) return null;
  for (const phrase of phrases) {
    const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(text)) return phrase;
  }
  return null;
}

/**
 * Evaluate a boolean-shaped axis. An explicit structured field (true or false) is always
 * authoritative — an escalation-time attestation (design §2 P1 SCORE-AT-ESCALATION) wins over
 * inferred text, even when it says false and the text happens to contain a matching phrase.
 */
function evaluateBooleanAxis(candidate, fieldName, text, keywords) {
  const structured = candidate && candidate[fieldName];
  if (typeof structured === 'boolean') return { fired: structured, via: 'structured' };
  const match = matchesAny(text, keywords);
  return { fired: !!match, via: match ? 'text' : null };
}

function evaluateCrossSystemAxis(candidate, text) {
  // SEC-FW3-02: coerce (a numeric-string attestation like "5" must not silently skip the
  // structured signal and fall through to a false-negative text scan — a genuinely
  // cross-system-recurring PICK must never misclassify as INSTRUMENT over a type mismatch).
  const raw = candidate && candidate.cross_system_count;
  const count = raw != null && raw !== '' ? Number(raw) : NaN;
  if (Number.isFinite(count)) return { fired: count >= 2, via: 'structured' };
  const match = matchesAny(text, AXIS_KEYWORDS.crossSystemRecurrence);
  return { fired: !!match, via: match ? 'text' : null };
}
function evaluateSelfReversalAxis(candidate, text) {
  return evaluateBooleanAxis(candidate, 'self_reversal', text, AXIS_KEYWORDS.selfReversal);
}
function evaluateNegativeSpaceAxis(candidate, text) {
  return evaluateBooleanAxis(candidate, 'negative_space', text, AXIS_KEYWORDS.negativeSpace);
}
function evaluateCmvDriftAxis(candidate, text) {
  return evaluateBooleanAxis(candidate, 'cmv_drift', text, AXIS_KEYWORDS.cmvDrift);
}

/** Score every pick-signal contribution present on the candidate (deduped, stable order). */
function scorePickSignals(candidate) {
  const c = candidate || {};
  const text = textOf(c);
  const matched = [];

  if (STRUCTURAL_PICK_VALUES.has(c.sd_tree_effect)) matched.push(`structural:${c.sd_tree_effect}`);
  if (evaluateCrossSystemAxis(c, text).fired) matched.push('cross_system_recurrence');
  if (evaluateSelfReversalAxis(c, text).fired) matched.push('self_reversal');
  if (evaluateNegativeSpaceAxis(c, text).fired) matched.push('negative_space');
  if (evaluateCmvDriftAxis(c, text).fired) matched.push('cmv_drift');

  return matched;
}

/**
 * The core fail-closed classifier (FR-1). Pure, synchronous, no I/O.
 * @param {object} candidate {title?, description?, summary?, sd_tree_effect?, cross_system_count?, self_reversal?, negative_space?, cmv_drift?}
 * @returns {{framing_class:'instrument'|'pick', matched_signals:string[], reason:string}}
 */
function computeFramingClass(candidate) {
  const c = candidate || {};
  const matched = scorePickSignals(c);

  if (matched.length > 0) {
    return { framing_class: 'pick', matched_signals: matched, reason: `PICK: ${matched.join(', ')} detected` };
  }
  if (c.sd_tree_effect === STRUCTURAL_INSTRUMENT_VALUE) {
    return { framing_class: 'instrument', matched_signals: [], reason: 'INSTRUMENT: explicit add_leaf attestation, no pick-signal' };
  }
  return { framing_class: 'pick', matched_signals: [], reason: 'PICK: fail-closed default — no signal proves instrument-class' };
}

/** Convenience: the minimal payload patch a caller merges (FR-3). */
function stampFramingClass(candidate) {
  return { framing_class: computeFramingClass(candidate).framing_class };
}

/** Human-readable one-liner for chairman-digest / CLI consumption (FR-3). Fail-soft. */
function explainFramingClass(candidate) {
  try {
    return computeFramingClass(candidate).reason;
  } catch {
    return 'PICK: fail-closed default — candidate could not be evaluated';
  }
}

module.exports = {
  computeFramingClass,
  stampFramingClass,
  explainFramingClass,
  evaluateCrossSystemAxis,
  evaluateSelfReversalAxis,
  evaluateNegativeSpaceAxis,
  evaluateCmvDriftAxis,
};
