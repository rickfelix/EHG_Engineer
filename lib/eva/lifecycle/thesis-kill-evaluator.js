/**
 * Thesis-Kill Evaluator — Tier-B seam wiring.
 *
 * SD-LEO-INFRA-KILL-GATE-TIER-001
 *
 * Gives lib/eva/stage-zero/thesis-contract.js's evaluateKillCriterion a caller: reads a
 * venture's pre-registered per-stage_by kill criteria (ventures.metadata.kill_criteria) and
 * classifies each due criterion into FIRED / HOLD / CLEAR per the Q5 honest-gauge rule
 * (docs/design/kill-gate-semantics-second-opinion.md §4.4).
 *
 * Pure module: no DB / network calls here. The gauge-value RESOLUTION (metric name ->
 * observedValue) is injected by the caller (thesis-kill-gate.js) so this module never
 * assumes a gauge source that may not exist yet.
 */

import { evaluateKillCriterion } from '../stage-zero/thesis-contract.js';

export const VERDICT = Object.freeze({ FIRED: 'FIRED', HOLD: 'HOLD', CLEAR: 'CLEAR' });

/**
 * A resolver that never fabricates an observation: it returns undefined for every metric,
 * since no gauge source is wired for any thesis-kill metric today. undefined coerces to NaN
 * inside evaluateKillCriterion, which is the function's own fail-closed "unobservable" path.
 * A future gauge-source SD (or the PROBE-BETA run-prep injection harness) supplies a real
 * resolver via dependency injection — this default must never be replaced with a guess.
 *
 * @returns {undefined}
 */
export function defaultResolveObservedValue() {
  return undefined;
}

/**
 * Classify evaluateKillCriterion's raw result per the honest-gauge rule:
 *   unobservable:true  -> HOLD  (no evidence to clear or fire a kill; never a silent pass)
 *   killed:true (else) -> FIRED (names the criterion; below-threshold on the death side)
 *   killed:false        -> CLEAR
 *
 * @param {{killed: boolean, unobservable?: boolean, criterionId: string, observed: number, threshold: number, comparator: string}} rawResult
 * @returns {{verdict: 'FIRED'|'HOLD'|'CLEAR', criterionId: string, metric?: string, threshold: number, comparator: string, observed: number}}
 */
export function classifyVerdict(rawResult, criterion) {
  const base = {
    criterionId: rawResult.criterionId,
    metric: criterion?.metric,
    threshold: rawResult.threshold,
    comparator: rawResult.comparator,
    observed: rawResult.observed,
  };
  if (rawResult.unobservable) {
    return { ...base, verdict: VERDICT.HOLD };
  }
  if (rawResult.killed) {
    return { ...base, verdict: VERDICT.FIRED };
  }
  return { ...base, verdict: VERDICT.CLEAR };
}

/**
 * Resolve a raw gauge value into the strict numeric-or-undefined shape evaluateKillCriterion
 * expects. Guards the gauge-coercion landmine: evaluateKillCriterion does `Number(observedValue)`
 * internally, and Number(null)===0, Number('')===0, Number([])===0 are all finite — so passing
 * any of those through unchanged would misclassify "no gauge" as a genuine observed reading of
 * zero. Only a real finite number (including a literal 0) is a real observation; everything else
 * — null, '', [], undefined, NaN, objects — becomes undefined (unobservable, fail-closed to HOLD).
 *
 * @param {*} rawValue - whatever the injected resolver returned
 * @returns {number|undefined}
 */
export function toStrictObservedValue(rawValue) {
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) return rawValue;
  return undefined;
}

/**
 * Evaluate every armed kill_criteria entry whose stage_by is at or before toStage.
 * Criteria whose stage_by is still ahead of toStage are NOT evaluated at all (distinct from
 * HOLD, which only applies to a due criterion with no gauge reading).
 *
 * @param {Object} args
 * @param {Array} args.killCriteria - ventures.metadata.kill_criteria (may be null/empty)
 * @param {number} args.toStage - the stage-advancement target stage
 * @param {(metric: string) => (Promise<*>|*)} [args.resolveObservedValue] - injected gauge resolver
 * @returns {Promise<{ verdicts: Array, fired: Array, held: Array, clear: Array, evaluatedCount: number }>}
 */
export async function evaluateThesisKillCriteria({ killCriteria, toStage, resolveObservedValue = defaultResolveObservedValue }) {
  const criteria = Array.isArray(killCriteria) ? killCriteria : [];
  const due = criteria.filter((c) => c && Number.isInteger(c.stage_by) && c.stage_by <= toStage);

  const verdicts = [];
  for (const criterion of due) {
    const rawValue = await resolveObservedValue(criterion.metric);
    const observedValue = toStrictObservedValue(rawValue);
    const rawResult = evaluateKillCriterion(criterion, observedValue);
    verdicts.push(classifyVerdict(rawResult, criterion));
  }

  return {
    verdicts,
    fired: verdicts.filter((v) => v.verdict === VERDICT.FIRED),
    held: verdicts.filter((v) => v.verdict === VERDICT.HOLD),
    clear: verdicts.filter((v) => v.verdict === VERDICT.CLEAR),
    evaluatedCount: verdicts.length,
  };
}

export default {
  VERDICT,
  defaultResolveObservedValue,
  classifyVerdict,
  toStrictObservedValue,
  evaluateThesisKillCriteria,
};
