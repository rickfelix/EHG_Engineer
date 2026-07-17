/**
 * Chaining Score — CHAINING-NOW / CHAINING-OPTION axes for Stage-0 venture selection.
 * SD-LEO-INFRA-PORTFOLIO-STRATEGY-FIRST-001-B
 *
 * ARCHITECTURE: a capped BONUS LANE outside the weighted sum. Three verified invariants
 * forbid registering chaining as a weighted component:
 *   1. calculateWeightedScore does NOT normalize by weight sum (profile-service.js:17) and
 *      the live 11 weights total exactly 1.00 — new weighted axes push total_score past 100
 *      and drift venture-nursery promotion thresholds.
 *   2. Posture criteria.weights must sum to exactly 1.0 or rankCandidates fails closed
 *      (PostureResolutionError, discovery-mode.js:942).
 *   3. Live weights come from the evaluation_profiles active row — a LEGACY_WEIGHTS-only
 *      registration would score 0 in production (false-complete).
 * The bonus is advisory ranking signal only: GO/NO-GO verdicts are computed from
 * total_score BEFORE chaining exists (chairman hard rule: option value never flips a
 * standalone-nonviable candidate to GO).
 *
 * CHAINING-NOW categorical map (0-5), from candidate chaining input
 * { sibling_venture, relationship: 'anchor_customer'|'consumer', committed_this_quarter,
 *   integration_scheduled, consumption_plan, options[] }:
 *   5 — named sibling is anchor customer AND committed THIS quarter
 *   4 — sibling consumption integration scheduled this quarter
 *   3 — anchor-customer relationship with concrete (unscheduled) consumption plan
 *   2 — named sibling consumer with concrete consumption plan
 *   1 — named sibling identified, nothing concrete
 *   0 — no sibling consumption evidence
 *
 * CHAINING-OPTION hard rules (chairman-set): no-trigger-no-option (trigger + review_at +
 * confidence all required, trigger expressed in the tech-trajectory vocabulary), options
 * decay linearly to zero at the horizon, bonus capped and never load-bearing.
 */

import { AXIS_WEIGHTS } from './synthesis/tech-trajectory.js';

export const DEFAULT_CHAINING_RULES = Object.freeze({
  bonus_cap: 10,
  decay_horizon_months: 6, // matches the tech-trajectory 6m band horizon
  confidence_floor: 0.2,
  require_trigger: true,
});

const VALID_AXES = Object.keys(AXIS_WEIGHTS);
const VALID_BANDS = ['bull_6m', 'base_6m', 'bear_6m'];
const VALID_COMPARATORS = ['>=', '<='];
const AVG_MONTH_MS = 30.44 * 24 * 3600 * 1000;

/** Merge posture-governed tunables over defaults. Posture is the chairman-ratified object. */
export function resolveChainingRules(posture) {
  const rules = posture?.criteria?.chaining_rules;
  return rules && typeof rules === 'object'
    ? { ...DEFAULT_CHAINING_RULES, ...rules }
    : { ...DEFAULT_CHAINING_RULES };
}

/**
 * Resolve rules for a synthesis run: explicit deps.chainingRules override, else the
 * ACTIVE selection posture's criteria.chaining_rules, else code defaults. Never throws —
 * chaining is advisory and must not break a synthesis run on posture resolution failure.
 */
export async function resolveChainingRulesFromDeps(deps = {}) {
  if (deps.chainingRules && typeof deps.chainingRules === 'object') {
    return { ...DEFAULT_CHAINING_RULES, ...deps.chainingRules };
  }
  try {
    const { resolveActivePosture } = await import('./profile-service.js');
    const posture = await resolveActivePosture(deps);
    return resolveChainingRules(posture);
  } catch {
    return { ...DEFAULT_CHAINING_RULES };
  }
}

/** CHAINING-NOW (0-5) per the categorical map above. Malformed input degrades to 0. */
export function scoreChainingNow(input) {
  if (!input || typeof input !== 'object' || typeof input.sibling_venture !== 'string' || input.sibling_venture.length === 0) {
    return 0;
  }
  const anchor = input.relationship === 'anchor_customer';
  if (anchor && input.committed_this_quarter === true) return 5;
  if (input.integration_scheduled === true) return 4;
  if (input.consumption_plan === true) return anchor ? 3 : 2;
  return 1;
}

