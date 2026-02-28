/**
 * Decision Filter Engine (V04: decision_filter_engine_escalation)
 *
 * Evaluates gate decisions using confidence-based thresholds.
 * High-confidence decisions auto-resolve (GO); low-confidence
 * escalate to chairman. Cost awareness integrated from compute-posture.
 *
 * Replaces static gate policies with dynamic, confidence-driven routing.
 */

import { getComputePosture, evaluateCost } from './compute-posture.js';

/**
 * Decision outcomes from the DFE.
 */
const DECISIONS = {
  GO: 'GO',           // Auto-resolve, no chairman needed
  ESCALATE: 'ESCALATE', // Route to chairman for review
  BLOCK: 'BLOCK',     // Hard stop, requires intervention
};

/**
 * Default confidence thresholds per gate type.
 * - goThreshold: confidence at or above → auto-resolve (GO)
 * - escalateThreshold: confidence below → ESCALATE to chairman
 * - Below escalateThreshold with critical context → BLOCK
 */
const DEFAULT_THRESHOLDS = {
  QUALITY_GATE: { goThreshold: 0.85, escalateThreshold: 0.5 },
  KILL_GATE: { goThreshold: 0.95, escalateThreshold: 0.7 },
  APPROVAL_GATE: { goThreshold: 0.85, escalateThreshold: 0.5 },
  PHASE_GATE: { goThreshold: 0.80, escalateThreshold: 0.4 },
  DEFAULT: { goThreshold: 0.85, escalateThreshold: 0.5 },
};

/**
 * Evaluate a decision through the DFE.
 *
 * @param {Object} input
 * @param {number} input.confidence - Confidence score 0.0-1.0
 * @param {string} [input.gateType='DEFAULT'] - Gate type for threshold lookup
 * @param {Object} [input.context={}] - Additional context (cost, risk flags)
 * @param {number} [input.context.cost] - Current cost for compute posture check
 * @param {string} [input.context.stageType] - Stage type for cost evaluation
 * @param {boolean} [input.context.critical] - If true, low confidence → BLOCK instead of ESCALATE
 * @param {Object} [thresholdOverrides] - Override thresholds for testing
 * @returns {{ decision: string, reasoning: string, confidence: number, costEvaluation?: Object }}
 */
function evaluate(input, thresholdOverrides) {
  const { confidence, gateType = 'DEFAULT', context = {} } = input;

  if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
    return {
      decision: DECISIONS.ESCALATE,
      reasoning: `Invalid confidence value: ${confidence}. Escalating for manual review.`,
      confidence: confidence || 0,
    };
  }

  const thresholds = (thresholdOverrides || {})[gateType]
    || DEFAULT_THRESHOLDS[gateType]
    || DEFAULT_THRESHOLDS.DEFAULT;

  const result = {
    confidence,
    gateType,
  };

  // Cost evaluation (if cost data provided)
  if (context.cost != null && context.stageType) {
    const posture = getComputePosture();
    result.costEvaluation = evaluateCost(context.cost, context.stageType, posture);

    // Under enforcement mode, cost escalation can override confidence
    if (result.costEvaluation.blocked) {
      result.decision = DECISIONS.BLOCK;
      result.reasoning = `Cost exceeded escalation threshold (${context.cost} >= ${result.costEvaluation.threshold.escalate}) under enforcement policy.`;
      return result;
    }
  }

  // Confidence-based routing
  if (confidence >= thresholds.goThreshold) {
    result.decision = DECISIONS.GO;
    result.reasoning = `Confidence ${confidence.toFixed(2)} >= ${thresholds.goThreshold} (${gateType}). Auto-resolved.`;
  } else if (confidence >= thresholds.escalateThreshold) {
    result.decision = DECISIONS.ESCALATE;
    result.reasoning = `Confidence ${confidence.toFixed(2)} between ${thresholds.escalateThreshold}-${thresholds.goThreshold} (${gateType}). Escalated for chairman review.`;
  } else if (context.critical) {
    result.decision = DECISIONS.BLOCK;
    result.reasoning = `Confidence ${confidence.toFixed(2)} < ${thresholds.escalateThreshold} with critical context. Blocked pending intervention.`;
  } else {
    result.decision = DECISIONS.ESCALATE;
    result.reasoning = `Confidence ${confidence.toFixed(2)} < ${thresholds.escalateThreshold} (${gateType}). Escalated for chairman review.`;
  }

  return result;
}

/**
 * Batch evaluate multiple decisions.
 *
 * @param {Array<Object>} inputs - Array of evaluate() input objects
 * @returns {Array<Object>} Array of evaluation results
 */
function evaluateBatch(inputs) {
  return inputs.map((input) => evaluate(input));
}

/**
 * Get the threshold configuration for a gate type.
 *
 * @param {string} gateType
 * @returns {{ goThreshold: number, escalateThreshold: number }}
 */
function getThresholds(gateType) {
  return DEFAULT_THRESHOLDS[gateType] || DEFAULT_THRESHOLDS.DEFAULT;
}

export {
  evaluate,
  evaluateBatch,
  getThresholds,
  DECISIONS,
  DEFAULT_THRESHOLDS,
};
