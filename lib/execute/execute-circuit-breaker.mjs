/**
 * execute-circuit-breaker.mjs
 *
 * Rolling-window failure tracker for /execute multi-session team supervisor.
 * SD: SD-MULTISESSION-EXECUTION-TEAM-COMMAND-ORCH-001-A (FR-005)
 * Source: ARCH-EXECUTE-COMMAND-001 § Implementation Phases > Phase 1
 *
 * Halts a team when failure_threshold worker failures occur within
 * failure_window_minutes. State persists in execute_teams.metadata.circuit_breaker.
 */

const DEFAULT_THRESHOLD = 3;
const DEFAULT_WINDOW_MINUTES = 10;

/**
 * Append a failure timestamp and prune entries older than the rolling window.
 * Pure function — accepts current state, returns new state. Caller persists.
 *
 * @param {Object} state - Current circuit_breaker state from execute_teams.metadata
 * @param {number} state.failure_threshold
 * @param {number} state.failure_window_min
 * @param {string[]} state.recent_failures - ISO timestamp strings
 * @param {Date} [now=new Date()] - Injected for tests
 * @returns {{ state: Object, halted: boolean }}
 */
export function recordFailure(state, now = new Date()) {
  const threshold = state?.failure_threshold ?? DEFAULT_THRESHOLD;
  const windowMin = state?.failure_window_min ?? DEFAULT_WINDOW_MINUTES;
  const cutoff = new Date(now.getTime() - windowMin * 60 * 1000);

  const existing = Array.isArray(state?.recent_failures) ? state.recent_failures : [];
  const pruned = existing.filter((iso) => {
    const t = new Date(iso);
    return !isNaN(t.getTime()) && t >= cutoff;
  });

  const updated = [...pruned, now.toISOString()];

  const newState = {
    failure_threshold: threshold,
    failure_window_min: windowMin,
    recent_failures: updated
  };

  return {
    state: newState,
    halted: updated.length >= threshold
  };
}

/**
 * Check whether the team should halt based on the current rolling window.
 * Pure function — does not mutate state, does not append a new failure.
 *
 * @param {Object} state - Current circuit_breaker state
 * @param {Date} [now=new Date()] - Injected for tests
 * @returns {boolean}
 */
export function shouldHalt(state, now = new Date()) {
  const threshold = state?.failure_threshold ?? DEFAULT_THRESHOLD;
  const windowMin = state?.failure_window_min ?? DEFAULT_WINDOW_MINUTES;
  const cutoff = new Date(now.getTime() - windowMin * 60 * 1000);

  const existing = Array.isArray(state?.recent_failures) ? state.recent_failures : [];
  const recent = existing.filter((iso) => {
    const t = new Date(iso);
    return !isNaN(t.getTime()) && t >= cutoff;
  });

  return recent.length >= threshold;
}

/**
 * Initialize circuit breaker state with defaults.
 * @param {Object} [overrides]
 * @returns {Object}
 */
export function initState(overrides = {}) {
  return {
    failure_threshold: overrides.failure_threshold ?? DEFAULT_THRESHOLD,
    failure_window_min: overrides.failure_window_min ?? DEFAULT_WINDOW_MINUTES,
    recent_failures: []
  };
}

export const _internals = { DEFAULT_THRESHOLD, DEFAULT_WINDOW_MINUTES };