/** Validate one option against the hard rules. Returns { valid, reason? }. */
export function validateOption(option, rules) {
  if (!option || typeof option !== 'object') return { valid: false, reason: 'not_an_object' };
  if (rules.require_trigger !== false) {
    const t = option.trigger;
    if (!t || typeof t !== 'object') return { valid: false, reason: 'missing_trigger' };
    if (!VALID_AXES.includes(t.axis)) return { valid: false, reason: `invalid_axis:${t.axis}` };
    if (!VALID_BANDS.includes(t.band)) return { valid: false, reason: `invalid_band:${t.band}` };
    if (!VALID_COMPARATORS.includes(t.comparator)) return { valid: false, reason: `invalid_comparator:${t.comparator}` };
    if (typeof t.threshold !== 'number' || t.threshold < 0 || t.threshold > 100) {
      return { valid: false, reason: 'invalid_threshold' };
    }
  }
  if (!Number.isFinite(Date.parse(option.review_at))) return { valid: false, reason: 'missing_or_invalid_review_at' };
  if (typeof option.confidence !== 'number' || option.confidence > 1) return { valid: false, reason: 'invalid_confidence' };
  if (option.confidence < rules.confidence_floor) return { valid: false, reason: 'confidence_below_floor' };
  return { valid: true };
}

/** Linear decay: 1.0 now → 0 at/beyond now + horizonMonths. Monotonic in review_at. */
export function decayFactor(reviewAtMs, nowMs, horizonMonths) {
  const horizonMs = horizonMonths * AVG_MONTH_MS;
  if (!(horizonMs > 0)) return 0;
  return Math.max(0, Math.min(1, 1 - (reviewAtMs - nowMs) / horizonMs));
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * CHAINING-OPTION (0-5): each valid option contributes confidence × decay; the strongest
 * single option defines the axis score (best-option semantics — options are alternative
 * futures, not additive ones). Invalid options land in rejected_options with a reason.
 */
export function scoreChainingOption(options, rules = DEFAULT_CHAINING_RULES, now = new Date()) {
  const nowMs = now.getTime();
  const options_scored = [];
  const rejected_options = [];
  for (const option of Array.isArray(options) ? options : []) {
    const verdict = validateOption(option, rules);
    if (!verdict.valid) {
      rejected_options.push({ label: option?.label ?? null, reason: verdict.reason });
      continue;
    }
    const factor = decayFactor(Date.parse(option.review_at), nowMs, rules.decay_horizon_months);
    options_scored.push({
      label: option.label ?? null,
      confidence: option.confidence,
      decay_factor: round2(factor),
      contribution: round2(option.confidence * factor),
      decayed: factor === 0,
    });
  }
  const best = options_scored.reduce((max, o) => Math.max(max, o.contribution), 0);
  return { score: Math.round(best * 5), options_scored, rejected_options };
}

/** Bonus points in [0, rules.bonus_cap]. bonus_cap=0 is the governed kill switch. */
export function computeChainingBonus({ chaining_now = 0, chaining_option = 0, rules = DEFAULT_CHAINING_RULES }) {
  const cap = Math.max(0, Number(rules.bonus_cap) || 0);
  return Math.min(cap, chaining_now + chaining_option);
}

/** Full chaining computation for one candidate's chaining input. Never throws on bad input. */
export function computeChaining(chainingInput, rules = DEFAULT_CHAINING_RULES, now = new Date()) {
  const chaining_now = scoreChainingNow(chainingInput);
  const { score: chaining_option, options_scored, rejected_options } = scoreChainingOption(chainingInput?.options, rules, now);
  return {
    chaining_now,
    chaining_option,
    bonus_points: computeChainingBonus({ chaining_now, chaining_option, rules }),
    options_scored,
    rejected_options,
    rules_applied: { ...rules },
  };
}
