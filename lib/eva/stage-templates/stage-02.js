/**
 * Stage 02 Template - Idea Validation (MoA Multi-Persona Analysis)
 * Phase: THE TRUTH (Stages 1-5)
 * Part of SD-EVA-FEAT-TEMPLATES-TRUTH-001
 *
 * MoA (Mixture of Agents) multi-persona analysis producing 7 pre-scores
 * aligned with Stage 3 metrics. Does NOT make gate decisions — feeds Stage 3.
 *
 * Cross-stage contracts:
 *   ← Stage 1: description, problemStatement, valueProp, targetMarket, archetype, keyAssumptions
 *   → Stage 3: 7 pre-scores (0-100 integer), evidence packs per domain
 *
 * @module lib/eva/stage-templates/stage-02
 */

import { validateString, validateInteger, validateArray, validateEnum, collectErrors, validateCrossStageContract } from './validation.js';
import { extractOutputSchema } from './output-schema-extractor.js';
import { analyzeStage02 } from './analysis-steps/stage-02-multi-persona.js';
import { ensureOutputSchema } from './output-schema-extractor.js';

const METRIC_NAMES = [
  'marketFit', 'customerNeed', 'momentum',
  'revenuePotential', 'competitiveBarrier', 'executionFeasibility',
  'designQuality',
];

const SUGGESTION_TYPES = ['immediate', 'strategic'];

const TEMPLATE = {
  id: 'stage-02',
  slug: 'idea-validation',
  title: 'Idea Analysis',
  version: '2.0.0',
  schema: {
    analysis: {
      type: 'object',
      required: true,
      properties: {
        strategic: { type: 'string', minLength: 20, required: true },
        technical: { type: 'string', minLength: 20, required: true },
        tactical: { type: 'string', minLength: 20, required: true },
      },
    },
    metrics: {
      type: 'object',
      required: true,
      properties: Object.fromEntries(
        METRIC_NAMES.map(m => [m, { type: 'integer', min: 0, max: 100, required: true }])
      ),
    },
    evidence: {
      type: 'object',
      required: true,
      properties: {
        market: { type: 'string', required: true },
        customer: { type: 'string', required: true },
        competitive: { type: 'string', required: true },
        execution: { type: 'string', required: true },
        design: { type: 'string', required: true },
      },
    },
    suggestions: {
      type: 'array',
      minItems: 0,
      items: {
        type: { type: 'enum', values: SUGGESTION_TYPES, required: true },
        text: { type: 'string', minLength: 10, required: true },
      },
    },
    compositeScore: { type: 'integer', min: 0, max: 100, derived: true },
    provenance: {
      type: 'object',
      required: false,
      properties: {
        promptHash: { type: 'string' },
        modelVersion: { type: 'string' },
        temperature: { type: 'number' },
        seed: { type: 'number' },
      },
    },
  },
  defaultData: {
    analysis: { strategic: '', technical: '', tactical: '' },
    metrics: Object.fromEntries(METRIC_NAMES.map(m => [m, null])),
    evidence: { market: '', customer: '', competitive: '', execution: '', design: '' },
    suggestions: [],
    compositeScore: null,
    provenance: {},
  },

  /**
   * Validate stage input data.
   * @param {Object} data
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(data, prerequisites, { logger = console } = {}) {
    const errors = [];

    // Cross-stage contract: validate stage-01 outputs if provided
    if (prerequisites?.stage01) {
      const contract = {
        description: { type: 'string', minLength: 50 },
        problemStatement: { type: 'string', minLength: 20 },
        valueProp: { type: 'string', minLength: 20 },
        targetMarket: { type: 'string', minLength: 10 },
        archetype: { type: 'string' },
      };
      const crossCheck = validateCrossStageContract(prerequisites.stage01, contract, 'stage-01');
      errors.push(...crossCheck.errors);
    }

    // Validate analysis perspectives
    if (!data?.analysis || typeof data.analysis !== 'object') {
      errors.push('analysis is required and must be an object');
    } else {
      for (const perspective of ['strategic', 'technical', 'tactical']) {
        const r = validateString(data.analysis[perspective], `analysis.${perspective}`, 20);
        if (!r.valid) errors.push(r.error);
      }
    }

    // Validate 6 metrics (0-100 integer)
    if (!data?.metrics || typeof data.metrics !== 'object') {
      errors.push('metrics is required and must be an object');
    } else {
      for (const metric of METRIC_NAMES) {
        const r = validateInteger(data.metrics[metric], `metrics.${metric}`, 0, 100);
        if (!r.valid) errors.push(r.error);
      }
    }

    // Validate evidence domains
    if (!data?.evidence || typeof data.evidence !== 'object') {
      errors.push('evidence is required and must be an object');
    } else {
      for (const domain of ['market', 'customer', 'competitive', 'execution', 'design']) {
        const r = validateString(data.evidence[domain], `evidence.${domain}`, 1);
        if (!r.valid) errors.push(r.error);
      }
    }

    // Validate suggestions (optional but must be well-formed if present)
    if (data?.suggestions !== undefined && data.suggestions !== null) {
      if (!Array.isArray(data.suggestions)) {
        errors.push('suggestions must be an array');
      } else {
        for (let i = 0; i < data.suggestions.length; i++) {
          const s = data.suggestions[i];
          const prefix = `suggestions[${i}]`;
          const typeCheck = validateEnum(s?.type, `${prefix}.type`, SUGGESTION_TYPES);
          if (!typeCheck.valid) errors.push(typeCheck.error);
          const textCheck = validateString(s?.text, `${prefix}.text`, 10);
          if (!textCheck.valid) errors.push(textCheck.error);
        }
      }
    }

    if (errors.length > 0) { logger.warn('[Stage02] Validation failed', { errorCount: errors.length, errors }); }
    return { valid: errors.length === 0, errors };
  },

  /**
   * Compute derived fields: compositeScore as rounded average of 6 metrics.
   * @param {Object} data - Validated input data
   * @returns {Object} Data with compositeScore
   */
  computeDerived(data, { logger = console } = {}) {
    const metrics = data.metrics || {};
    const scores = METRIC_NAMES.map(m => metrics[m]).filter(v => Number.isInteger(v));

    if (scores.length === 0) {
      return { ...data, compositeScore: null };
    }

    const sum = scores.reduce((acc, s) => acc + s, 0);
    const compositeScore = Math.round(sum / scores.length);
    return { ...data, compositeScore };
  },
};

TEMPLATE.outputSchema = extractOutputSchema(TEMPLATE.schema);
TEMPLATE.analysisStep = analyzeStage02;
ensureOutputSchema(TEMPLATE);

export { METRIC_NAMES, SUGGESTION_TYPES };
export default TEMPLATE;
