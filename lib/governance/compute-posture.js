/**
 * Compute Posture Configuration Module (V07: unlimited_compute_posture)
 *
 * Implements awareness-not-enforcement policy for compute costs.
 * The system monitors cost thresholds for visibility but does NOT block
 * execution when thresholds are exceeded — unlimited compute is the posture.
 *
 * Thresholds feed into the Decision Filter Engine for escalation decisions.
 */

/**
 * Compute posture policy modes:
 * - 'awareness-not-enforcement': Monitor costs, surface to DFE, never block
 * - 'enforcement': Block execution when hard limits exceeded (future)
 */
const POSTURE_MODES = {
  AWARENESS: 'awareness-not-enforcement',
  ENFORCEMENT: 'enforcement',
};

/**
 * Default cost thresholds per stage type (in arbitrary cost units).
 * 'warn' triggers DFE awareness event; 'escalate' triggers chairman notification.
 * Neither blocks execution under awareness-not-enforcement policy.
 */
const DEFAULT_COST_THRESHOLDS = {
  LEAD: { warn: 50, escalate: 200 },
  PLAN: { warn: 100, escalate: 400 },
  EXEC: { warn: 200, escalate: 800 },
  REVIEW: { warn: 50, escalate: 200 },
  DEFAULT: { warn: 100, escalate: 500 },
};

/**
 * Returns the current compute posture configuration.
 *
 * @param {Object} [overrides] - Optional overrides for testing
 * @param {string} [overrides.policy] - Policy mode override
 * @param {Object} [overrides.costThresholds] - Threshold overrides per stage
 * @returns {{ policy: string, costThresholds: Object, blockOnExceed: boolean }}
 */
function getComputePosture(overrides = {}) {
  const policy = overrides.policy || POSTURE_MODES.AWARENESS;
  const costThresholds = {
    ...DEFAULT_COST_THRESHOLDS,
    ...(overrides.costThresholds || {}),
  };

  return {
    policy,
    costThresholds,
    // Under awareness policy, we never block execution
    blockOnExceed: policy === POSTURE_MODES.ENFORCEMENT,
  };
}

/**
 * Evaluate a cost reading against posture thresholds.
 *
 * @param {number} cost - Current cost value
 * @param {string} stageType - Stage type (LEAD, PLAN, EXEC, REVIEW)
 * @param {Object} [posture] - Posture config (defaults to getComputePosture())
 * @returns {{ level: 'normal'|'warn'|'escalate', cost: number, threshold: Object, blocked: boolean }}
 */
function evaluateCost(cost, stageType, posture) {
  const config = posture || getComputePosture();
  const thresholds = config.costThresholds[stageType] || config.costThresholds.DEFAULT;

  let level = 'normal';
  if (cost >= thresholds.escalate) {
    level = 'escalate';
  } else if (cost >= thresholds.warn) {
    level = 'warn';
  }

  return {
    level,
    cost,
    threshold: thresholds,
    blocked: level === 'escalate' && config.blockOnExceed,
  };
}

export {
  getComputePosture,
  evaluateCost,
  POSTURE_MODES,
  DEFAULT_COST_THRESHOLDS,
};
