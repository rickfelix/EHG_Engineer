/**
 * Stage 06 Template - Risk Matrix
 * Phase: THE ENGINE (Stages 6-9)
 * Part of SD-EVA-FEAT-TEMPLATES-ENGINE-001
 *
 * Structured risk register with category, severity, probability, impact,
 * computed score, mitigations, and residual risk scoring.
 *
 * @module lib/eva/stage-templates/stage-06
 */

import { validateString, validateInteger, validateArray, validateEnum, collectErrors, validateCrossStageContract } from './validation.js';
import { extractOutputSchema } from './output-schema-extractor.js';
import { analyzeStage06 } from './analysis-steps/stage-06-risk-matrix.js';

const RISK_CATEGORIES = [
  'Market',
  'Product',
  'Technical',
  'Legal/Compliance',
  'Financial',
  'Operational',
];

const RISK_STATUSES = ['open', 'mitigated', 'accepted', 'closed'];

const TEMPLATE = {
  id: 'stage-06',
  slug: 'risk-matrix',
  title: 'Risk Assessment',
  version: '2.0.0',
  schema: {
    risks: {
      type: 'array',
      minItems: 1,
      items: {
        id: { type: 'string', required: true },
        category: { type: 'enum', values: RISK_CATEGORIES, required: true },
        description: { type: 'string', minLength: 10, required: true },
        severity: { type: 'integer', min: 1, max: 5, required: true },
        probability: { type: 'integer', min: 1, max: 5, required: true },
        impact: { type: 'integer', min: 1, max: 5, required: true },
        score: { type: 'integer', derived: true },
        mitigation: { type: 'string', minLength: 10, required: true },
        owner: { type: 'string', required: true },
        status: { type: 'enum', values: RISK_STATUSES, required: true },
        review_date: { type: 'string', required: true },
        residual_severity: { type: 'integer', min: 1, max: 5 },
        residual_probability: { type: 'integer', min: 1, max: 5 },
        residual_impact: { type: 'integer', min: 1, max: 5 },
        residual_score: { type: 'integer', derived: true },
      },
    },
    // Derived (aggregate)
    aggregate_risk_score: { type: 'number', derived: true },
    normalized_risk_score: { type: 'number', derived: true },
    highest_risk_factor: { type: 'string', derived: true },
    mitigation_coverage_pct: { type: 'number', derived: true },
  },
  defaultData: {
    risks: [],
    aggregate_risk_score: 0,
    normalized_risk_score: 0,
    highest_risk_factor: null,
    mitigation_coverage_pct: 0,
  },

  /**
   * Validate stage input data.
   * @param {Object} data
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(data, prerequisites, { logger = console } = {}) {
    const errors = [];

    // Cross-stage contract: validate stage-05 outputs if provided
    if (prerequisites?.stage05) {
      const contract = {
        unitEconomics: { type: 'object' },
      };
      const crossCheck = validateCrossStageContract(prerequisites.stage05, contract, 'stage-05');
      errors.push(...crossCheck.errors);
    }

    const arrayCheck = validateArray(data?.risks, 'risks', 1);
    if (!arrayCheck.valid) {
      return { valid: false, errors: [arrayCheck.error, ...errors] };
    }

    for (let i = 0; i < data.risks.length; i++) {
      const r = data.risks[i];
      const prefix = `risks[${i}]`;

      const results = [
        validateString(r?.id, `${prefix}.id`, 1),
        validateEnum(r?.category, `${prefix}.category`, RISK_CATEGORIES),
        validateString(r?.description, `${prefix}.description`, 10),
        validateInteger(r?.severity, `${prefix}.severity`, 1, 5),
        validateInteger(r?.probability, `${prefix}.probability`, 1, 5),
        validateInteger(r?.impact, `${prefix}.impact`, 1, 5),
        validateString(r?.mitigation, `${prefix}.mitigation`, 10),
        validateString(r?.owner, `${prefix}.owner`, 1),
        validateEnum(r?.status, `${prefix}.status`, RISK_STATUSES),
        validateString(r?.review_date, `${prefix}.review_date`, 1),
      ];
      errors.push(...collectErrors(results));

      // Validate optional residual fields if any are present
      if (r?.residual_severity !== undefined || r?.residual_probability !== undefined || r?.residual_impact !== undefined) {
        const residualResults = [
          r?.residual_severity !== undefined ? validateInteger(r.residual_severity, `${prefix}.residual_severity`, 1, 5) : { valid: true },
          r?.residual_probability !== undefined ? validateInteger(r.residual_probability, `${prefix}.residual_probability`, 1, 5) : { valid: true },
          r?.residual_impact !== undefined ? validateInteger(r.residual_impact, `${prefix}.residual_impact`, 1, 5) : { valid: true },
        ];
        errors.push(...collectErrors(residualResults));
      }
    }

    if (errors.length > 0) { logger.warn('[Stage06] Validation failed', { errorCount: errors.length, errors }); }
    return { valid: errors.length === 0, errors };
  },

  /**
   * Compute derived fields: score and residual_score per risk.
   * score = severity * probability * impact
   * @param {Object} data - Validated input data
   * @returns {Object} Data with computed scores
   */
  computeDerived(data, { logger = console } = {}) {
    const risks = data.risks.map(r => {
      const score = r.severity * r.probability * r.impact;
      const result = { ...r, score };

      if (r.residual_severity !== undefined && r.residual_probability !== undefined && r.residual_impact !== undefined) {
        result.residual_score = r.residual_severity * r.residual_probability * r.residual_impact;
      }

      return result;
    });

    // Aggregate metrics
    const aggregate_risk_score = risks.length > 0
      ? Math.round(risks.reduce((sum, r) => sum + r.score, 0) / risks.length)
      : 0;

    let highest_risk_factor = null;
    if (risks.length > 0) {
      const sorted = [...risks].sort((a, b) => b.score - a.score);
      highest_risk_factor = sorted[0].category || sorted[0].id;
    }

    const mitigated = risks.filter(r => r.status === 'mitigated' || r.status === 'closed').length;
    const mitigation_coverage_pct = risks.length > 0
      ? Math.round((mitigated / risks.length) * 10000) / 100
      : 0;

    // Normalized score on 0-10 scale for decision-filter-engine compatibility
    // Original aggregate_risk_score is on 1-125 scale (severity*probability*impact, each 1-5)
    const normalized_risk_score = aggregate_risk_score > 0
      ? Math.round(((aggregate_risk_score - 1) / 124) * 10 * 100) / 100
      : 0;

    return { ...data, risks, aggregate_risk_score, normalized_risk_score, highest_risk_factor, mitigation_coverage_pct };
  },
};

TEMPLATE.outputSchema = extractOutputSchema(TEMPLATE.schema);
TEMPLATE.analysisStep = analyzeStage06;

export { RISK_CATEGORIES, RISK_STATUSES };
export default TEMPLATE;
