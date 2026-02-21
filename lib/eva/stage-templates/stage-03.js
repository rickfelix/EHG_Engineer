/**
 * Stage 03 Template - Individual Validation (KILL GATE)
 * Phase: THE TRUTH (Stages 1-5)
 * Part of SD-EVA-FEAT-TEMPLATES-TRUTH-001
 *
 * Hybrid scoring (50% deterministic + 50% AI calibration) with 3-way gate:
 *   PASS:   overallScore ≥ 70 AND all metrics ≥ 50
 *   REVISE: overallScore ≥ 50 AND < 70 AND no metric < 50 → re-route to Stage 2
 *   KILL:   overallScore < 50 OR any metric < 50
 *
 * Cross-stage contracts:
 *   ← Stage 2: 7 pre-scores, evidence packs, composite analysis
 *   ← Stage 1: archetype (scoring weights), problemStatement, keyAssumptions
 *   → Stage 4: competitorEntities (name, positioning, threat_level)
 *   → Stage 5: market validation result, archetype-driven weighting
 *
 * @module lib/eva/stage-templates/stage-03
 */

import { validateInteger, validateString, validateArray, validateEnum, collectErrors, validateCrossStageContract } from './validation.js';
import { analyzeStage03 } from './analysis-steps/stage-03-hybrid-scoring.js';

const METRICS = [
  'marketFit',
  'customerNeed',
  'momentum',
  'revenuePotential',
  'competitiveBarrier',
  'executionFeasibility',
  'designQuality',
];

const PASS_THRESHOLD = 70;
const REVISE_THRESHOLD = 50;
const METRIC_THRESHOLD = 50;

const THREAT_LEVELS = ['H', 'M', 'L'];

const TEMPLATE = {
  id: 'stage-03',
  slug: 'validation',
  title: 'Kill Gate',
  version: '2.0.0',
  schema: {
    // 6 core metrics (0-100 integer)
    marketFit: { type: 'integer', min: 0, max: 100, required: true },
    customerNeed: { type: 'integer', min: 0, max: 100, required: true },
    momentum: { type: 'integer', min: 0, max: 100, required: true },
    revenuePotential: { type: 'integer', min: 0, max: 100, required: true },
    competitiveBarrier: { type: 'integer', min: 0, max: 100, required: true },
    executionFeasibility: { type: 'integer', min: 0, max: 100, required: true },
    designQuality: { type: 'integer', min: 0, max: 100, required: true },
    // Competitor entities for Stage 4 handoff
    competitorEntities: {
      type: 'array',
      required: false,
      items: {
        name: { type: 'string', required: true },
        positioning: { type: 'string', required: true },
        threat_level: { type: 'enum', values: THREAT_LEVELS, required: true },
      },
    },
    // Per-metric confidence levels
    confidenceScores: {
      type: 'object',
      required: false,
    },
    // Derived fields
    overallScore: { type: 'integer', min: 0, max: 100, derived: true },
    rollupDimensions: { type: 'object', derived: true },
    decision: { type: 'enum', values: ['pass', 'revise', 'kill'], derived: true },
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
    designQuality: null,
    competitorEntities: [],
    confidenceScores: {},
    overallScore: null,
    rollupDimensions: null,
    decision: null,
    blockProgression: false,
    reasons: [],
  },

  /**
   * Validate stage input data.
   * @param {Object} data
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(data, prerequisites, { logger = console } = {}) {
    const results = METRICS.map(m => validateInteger(data?.[m], m, 0, 100));

    // Cross-stage contract: validate stage-02 outputs if provided
    if (prerequisites?.stage02) {
      const s02Contract = {
        metrics: { type: 'object' },
        evidence: { type: 'object' },
      };
      const s02Check = validateCrossStageContract(prerequisites.stage02, s02Contract, 'stage-02');
      results.push(...s02Check.errors.map(e => ({ valid: false, error: e })));
    }
    // Cross-stage contract: validate stage-01 outputs if provided
    if (prerequisites?.stage01) {
      const s01Contract = {
        archetype: { type: 'string' },
        problemStatement: { type: 'string', minLength: 20 },
      };
      const s01Check = validateCrossStageContract(prerequisites.stage01, s01Contract, 'stage-01');
      results.push(...s01Check.errors.map(e => ({ valid: false, error: e })));
    }

    // Validate competitor entities if present
    if (data?.competitorEntities && Array.isArray(data.competitorEntities)) {
      for (let i = 0; i < data.competitorEntities.length; i++) {
        const ce = data.competitorEntities[i];
        const prefix = `competitorEntities[${i}]`;
        results.push(validateString(ce?.name, `${prefix}.name`, 1));
        results.push(validateString(ce?.positioning, `${prefix}.positioning`, 1));
        results.push(validateEnum(ce?.threat_level, `${prefix}.threat_level`, THREAT_LEVELS));
      }
    }

    const errors = collectErrors(results);
    if (errors.length > 0) { logger.warn('[Stage03] Validation failed', { errorCount: errors.length, errors }); }
    return { valid: errors.length === 0, errors };
  },

  /**
   * Compute derived fields: overallScore, rollup dimensions, and 3-way gate decision.
   * @param {Object} data - Validated input data
   * @returns {Object} Data with overallScore, rollupDimensions, decision, blockProgression, reasons
   */
  computeDerived(data, { logger = console } = {}) {
    const scores = METRICS.map(m => data[m]);
    const sum = scores.reduce((acc, s) => acc + s, 0);
    const overallScore = Math.round(sum / METRICS.length);

    // 4 rollup dimensions for governance readability
    const rollupDimensions = {
      market: Math.round((data.marketFit + data.momentum) / 2),
      technical: Math.round((data.executionFeasibility + data.competitiveBarrier) / 2),
      financial: Math.round((data.revenuePotential + data.customerNeed) / 2),
      experience: data.designQuality,
    };

    const { decision, blockProgression, reasons } = evaluateKillGate({
      overallScore,
      metrics: Object.fromEntries(METRICS.map(m => [m, data[m]])),
    });

    return {
      ...data,
      overallScore,
      rollupDimensions,
      decision,
      blockProgression,
      reasons,
    };
  },
};

