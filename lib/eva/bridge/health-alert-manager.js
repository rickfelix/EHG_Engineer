/**
 * Health Alert Manager
 * SD-LEO-INFRA-VENTURE-LEO-BUILD-001-M
 *
 * Tracks health state per venture and implements exception-only alerting.
 * Alerts on state transitions (healthy->unhealthy, unhealthy->healthy).
 * Auto-creates maintenance SDs after consecutive failure threshold.
 */

const CONSECUTIVE_FAILURE_THRESHOLD = 3;

/**
 * In-memory state tracking per venture.
 * @type {Map<string, { lastState: string, consecutiveFailures: number, alertedForCurrentIssue: boolean, sdCreated: boolean }>}
 */
const ventureStates = new Map();

/**
 * Get or initialize state for a venture.
 * @param {string} ventureId
 * @returns {object}
 */
export function getVentureState(ventureId) {
  if (!ventureStates.has(ventureId)) {
    ventureStates.set(ventureId, {
      lastState: 'unknown',
      consecutiveFailures: 0,
      alertedForCurrentIssue: false,
      sdCreated: false,
    });
  }
  return ventureStates.get(ventureId);
}

/**
 * Process a health check result and determine if alerts should fire.
 * Returns alert actions to take (if any).
 *
 * @param {string} ventureId
 * @param {boolean} healthy - Current health check result
 * @param {object} [checkResult] - Full check result for context
 * @returns {{ alert: 'failure'|'recovery'|null, createSD: boolean, consecutiveFailures: number, stateTransition: string|null }}
 */
export function processHealthResult(ventureId, healthy, checkResult = {}) {
  const state = getVentureState(ventureId);
  const previousState = state.lastState;
  const currentState = healthy ? 'healthy' : 'unhealthy';

  const result = {
    alert: null,
    createSD: false,
    consecutiveFailures: 0,
    stateTransition: null,
  };

  if (healthy) {
    // Recovery
    if (previousState === 'unhealthy') {
      result.alert = 'recovery';
      result.stateTransition = 'unhealthy -> healthy';
    }
    state.consecutiveFailures = 0;
    state.alertedForCurrentIssue = false;
    state.sdCreated = false;
  } else {
    // Failure
    state.consecutiveFailures++;
    result.consecutiveFailures = state.consecutiveFailures;

    // Alert only on first failure (state transition)
    if (previousState !== 'unhealthy' && !state.alertedForCurrentIssue) {
      result.alert = 'failure';
      result.stateTransition = `${previousState} -> unhealthy`;
      state.alertedForCurrentIssue = true;
    }

    // Auto-create SD after threshold
    if (state.consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD && !state.sdCreated) {
      result.createSD = true;
      state.sdCreated = true;
    }
  }

  state.lastState = currentState;
  return result;
}

/**
 * Reset all venture states (for testing).
 */
export function resetAllStates() {
  ventureStates.clear();
}

export { CONSECUTIVE_FAILURE_THRESHOLD };
