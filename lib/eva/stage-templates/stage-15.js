/**
 * Stage 15 Template - Risk Register & Wireframe Generation
 * Phase: THE BLUEPRINT (Stages 13-16)
 * Part of SD-EVA-FIX-STAGE15-RISK-001, SD-MAN-INFRA-WIREFRAME-GENERATOR-STAGE-001
 *
 * Risk identification, severity/priority classification,
 * mitigation planning, and budget coherence validation.
 * Wireframe generation from brand genome + technical architecture.
 *
 * @module lib/eva/stage-templates/stage-15
 */

import { validateString, validateArray, validateEnum, collectErrors } from './validation.js';
import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage15 } from './analysis-steps/stage-15-risk-register.js';
import { analyzeStage15WireframeGenerator } from './analysis-steps/stage-15-wireframe-generator.js';

const MIN_RISKS = 1;
const SEVERITY_ENUM = ['critical', 'high', 'medium', 'low'];
const PRIORITY_ENUM = ['immediate', 'short_term', 'long_term'];

const TEMPLATE = {
  id: 'stage-15',
  slug: 'risk-register',
  title: 'Resource Planning',
  version: '3.0.0',
  schema: {
    risks: {
      type: 'array',
      minItems: MIN_RISKS,
      items: {
        title: { type: 'string', required: true },
        description: { type: 'string', required: true },
        owner: { type: 'string', required: true },
        severity: { type: 'enum', values: SEVERITY_ENUM, required: true },
        priority: { type: 'enum', values: PRIORITY_ENUM, required: true },
        phaseRef: { type: 'string' },
        mitigationPlan: { type: 'string', required: true },
        contingencyPlan: { type: 'string' },
      },
    },
    // Derived
    total_risks: { type: 'number', derived: true },
    severity_breakdown: { type: 'object', derived: true },
    budget_coherence: { type: 'object', derived: true },
  },
  defaultData: {
    risks: [],
    total_risks: 0,
    severity_breakdown: { critical: 0, high: 0, medium: 0, low: 0 },
    budget_coherence: { aligned: false, notes: '' },
  },

  /**
   * Validate stage input data.
   * @param {Object} data
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(data, { logger = console } = {}) {
    const errors = [];

    if (!data || typeof data !== 'object') {
      return { valid: false, errors: ['data is required and must be an object'] };
    }

    // Risks array
    const risksCheck = validateArray(data?.risks, 'risks', MIN_RISKS);
    if (!risksCheck.valid) {
      errors.push(risksCheck.error);
    } else {
      for (let i = 0; i < data.risks.length; i++) {
        const risk = data.risks[i];
        const prefix = `risks[${i}]`;
        const results = [
          validateString(risk?.title, `${prefix}.title`, 1),
          validateString(risk?.description, `${prefix}.description`, 1),
          validateString(risk?.owner, `${prefix}.owner`, 1),
          validateString(risk?.mitigationPlan, `${prefix}.mitigationPlan`, 1),
        ];
        errors.push(...collectErrors(results));

        // Severity enum
        if (risk?.severity !== undefined) {
          const sevCheck = validateEnum(risk.severity, `${prefix}.severity`, SEVERITY_ENUM);
          if (!sevCheck.valid) errors.push(sevCheck.error);
        } else {
          errors.push(`${prefix}.severity is required`);
        }

        // Priority enum
        if (risk?.priority !== undefined) {
          const priCheck = validateEnum(risk.priority, `${prefix}.priority`, PRIORITY_ENUM);
          if (!priCheck.valid) errors.push(priCheck.error);
        } else {
          errors.push(`${prefix}.priority is required`);
        }
      }
    }

    if (errors.length > 0) { logger.warn('[Stage15] Validation failed', { errorCount: errors.length, errors }); }
    return { valid: errors.length === 0, errors };
  },

  /**
   * Compute derived fields.
   * @param {Object} data - Validated input data
   * @param {Object} [stage16Data] - Optional Stage 16 financial data for budget coherence cross-validation
   * @returns {Object} Data with derived fields
   */
  computeDerived(data, _stage16Data, { logger: _logger = console } = {}) {
    // Dead code: all derivations handled by analysisStep.
    return { ...data };
  },
};

TEMPLATE.outputSchema = extractOutputSchema(TEMPLATE.schema);

TEMPLATE.analysisStep = async function stage15Multiplexer(ctx) {
  const logger = ctx.logger || console;

  // Sub-step 1: Risk register (always runs)
  const riskResult = await analyzeStage15(ctx);

  // Sub-step 2: Wireframe generation (conditional on Stage 10 brand data)
  let wireframeResult = null;
  if (ctx.stage10Data?.customerPersonas?.length > 0 && ctx.stage10Data?.brandGenome) {
    try {
      wireframeResult = await analyzeStage15WireframeGenerator(ctx);
      logger.log('[Stage15] Wireframe generation complete', {
        screenCount: wireframeResult?.screens?.length || 0,
      });
    } catch (err) {
      logger.warn('[Stage15] Wireframe generation failed (non-fatal)', { error: err.message });
    }
  } else {
    logger.log('[Stage15] Skipping wireframes — Stage 10 brand data not available');
  }

  return { ...riskResult, wireframes: wireframeResult };
};

ensureOutputSchema(TEMPLATE);

export { MIN_RISKS, SEVERITY_ENUM, PRIORITY_ENUM };
export default TEMPLATE;
