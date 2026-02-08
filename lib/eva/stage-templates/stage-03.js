/**
 * Stage 03 Template - Market Validation
 * Phase: THE TRUTH (Stages 1-5)
 * Part of SD-LEO-FEAT-TMPL-TRUTH-001
 *
 * 6-metric validation rubric with deterministic KILL GATE enforcement.
 * Kill gate triggers when overallScore < 70 OR any single metric < 40.
 *
 * @module lib/eva/stage-templates/stage-03
 */

import { validateInteger, collectErrors } from './validation.js';

const METRICS = [
  'marketFit',
  'customerNeed',
  'momentum',
  'revenuePotential',
  'competitiveBarrier',
  'executionFeasibility',
];

const OVERALL_THRESHOLD = 70;
const METRIC_THRESHOLD = 40;

const TEMPLATE = {
  id: 'stage-03',
  slug: 'validation',
  title: 'Market Validation',
  version: '1.0.0',
  schema: {
    marketFit: { type: 'integer', min: 0, max: 100, required: true },
    customerNeed: { type: 'integer', min: 0, max: 100, required: true },
    momentum: { type: 'integer', min: 0, max: 100, required: true },
    revenuePotential: { type: 'integer', min: 0, max: 100, required: true },
    competitiveBarrier: { type: 'integer', min: 0, max: 100, required: true },
    executionFeasibility: { type: 'integer', min: 0, max: 100, required: true },
    overallScore: { type: 'integer', min: 0, max: 100, derived: true },
    decision: { type: 'enum', values: ['pass', 'kill'], derived: true },
    blockProgression: { type: 'boolean', derived: true },
    reasons: { type: 'array', derived: true },
  },
  defaultData: {
    marketFit: null,
    customerNeed: null,
    momentum: null,
    revenuePotential: null,
    competitiveBarrier: null,
    executionFeasibility: null,
    overallScore: null,
    decision: null,
    blockProgression: false,
    reasons: [],
  },

  /**
   * Validate stage input data.
   * @param {Object} data
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(data) {
    const results = METRICS.map(m => validateInteger(data?.[m], m, 0, 100));
    const errors = collectErrors(results);
    return { valid: errors.length === 0, errors };
  },

  /**
   * Compute derived fields: overallScore and kill gate decision.
   * @param {Object} data - Validated input data
   * @returns {Object} Data with overallScore, decision, blockProgression, reasons
   */
  computeDerived(data) {
    const scores = METRICS.map(m => data[m]);
    const sum = scores.reduce((acc, s) => acc + s, 0);
    const overallScore = Math.round(sum / METRICS.length);

    const { decision, blockProgression, reasons } = evaluateKillGate({
      overallScore,
      metrics: Object.fromEntries(METRICS.map(m => [m, data[m]])),
    });

    return {
      ...data,
      overallScore,
      decision,
      blockProgression,
      reasons,
    };
  },
};

/**
 * Pure function: evaluate kill gate for Stage 03.
 * Kill if overallScore < 70 OR any metric < 40.
 *
 * @param {{ overallScore: number, metrics: Object }} params
 * @returns {{ decision: 'pass'|'kill', blockProgression: boolean, reasons: Object[] }}
 */
export function evaluateKillGate({ overallScore, metrics }) {
  const reasons = [];

  if (overallScore < OVERALL_THRESHOLD) {
    reasons.push({
      type: 'overall_below_threshold',
      message: `Overall score ${overallScore} is below threshold ${OVERALL_THRESHOLD}`,
      threshold: OVERALL_THRESHOLD,
      actual: overallScore,
    });
  }

  for (const [metric, value] of Object.entries(metrics)) {
    if (value < METRIC_THRESHOLD) {
      reasons.push({
        type: 'metric_below_40',
        metric,
        message: `${metric} score ${value} is below per-metric threshold ${METRIC_THRESHOLD}`,
        threshold: METRIC_THRESHOLD,
        actual: value,
      });
    }
  }

  const decision = reasons.length > 0 ? 'kill' : 'pass';
  return {
    decision,
    blockProgression: decision === 'kill',
    reasons,
  };
}

export { METRICS, OVERALL_THRESHOLD, METRIC_THRESHOLD };
export default TEMPLATE;
