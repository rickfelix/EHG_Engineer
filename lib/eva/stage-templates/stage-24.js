/**
 * Stage 24 Template - Metrics & Learning
 * Phase: LAUNCH & LEARN (Stages 23-25)
 * Part of SD-LEO-FEAT-TMPL-LAUNCH-001
 *
 * AARRR framework metrics (Acquisition, Activation, Retention,
 * Revenue, Referral) with trend windows and funnel definitions.
 *
 * @module lib/eva/stage-templates/stage-24
 */

import { validateString, validateNumber, validateArray, collectErrors } from './validation.js';
import { analyzeStage24 } from './analysis-steps/stage-24-metrics-learning.js';

const AARRR_CATEGORIES = ['acquisition', 'activation', 'retention', 'revenue', 'referral'];
const TREND_DIRECTIONS = ['up', 'down', 'flat'];
const IMPACT_LEVELS = ['high', 'medium', 'low'];
const MIN_METRICS_PER_CATEGORY = 1;
const MIN_FUNNELS = 1;

const TEMPLATE = {
  id: 'stage-24',
  slug: 'metrics-learning',
  title: 'Metrics & Learning',
  version: '1.0.0',
  schema: {
    aarrr: {
      type: 'object',
      required: true,
      properties: Object.fromEntries(AARRR_CATEGORIES.map(cat => [cat, {
        type: 'array',
        minItems: MIN_METRICS_PER_CATEGORY,
        items: {
          name: { type: 'string', required: true },
          value: { type: 'number', required: true },
          target: { type: 'number', required: true },
          previousValue: { type: 'number' },
          trendDirection: { type: 'enum', values: TREND_DIRECTIONS },
          trend_window_days: { type: 'number', min: 1 },
        },
      }])),
    },
    funnels: {
      type: 'array',
      minItems: MIN_FUNNELS,
      items: {
        name: { type: 'string', required: true },
        steps: { type: 'array', minItems: 2 },
      },
    },
    learnings: {
      type: 'array',
      items: {
        insight: { type: 'string', required: true },
        action: { type: 'string', required: true },
        category: { type: 'string' },
        impactLevel: { type: 'enum', values: IMPACT_LEVELS },
      },
    },
    // Derived
    total_metrics: { type: 'number', derived: true },
    categories_complete: { type: 'boolean', derived: true },
    funnel_count: { type: 'number', derived: true },
    metrics_on_target: { type: 'number', derived: true },
    metrics_below_target: { type: 'number', derived: true },
    launchOutcome: { type: 'object', derived: true },
  },
  defaultData: {
    aarrr: {},
    funnels: [],
    learnings: [],
    total_metrics: 0,
    categories_complete: false,
    funnel_count: 0,
    metrics_on_target: 0,
    metrics_below_target: 0,
    launchOutcome: null,
  },

  validate(data, { logger = console } = {}) {
    const errors = [];

    if (!data?.aarrr || typeof data.aarrr !== 'object') {
      errors.push('aarrr is required and must be an object');
      return { valid: false, errors };
    }

    for (const cat of AARRR_CATEGORIES) {
      const metrics = data.aarrr[cat];
      const arrCheck = validateArray(metrics, `aarrr.${cat}`, MIN_METRICS_PER_CATEGORY);
      if (!arrCheck.valid) {
        errors.push(arrCheck.error);
        continue;
      }
      for (let i = 0; i < metrics.length; i++) {
        const m = metrics[i];
        const prefix = `aarrr.${cat}[${i}]`;
        const results = [
          validateString(m?.name, `${prefix}.name`, 1),
          validateNumber(m?.value, `${prefix}.value`, 0),
          validateNumber(m?.target, `${prefix}.target`, 0),
        ];
        errors.push(...collectErrors(results));
      }
    }

    const funnelCheck = validateArray(data?.funnels, 'funnels', MIN_FUNNELS);
    if (!funnelCheck.valid) {
      errors.push(funnelCheck.error);
    } else {
      for (let i = 0; i < data.funnels.length; i++) {
        const f = data.funnels[i];
        const prefix = `funnels[${i}]`;
        const nameCheck = validateString(f?.name, `${prefix}.name`, 1);
        if (!nameCheck.valid) errors.push(nameCheck.error);
        const stepsCheck = validateArray(f?.steps, `${prefix}.steps`, 2);
        if (!stepsCheck.valid) errors.push(stepsCheck.error);
      }
    }

    if (data?.learnings && Array.isArray(data.learnings)) {
      for (let i = 0; i < data.learnings.length; i++) {
        const l = data.learnings[i];
        const prefix = `learnings[${i}]`;
        const results = [
          validateString(l?.insight, `${prefix}.insight`, 1),
          validateString(l?.action, `${prefix}.action`, 1),
        ];
        errors.push(...collectErrors(results));
      }
    }

    if (errors.length > 0) { logger.warn('[Stage24] Validation failed', { errorCount: errors.length, errors }); }
    return { valid: errors.length === 0, errors };
  },

  computeDerived(data, { logger = console } = {}) {
    let total_metrics = 0;
    let metrics_on_target = 0;
    let metrics_below_target = 0;
    let categoriesPresent = 0;

    for (const cat of AARRR_CATEGORIES) {
      const metrics = data.aarrr[cat] || [];
      if (metrics.length > 0) categoriesPresent++;
      total_metrics += metrics.length;
      for (const m of metrics) {
        if (m.value >= m.target) metrics_on_target++;
        else metrics_below_target++;
      }
    }

    const categories_complete = categoriesPresent === AARRR_CATEGORIES.length;
    const funnel_count = (data.funnels || []).length;

    // Launch outcome assessment
    const criteriaMetRate = total_metrics > 0
      ? Math.round((metrics_on_target / total_metrics) * 10000) / 100
      : 0;
    let assessment;
    if (criteriaMetRate >= 80) {
      assessment = 'successful';
    } else if (criteriaMetRate >= 50) {
      assessment = 'partial';
    } else {
      assessment = 'underperforming';
    }
    const launchOutcome = {
      assessment,
      criteriaMetRate,
    };

    return {
      ...data,
      total_metrics,
      categories_complete,
      funnel_count,
      metrics_on_target,
      metrics_below_target,
      launchOutcome,
    };
  },
};

TEMPLATE.analysisStep = analyzeStage24;

export { AARRR_CATEGORIES, TREND_DIRECTIONS, IMPACT_LEVELS, MIN_METRICS_PER_CATEGORY, MIN_FUNNELS };
export default TEMPLATE;
