/**
 * Compute Posture Configuration Module (V07: compute_cost_governance)
 *
 * Implements configurable compute cost enforcement policy.
 * Default mode is AWARENESS — cost threshold breaches are surfaced
 * but never block execution. The unlimited compute posture means
 * cost awareness is informational, not restrictive.
 *
 * Set COMPUTE_POSTURE_MODE=enforcement to enable blocking mode
 * where thresholds block execution until chairman acknowledges.
 */

/**
 * Compute posture policy modes:
 * - 'awareness-not-enforcement': Monitor costs, surface to DFE, never block
 * - 'enforcement': Block execution when hard limits exceeded
 */
const POSTURE_MODES = {
  AWARENESS: 'awareness-not-enforcement',
  ENFORCEMENT: 'enforcement',
};

/**
 * Default cost thresholds per stage type (in arbitrary cost units).
 * 'warn' triggers DFE awareness event; 'escalate' triggers chairman notification.
 * In enforcement mode, escalate threshold triggers execution blocking.
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
 * Reads COMPUTE_POSTURE_MODE env var to determine policy.
 * Defaults to AWARENESS mode (blockOnExceed inactive).
 *
 * @param {Object} [overrides] - Optional overrides for testing
 * @param {string} [overrides.policy] - Policy mode override
 * @param {Object} [overrides.costThresholds] - Threshold overrides per stage
 * @returns {{ policy: string, costThresholds: Object, blockOnExceed: boolean }}
 */
function getComputePosture(overrides = {}) {
  const policy = overrides.policy
    || process.env.COMPUTE_POSTURE_MODE
    || POSTURE_MODES.AWARENESS;
  const costThresholds = {
    ...DEFAULT_COST_THRESHOLDS,
    ...(overrides.costThresholds || {}),
  };

  return {
    policy,
    costThresholds,
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