/**
 * Pure function: evaluate 3-way kill gate for Stage 03.
 *
 * PASS:   overallScore ≥ 70 AND all metrics ≥ 50
 * REVISE: overallScore ≥ 50 AND < 70 AND no metric < 50 → re-route to Stage 2
 * KILL:   overallScore < 50 OR any metric < 50
 *
 * @param {{ overallScore: number, metrics: Object }} params
 * @returns {{ decision: 'pass'|'revise'|'kill', blockProgression: boolean, reasons: Object[] }}
 */
export function evaluateKillGate({ overallScore, metrics }) {
  const reasons = [];
  let hasMetricBelowThreshold = false;

  for (const [metric, value] of Object.entries(metrics)) {
    if (value < METRIC_THRESHOLD) {
      hasMetricBelowThreshold = true;
      reasons.push({
        type: 'metric_below_threshold',
        metric,
        message: `${metric} score ${value} is below per-metric threshold ${METRIC_THRESHOLD}`,
        threshold: METRIC_THRESHOLD,
        actual: value,
      });
    }
  }

  // Kill: any metric below 50 OR overall below 50
  if (hasMetricBelowThreshold || overallScore < REVISE_THRESHOLD) {
    if (overallScore < REVISE_THRESHOLD) {
      reasons.push({
        type: 'overall_below_kill_threshold',
        message: `Overall score ${overallScore} is below kill threshold ${REVISE_THRESHOLD}`,
        threshold: REVISE_THRESHOLD,
        actual: overallScore,
      });
    }
    return { decision: 'kill', blockProgression: true, reasons };
  }

  // Revise: overall 50-69 with no single metric below 50
  if (overallScore < PASS_THRESHOLD) {
    reasons.push({
      type: 'overall_in_revise_band',
      message: `Overall score ${overallScore} is in revise band (${REVISE_THRESHOLD}-${PASS_THRESHOLD - 1}). Re-route to Stage 2.`,
      threshold: PASS_THRESHOLD,
      actual: overallScore,
    });
    return { decision: 'revise', blockProgression: true, reasons };
  }

  // Pass: overall ≥ 70 and all metrics ≥ 50
  return { decision: 'pass', blockProgression: false, reasons: [] };
}

TEMPLATE.analysisStep = analyzeStage03;

export { METRICS, PASS_THRESHOLD, REVISE_THRESHOLD, METRIC_THRESHOLD, THREAT_LEVELS };
export default TEMPLATE;
