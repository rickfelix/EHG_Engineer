/**
 * Machine-evaluable release_condition predicate evaluator.
 * SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-A (FR-3).
 *
 * Pure, deterministic: evaluate(predicate, state) never reads live system state itself --
 * the caller injects `state`, keeping this testable in isolation with stubbed inputs and
 * with no dependency on child B/C's not-yet-built consumers.
 *
 * @module lib/governance/release-condition-predicate
 */

export const PREDICATE_TYPE = Object.freeze({
  TEST_GREEN: 'test_green',
  MANUAL_FLAG: 'manual_flag',
  DB_ROW_EXISTS: 'db_row_exists',
});

/**
 * @param {{type: string, params: Object}} predicate
 * @param {Object} state - caller-injected snapshot of whatever the predicate needs to check.
 *   For 'test_green': state.testResults = { [suiteName]: boolean }.
 *   For 'manual_flag': state.flags = { [flagName]: boolean }.
 *   For 'db_row_exists': state.rowCounts = { [tableOrQueryKey]: number }.
 * @returns {boolean} true iff the predicate resolves satisfied given `state`.
 *   Fail-closed: an unrecognized predicate type, missing state, or malformed predicate
 *   returns false (never true) -- an unevaluable release condition is NOT released.
 */
export function evaluate(predicate, state = {}) {
  if (!predicate || typeof predicate !== 'object') return false;
  const { type } = predicate;
  // SEC-D-1: `const { params = {} }` applies the ES default ONLY for undefined, never for null — and
  // JSONB round-trips null faithfully, so a single stored `"params": null` threw
  // TypeError: Cannot read properties of null. In a per-detector-catch consumer that silently voids
  // the whole detector for the tick while the run prints healthy. Normalize defensively: this is a
  // fail-closed evaluator and it must answer false, never throw.
  const params = (predicate.params && typeof predicate.params === 'object' && !Array.isArray(predicate.params))
    ? predicate.params : {};

  switch (type) {
    case PREDICATE_TYPE.TEST_GREEN: {
      const suite = params.suite;
      if (typeof suite !== 'string' || !state.testResults) return false;
      return state.testResults[suite] === true;
    }
    case PREDICATE_TYPE.MANUAL_FLAG: {
      const flag = params.flag;
      if (typeof flag !== 'string' || !state.flags) return false;
      return state.flags[flag] === true;
    }
    case PREDICATE_TYPE.DB_ROW_EXISTS: {
      const key = params.key;
      if (typeof key !== 'string' || !state.rowCounts) return false;
      return (state.rowCounts[key] || 0) > 0;
    }
    default:
      return false; // fail-closed on unrecognized type
  }
}

/**
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-D (FR-6): classify a set of hold rows into met / unmet /
 * unevaluable, PURE so it is testable without running a gauge.
 *
 * WHY THIS IS A FUNCTION AND NOT AN INLINE LOOP: the first cut of this logic lived inline in
 * scripts/gauge-runner.mjs and its only coverage was a regex grep asserting the counter NAMES were
 * present. Inverting the met/unmet branch would have left every assertion matching — zero behavioural
 * coverage over the whole block. Extracted so the classification can be asserted on real inputs.
 *
 * WHY UNEVALUABLE IS ITS OWN BUCKET: evaluate() is FAIL-CLOSED, so it returns false for a genuinely
 * unmet condition AND for one it could not check. Folding those together reports "not met" about
 * something never measured — the assertion-without-measurement defect this workstream closes.
 *
 * KEY-LEVEL, NOT TYPE-LEVEL: a predicate is evaluable only when the caller's state actually contains
 * the key it needs. Gating on `type` alone leaks — a db_row_exists predicate keyed to a table the
 * caller did not count would evaluate false and be recorded as UNMET when it was simply unevaluable.
 *
 * @param {Array<{release_condition?: string, release_condition_predicate?: unknown}>} rows
 * @param {{rowCounts?: Object, flags?: Object, testResults?: Object}} state caller-injected snapshot
 * @param {(p: unknown) => boolean} isStructured predicate-shape validator (injected to avoid a cycle)
 * @returns {{met:number, unmet:number, unevaluable:number, structured:number, proseOnly:number, malformed:number}}
 */
export function classifyReleaseConditions(rows, state = {}, isStructured = () => false) {
  const out = { met: 0, unmet: 0, unevaluable: 0, structured: 0, proseOnly: 0, malformed: 0 };
  for (const r of rows || []) {
    const p = r && r.release_condition_predicate;
    if (!isStructured(p)) {
      // Prose is NEVER parsed into a predicate — it is counted as the remaining gap.
      if (typeof (r && r.release_condition) === 'string' && r.release_condition.trim()) out.proseOnly++;
      continue;
    }
    out.structured++;
    // Defence in depth. The guard above and evaluate() below are both hardened against a malformed
    // stored predicate, but this loop runs inside a governance detector whose caller catches
    // per-detector — so ONE bad row must never be able to void the whole detector's output for a
    // tick while the run prints healthy. A row that still manages to throw is counted, not fatal.
    try {
      if (!hasStateFor(p, state)) { out.unevaluable++; continue; }
      if (evaluate(p, state)) out.met++; else out.unmet++;
    } catch {
      out.malformed++;
    }
  }
  return out;
}

/**
 * Does `state` carry the specific key this predicate needs? The discriminator that keeps a
 * fail-closed false from being misreported as "not met".
 * @param {{type: string, params?: Object}} predicate
 * @param {Object} state
 * @returns {boolean}
 */
export function hasStateFor(predicate, state = {}) {
  if (!predicate || typeof predicate !== 'object') return false;
  const params = (predicate.params && typeof predicate.params === 'object') ? predicate.params : {};
  const has = (container, key) => !!container && typeof key === 'string'
    && Object.prototype.hasOwnProperty.call(container, key);
  switch (predicate.type) {
    case PREDICATE_TYPE.TEST_GREEN: return has(state.testResults, params.suite);
    case PREDICATE_TYPE.MANUAL_FLAG: return has(state.flags, params.flag);
    case PREDICATE_TYPE.DB_ROW_EXISTS: return has(state.rowCounts, params.key);
    default: return false;
  }
}

export default evaluate;
