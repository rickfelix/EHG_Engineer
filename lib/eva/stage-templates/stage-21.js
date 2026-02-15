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
import { analyzeStage21 } from './analysis-steps/stage-21-build-review.js';

const INTEGRATION_STATUSES = ['pass', 'fail', 'skip', 'pending'];
const REVIEW_DECISIONS = ['approve', 'conditional', 'reject'];
const MIN_INTEGRATIONS = 1;

const TEMPLATE = {
  id: 'stage-21',
  slug: 'integration-testing',
  title: 'Integration Testing',
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

  validate(data) {
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

    return { valid: errors.length === 0, errors };
  },

  computeDerived(data) {
    const total_integrations = data.integrations.length;
    const passing_integrations = data.integrations.filter(ig => ig.status === 'pass').length;
    const failing_integrations = data.integrations
      .filter(ig => ig.status === 'fail')
      .map(ig => ({ name: ig.name, source: ig.source, target: ig.target, error_message: ig.error_message || null }));
    const pass_rate = total_integrations > 0
      ? Math.round((passing_integrations / total_integrations) * 10000) / 100
      : 0;
    const all_passing = failing_integrations.length === 0 && total_integrations > 0;

    // Review decision object
    let reviewDecisionValue;
    if (all_passing) {
      reviewDecisionValue = 'approve';
    } else if (failing_integrations.length > 0 && pass_rate >= 80) {
      reviewDecisionValue = 'conditional';
    } else {
      reviewDecisionValue = 'reject';
    }

    const reviewDecision = {
      decision: reviewDecisionValue,
      rationale: reviewDecisionValue === 'approve'
        ? `All ${total_integrations} integration(s) passing`
        : reviewDecisionValue === 'conditional'
          ? `${pass_rate}% pass rate, ${failing_integrations.length} failing integration(s)`
          : `${failing_integrations.length} integration(s) failing (${pass_rate}% pass rate)`,
    };

    return {
      ...data,
      total_integrations,
      passing_integrations,
      failing_integrations,
      pass_rate,
      all_passing,
      reviewDecision,
    };
  },
};

TEMPLATE.analysisStep = analyzeStage21;

export { INTEGRATION_STATUSES, REVIEW_DECISIONS, MIN_INTEGRATIONS };
export default TEMPLATE;
