/**
 * Stage 23 Template - Marketing Preparation
 * Phase: THE LAUNCH (Stages 23-25)
 * Part of SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-B
 *
 * Creates marketing material SDs via lifecycle-sd-bridge
 * when a venture reaches launch phase (Stage 22 release confirmed).
 *
 * Replaces the former Launch Execution template (moved to Stage 25).
 *
 * @module lib/eva/stage-templates/stage-23
 */

import { validateString, validateArray, validateNumber, collectErrors } from './validation.js';
import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage23 } from './analysis-steps/stage-23-marketing-prep.js';

const MARKETING_ITEM_TYPES = [
  'landing_page', 'social_media_campaign', 'press_release',
  'email_campaign', 'content_blog', 'video_promo', 'ad_creative',
  'product_demo', 'case_study', 'launch_announcement',
];

const MARKETING_PRIORITIES = ['critical', 'high', 'medium', 'low'];
const MIN_MARKETING_ITEMS = 3;

const TEMPLATE = {
  id: 'stage-23',
  slug: 'marketing-preparation',
  title: 'Marketing Preparation',
  version: '2.0.0',
  schema: {
    marketing_items: {
      type: 'array',
      minItems: MIN_MARKETING_ITEMS,
      required: true,
      items: {
        title: { type: 'string', required: true },
        description: { type: 'string', required: true },
        type: { type: 'enum', values: MARKETING_ITEM_TYPES, required: true },
        priority: { type: 'enum', values: MARKETING_PRIORITIES, required: true },
      },
    },
    sd_bridge_payloads: {
      type: 'array',
      items: {
        title: { type: 'string', required: true },
        type: { type: 'string', required: true },
        description: { type: 'string' },
        scope: { type: 'string' },
      },
    },
    marketing_sds: {
      type: 'array',
      items: {
        sd_key: { type: 'string', required: true },
        title: { type: 'string', required: true },
        type: { type: 'string', required: true },
        status: { type: 'string', required: true },
      },
    },
    marketing_strategy_summary: { type: 'string', minLength: 10 },
    target_audience: { type: 'string', minLength: 5 },
    // Derived
    marketing_readiness_pct: { type: 'number', derived: true },
    total_marketing_items: { type: 'number', derived: true },
    sds_created_count: { type: 'number', derived: true },
  },
  defaultData: {
    marketing_items: [],
    sd_bridge_payloads: [],
    marketing_sds: [],
    marketing_strategy_summary: null,
    target_audience: null,
    marketing_readiness_pct: 0,
    total_marketing_items: 0,
    sds_created_count: 0,
  },

  validate(data, { logger = console } = {}) {
    const errors = [];

    const itemsCheck = validateArray(data?.marketing_items, 'marketing_items', MIN_MARKETING_ITEMS);
    if (!itemsCheck.valid) {
      errors.push(itemsCheck.error);
    } else {
      for (let i = 0; i < data.marketing_items.length; i++) {
        const item = data.marketing_items[i];
        const prefix = `marketing_items[${i}]`;
        const results = [
          validateString(item?.title, `${prefix}.title`, 1),
          validateString(item?.description, `${prefix}.description`, 1),
        ];
        errors.push(...collectErrors(results));

        if (item?.type && !MARKETING_ITEM_TYPES.includes(item.type)) {
          errors.push(`${prefix}.type must be one of [${MARKETING_ITEM_TYPES.join(', ')}] (got '${item.type}')`);
        }
        if (item?.priority && !MARKETING_PRIORITIES.includes(item.priority)) {
          errors.push(`${prefix}.priority must be one of [${MARKETING_PRIORITIES.join(', ')}] (got '${item.priority}')`);
        }
      }
    }

    const summaryCheck = validateString(data?.marketing_strategy_summary, 'marketing_strategy_summary', 10);
    if (!summaryCheck.valid) errors.push(summaryCheck.error);

    if (errors.length > 0) { logger.warn('[Stage23] Validation failed', { errorCount: errors.length, errors }); }
    return { valid: errors.length === 0, errors };
  },

  computeDerived(data, _prerequisites, { logger: _logger = console } = {}) {
    // Dead code: all derivations handled by analysisStep.
    return { ...data };
  },
};

/**
 * Pure function: check Stage 22 release readiness prerequisite.
 *
 * @param {{ stage22Data?: Object }} params
 * @returns {{ ready: boolean, reasons: string[] }}
 */
export function checkReleaseReadiness({ stage22Data }) {
  const reasons = [];

  if (!stage22Data) {
    reasons.push('Stage 22 release readiness data not available');
    return { ready: false, reasons };
  }

  // Check promotion gate
  if (!stage22Data.promotion_gate?.pass) {
    reasons.push('Stage 22 promotion gate has not passed');
  }

  // Check release decision
  if (stage22Data.releaseDecision) {
    const rd = stage22Data.releaseDecision;
    if (rd.decision !== 'release' && rd.decision !== 'approved') {
      reasons.push(`Stage 22 release decision is '${rd.decision}', not 'release'`);
    }
  } else {
    reasons.push('Stage 22 release decision not found');
  }

  return { ready: reasons.length === 0, reasons };
}

TEMPLATE.outputSchema = extractOutputSchema(TEMPLATE.schema);
TEMPLATE.analysisStep = analyzeStage23;
ensureOutputSchema(TEMPLATE);

export { MARKETING_ITEM_TYPES, MARKETING_PRIORITIES, MIN_MARKETING_ITEMS };
export default TEMPLATE;
