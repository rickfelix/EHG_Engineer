/**
 * Stage 21 Template - Integration Testing
 * Phase: THE BUILD LOOP (Stages 17-22)
 * Part of SD-LEO-FEAT-TMPL-BUILD-001
 *
 * Integration testing results across system boundaries,
 * with pass/fail tracking per integration point.
 *
 * @module lib/eva/stage-templates/stage-21
 */

import { validateString, validateArray, validateEnum, collectErrors } from './validation.js';
import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage22 as analyzeStage21 } from './analysis-steps/stage-22-build-review.js';

const INTEGRATION_STATUSES = ['pass', 'fail', 'skip', 'pending'];
const REVIEW_DECISIONS = ['approve', 'conditional', 'reject'];
const MIN_INTEGRATIONS = 1;

const TEMPLATE = {
  id: 'stage-21',
  slug: 'integration-testing',
  title: 'Build Review',
  version: '2.0.0',
  schema: {
    integrations: {
      type: 'array',
      minItems: MIN_INTEGRATIONS,
      items: {
        name: { type: 'string', required: true },
        source: { type: 'string', required: true },
        target: { type: 'string', required: true },
        status: { type: 'enum', values: INTEGRATION_STATUSES, required: true },
        error_message: { type: 'string' },
      },
    },
    environment: {
      type: 'string',
      required: true,
    },
    // Derived
    total_integrations: { type: 'number', derived: true },
    passing_integrations: { type: 'number', derived: true },
    failing_integrations: { type: 'array', derived: true },
    pass_rate: { type: 'number', derived: true },
    all_passing: { type: 'boolean', derived: true },
    reviewDecision: { type: 'object', derived: true },
  },
  defaultData: {
    integrations: [],
    environment: null,
    total_integrations: 0,
    passing_integrations: 0,
    failing_integrations: [],
    pass_rate: 0,
    all_passing: false,
    reviewDecision: null,
  },

  validate(data, { logger = console } = {}) {
    const errors = [];

    const envCheck = validateString(data?.environment, 'environment', 1);
    if (!envCheck.valid) errors.push(envCheck.error);

    const intCheck = validateArray(data?.integrations, 'integrations', MIN_INTEGRATIONS);
    if (!intCheck.valid) {
      errors.push(intCheck.error);
    } else {
      for (let i = 0; i < data.integrations.length; i++) {
        const ig = data.integrations[i];
        const prefix = `integrations[${i}]`;
        const results = [
          validateString(ig?.name, `${prefix}.name`, 1),
          validateString(ig?.source, `${prefix}.source`, 1),
          validateString(ig?.target, `${prefix}.target`, 1),
          validateEnum(ig?.status, `${prefix}.status`, INTEGRATION_STATUSES),
        ];
        errors.push(...collectErrors(results));
      }
    }

    if (errors.length > 0) { logger.warn('[Stage21] Validation failed', { errorCount: errors.length, errors }); }
    return { valid: errors.length === 0, errors };
  },

  computeDerived(data, { logger: _logger = console } = {}) {
    // Dead code: all derivations handled by analysisStep.
    return { ...data };
  },
};

TEMPLATE.outputSchema = extractOutputSchema(TEMPLATE.schema);
TEMPLATE.analysisStep = analyzeStage21;
ensureOutputSchema(TEMPLATE);

export { INTEGRATION_STATUSES, REVIEW_DECISIONS, MIN_INTEGRATIONS };
export default TEMPLATE;
