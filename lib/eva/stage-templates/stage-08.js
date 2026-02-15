/**
 * Stage 08 Template - Business Model Canvas
 * Phase: THE ENGINE (Stages 6-9)
 * Part of SD-LEO-FEAT-TMPL-ENGINE-001
 *
 * All 9 BMC blocks with required completeness checks.
 * Each block contains items[] with text, priority (1-3), and optional evidence.
 *
 * @module lib/eva/stage-templates/stage-08
 */

import { validateArray, validateString, validateInteger, collectErrors, validateCrossStageContract } from './validation.js';
import { analyzeStage08 } from './analysis-steps/stage-08-bmc-generation.js';

const BMC_BLOCKS = [
  'customerSegments',
  'valuePropositions',
  'channels',
  'customerRelationships',
  'revenueStreams',
  'keyResources',
  'keyActivities',
  'keyPartnerships',
  'costStructure',
];

// keyPartnerships requires only 1 item; all others require 2
const MIN_ITEMS = {
  keyPartnerships: 1,
};
const DEFAULT_MIN_ITEMS = 2;

const TEMPLATE = {
  id: 'stage-08',
  slug: 'bmc',
  title: 'Business Model Canvas',
  version: '2.0.0',
  schema: Object.fromEntries(
    BMC_BLOCKS.map(block => [
      block,
      {
        type: 'object',
        required: true,
        items: {
          type: 'array',
          minItems: MIN_ITEMS[block] || DEFAULT_MIN_ITEMS,
          items: {
            text: { type: 'string', minLength: 1, required: true },
            priority: { type: 'integer', min: 1, max: 3, required: true },
            evidence: { type: 'string' },
          },
        },
      },
    ])
  ),
  defaultData: Object.fromEntries(BMC_BLOCKS.map(block => [block, { items: [] }])),

  /**
   * Validate stage input data.
   * @param {Object} data
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(data, prerequisites, { logger = console } = {}) {
    const errors = [];

    // Cross-stage contract: validate stage-07 pricing context if provided
    if (prerequisites?.stage07) {
      const contract = {
        pricing_model: { type: 'string' },
        tiers: { type: 'array', minItems: 1 },
      };
      const crossCheck = validateCrossStageContract(prerequisites.stage07, contract, 'stage-07');
      errors.push(...crossCheck.errors);
    }

    for (const block of BMC_BLOCKS) {
      const blockData = data?.[block];

      if (!blockData || typeof blockData !== 'object') {
        errors.push(`${block} is required and must be an object`);
        continue;
      }

      const minItems = MIN_ITEMS[block] || DEFAULT_MIN_ITEMS;
      const arrCheck = validateArray(blockData.items, `${block}.items`, minItems);
      if (!arrCheck.valid) {
        errors.push(arrCheck.error);
        continue;
      }

      for (let i = 0; i < blockData.items.length; i++) {
        const item = blockData.items[i];
        const prefix = `${block}.items[${i}]`;

        const results = [
          validateString(item?.text, `${prefix}.text`, 1),
          validateInteger(item?.priority, `${prefix}.priority`, 1, 3),
        ];
        errors.push(...collectErrors(results));
      }
    }

    if (errors.length > 0) { logger.warn('[Stage08] Validation failed', { errorCount: errors.length, errors }); }
    return { valid: errors.length === 0, errors };
  },

  /**
   * Compute derived fields: cross_links to related stages.
   * @param {Object} data - Validated input data
   * @returns {Object} Data with cross_links
   */
  computeDerived(data, { logger = console } = {}) {
    const cross_links = [
      { stage_id: 'stage-06', relationship: 'Cost Structure ↔ Risk mitigations' },
      { stage_id: 'stage-07', relationship: 'Revenue Streams ↔ Pricing tiers' },
    ];

    return { ...data, cross_links };
  },
};

TEMPLATE.analysisStep = analyzeStage08;

export { BMC_BLOCKS, MIN_ITEMS, DEFAULT_MIN_ITEMS };
export default TEMPLATE;
