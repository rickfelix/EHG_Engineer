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
 * SD-LEO-INFRA-MINUS-CARGO-INSTRUMENTS-001 (FR-3): a HOLD verdict carries provenance and
 * an errorClass/errorMessage cause when the caller supplies them (reading.provenance,
 * reading.errorClass, reading.errorMessage) — undefined fields are simply absent, never
 * fabricated. FIRED/CLEAR verdicts also carry provenance when available, since a real
 * observation should always be traceable to its source.
 *
 * @param {{killed: boolean, unobservable?: boolean, criterionId: string, observed: number, threshold: number, comparator: string}} rawResult
 * @param {Object} criterion
 * @param {{provenance?: Object|null, errorClass?: string, errorMessage?: string}} [reading]
 * @returns {{verdict: 'FIRED'|'HOLD'|'CLEAR', criterionId: string, metric?: string, threshold: number, comparator: string, observed: number, provenance?: Object|null, errorClass?: string, errorMessage?: string}}
 */
export function classifyVerdict(rawResult, criterion, reading = {}) {
  const base = {
    criterionId: rawResult.criterionId,
    metric: criterion?.metric,
    threshold: rawResult.threshold,
    comparator: rawResult.comparator,
    observed: rawResult.observed,
    ...(reading.provenance !== undefined ? { provenance: reading.provenance } : {}),
  };
  if (rawResult.unobservable) {
    return {
      ...base,
      verdict: VERDICT.HOLD,
      ...(reading.errorClass ? { errorClass: reading.errorClass } : {}),
      ...(reading.errorMessage ? { errorMessage: reading.errorMessage } : {}),
    };
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
 * Normalize whatever a resolver returned into {value, provenance, errorClass, errorMessage}.
 * Two supported shapes, both fail-closed:
 *   - a bare number/undefined/anything else (the ORIGINAL, still-supported contract every
 *     existing test and caller uses) -> {value: toStrictObservedValue(raw), provenance: null}
 *   - a tagged reading `{ __reading: true, value, floorMet, provenance }` (opt-in, used by
 *     createMetadataResolver below) -> floorMet:false forces value:undefined regardless of
 *     the numeric value (SD-LEO-INFRA-MINUS-CARGO-INSTRUMENTS-001 FR-1: a finite reading
 *     computed from a below-floor sample must never fire a kill), and provenance/errorClass
 *     carry through so classifyVerdict can attach them to the verdict.
 *
 * A tagged reading with floorMet:false gets errorClass='floor_unmet'; an untagged/legacy
 * unobservable value (undefined/NaN/etc.) gets errorClass='unobservable_input'. Both are only
 * meaningful on a HOLD verdict — classifyVerdict drops errorClass silently for FIRED/CLEAR.
 *
 * @param {*} raw
 * @returns {{value: number|undefined, provenance: Object|null, errorClass?: string}}
 */
function normalizeReading(raw) {
  if (raw && typeof raw === 'object' && raw.__reading === true) {
    const value = toStrictObservedValue(raw.value);
    const floorMet = raw.floorMet !== false;
    return {
      value: floorMet ? value : undefined,
      provenance: raw.provenance ?? null,
      errorClass: !floorMet ? 'floor_unmet' : (value === undefined ? 'unobservable_input' : undefined),
    };
  }
  const value = toStrictObservedValue(raw);
  return { value, provenance: null, errorClass: value === undefined ? 'unobservable_input' : undefined };
}

/**
 * Evaluate every armed kill_criteria entry whose stage_by is at or before toStage.
 * Criteria whose stage_by is still ahead of toStage are NOT evaluated at all (distinct from
 * HOLD, which only applies to a due criterion with no gauge reading).
 *
 * SD-LEO-INFRA-MINUS-CARGO-INSTRUMENTS-001 (FR-3): the resolver call for EACH criterion is
 * isolated in its own try/catch. A throwing resolver classifies that ONE criterion as HOLD
 * with errorClass='resolver_error' — it must never abort the whole evaluation and discard
 * sibling criteria (the whole-loop try/catch this replaced, previously only present one layer
 * up in thesis-kill-gate.js#checkThesisKillGate, silently returned zero verdicts for every
 * criterion on a venture when any single resolver threw).
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
    let reading;
    try {
      const rawValue = await resolveObservedValue(criterion.metric);
      reading = normalizeReading(rawValue);
    } catch (err) {
      reading = { value: undefined, provenance: null, errorClass: 'resolver_error', errorMessage: err?.message || String(err) };
    }
    const rawResult = evaluateKillCriterion(criterion, reading.value);
    verdicts.push(classifyVerdict(rawResult, criterion, reading));
  }

  return {
    verdicts,
    fired: verdicts.filter((v) => v.verdict === VERDICT.FIRED),
    held: verdicts.filter((v) => v.verdict === VERDICT.HOLD),
    clear: verdicts.filter((v) => v.verdict === VERDICT.CLEAR),
    evaluatedCount: verdicts.length,
  };
}

/**
 * SD-LEO-INFRA-MINUS-CARGO-INSTRUMENTS-001 FR-1: per-metric read rules for the 3 metrics
 * AltifyAI's ratified K1-K3 kill criteria actually name. Each rule reads one venture.metadata
 * subtree and returns null when that subtree is entirely absent (a true "no data recorded
 * yet" case — distinct from a below-floor sample, which reads real data but withholds it).
 * source_id documents exactly which metadata path was read, so a verdict's provenance is
 * always traceable without a second lookup.
 */
const METRIC_READERS = Object.freeze({
  demand_test_conversion_rate: (metadata) => {
    const results = metadata?.demand_test_results;
    if (!results || typeof results !== 'object') return null;
    const visitors = Number.isFinite(results.visitors) ? results.visitors : null;
    const conversions = Number.isFinite(results.conversions) ? results.conversions : null;
    if (visitors === null || conversions === null) return null;
    const floor = metadata?.demand_test_plan?.floors?.visitors_min;
    return {
      // Percentage scale (e.g. 2.0 means "2%"), matching how kill_criteria.threshold is
      // registered (AltifyAI's live K1: threshold=2, comparator=lt — "dies below 2%
      // conversion", not below a 2.0 FRACTION which no realistic conversion rate would clear).
      value: visitors > 0 ? (conversions / visitors) * 100 : undefined,
      sampleSize: visitors,
      floor: Number.isFinite(floor) ? floor : null,
      sourceId: 'ventures.metadata.demand_test_results',
    };
  },
  card_verified_preorders: (metadata) => {
    const capture = metadata?.payment_capture;
    if (!capture || typeof capture !== 'object') return null;
    const count = Number.isFinite(capture.card_verified_preorders_count) ? capture.card_verified_preorders_count : null;
    if (count === null) return null;
    return {
      value: count,
      sampleSize: count,
      floor: Number.isFinite(metadata?.demand_test_plan?.floors?.preorders_min) ? metadata.demand_test_plan.floors.preorders_min : null,
      sourceId: 'ventures.metadata.payment_capture',
    };
  },
  ltv_cac_ratio: (metadata) => {
    const econ = metadata?.unit_economics;
    if (!econ || typeof econ !== 'object') return null;
    const ratio = Number.isFinite(econ.ltv_cac_ratio) ? econ.ltv_cac_ratio : null;
    if (ratio === null) return null;
    const sampleSize = Number.isFinite(econ.sample_size) ? econ.sample_size : null;
    return {
      value: ratio,
      sampleSize,
      floor: Number.isFinite(metadata?.demand_test_plan?.floors?.unit_economics_sample_min) ? metadata.demand_test_plan.floors.unit_economics_sample_min : null,
      sourceId: 'ventures.metadata.unit_economics',
    };
  },
});

/**
 * Build a real, provenance-and-floor-aware resolver bound to one venture's metadata.
 * Returned function matches the resolveObservedValue(metric) contract, but tags its output
 * with `{__reading:true, ...}` so evaluateThesisKillCriteria's normalizeReading() applies
 * floor-gating instead of treating the reading as a bare legacy number.
 *
 * Floor semantics: when the criterion's registered floor is unknown (not present anywhere in
 * metadata), floorMet defaults to true — this module never invents a floor to enforce one it
 * was never told about (value-authenticity invariant, matches thesis-contract.js's own
 * "absence over invention" convention).
 *
 * @param {Object} metadata - the venture's metadata object (same object kill_criteria lives on)
 * @returns {(metric: string) => Object|undefined}
 */
export function createMetadataResolver(metadata) {
  return function resolveFromVentureMetadata(metric) {
    const reader = METRIC_READERS[metric];
    if (!reader) return undefined; // unknown metric: same as no gauge source, fail-closed to HOLD
    const reading = reader(metadata || {});
    if (!reading) return undefined; // source subtree entirely absent: true no-data
    const floorMet = reading.floor == null || (Number.isFinite(reading.sampleSize) && reading.sampleSize >= reading.floor);
    return {
      __reading: true,
      value: reading.value,
      floorMet,
      provenance: {
        metric,
        source_id: reading.sourceId,
        sample_size: reading.sampleSize,
        window: 'cumulative_to_date',
        computed_at: new Date().toISOString(),
      },
    };
  };
}

export default {
  VERDICT,
  defaultResolveObservedValue,
  classifyVerdict,
  toStrictObservedValue,
  createMetadataResolver,
  evaluateThesisKillCriteria,
};
