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
  const { type, params = {} } = predicate;

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

export default evaluate;
