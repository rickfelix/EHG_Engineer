/**
 * Stage 04 Template - Competitive Intel
 * Phase: THE TRUTH (Stages 1-5)
 * Part of SD-EVA-FEAT-TEMPLATES-TRUTH-001
 *
 * Competitive landscape analysis with structured pricing models,
 * SWOT per competitor, and Stage 5 handoff artifact.
 *
 * Cross-stage contracts:
 *   ← Stage 3: competitorEntities (name, positioning, threat_level)
 *   ← Stage 1: description, valueProp, targetMarket
 *   → Stage 5: stage5Handoff (pricingLandscape, competitivePositioning, marketGaps)
 *   → Stage 7: pricing context for pricing strategy
 *
 * @module lib/eva/stage-templates/stage-04
 */

import { validateString, validateArray, validateEnum, collectErrors } from './validation.js';
import { analyzeStage04 } from './analysis-steps/stage-04-competitive-landscape.js';

const THREAT_LEVELS = ['H', 'M', 'L'];

const PRICING_MODELS = [
  'freemium', 'subscription', 'one_time', 'usage_based', 'marketplace_commission', 'hybrid',
];

const TEMPLATE = {
  id: 'stage-04',
  slug: 'competitive-intel',
  title: 'Competitive Intel',
  version: '2.0.0',
  schema: {
    competitors: {
      type: 'array',
      minItems: 1,
      items: {
        name: { type: 'string', required: true },
        position: { type: 'string', required: true },
        threat: { type: 'enum', values: THREAT_LEVELS, required: true },
        pricingModel: { type: 'enum', values: PRICING_MODELS, required: true },
        marketPosition: { type: 'string', required: false },
        strengths: { type: 'array', minItems: 1, items: { type: 'string' } },
        weaknesses: { type: 'array', minItems: 1, items: { type: 'string' } },
        swot: {
          strengths: { type: 'array', minItems: 1, items: { type: 'string' } },
          weaknesses: { type: 'array', minItems: 1, items: { type: 'string' } },
          opportunities: { type: 'array', minItems: 1, items: { type: 'string' } },
          threats: { type: 'array', minItems: 1, items: { type: 'string' } },
        },
      },
    },
    blueOceanAnalysis: {
      type: 'object',
      required: false,
    },
    stage5Handoff: {
      type: 'object',
      derived: true,
      properties: {
        pricingLandscape: { type: 'string' },
        competitivePositioning: { type: 'string' },
        marketGaps: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  defaultData: {
    competitors: [],
    blueOceanAnalysis: null,
    stage5Handoff: null,
  },

  /**
   * Validate stage input data.
   * @param {Object} data
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(data) {
    const errors = [];

    const arrayCheck = validateArray(data?.competitors, 'competitors', 1);
    if (!arrayCheck.valid) {
      return { valid: false, errors: [arrayCheck.error] };
    }

    // Check for duplicate names (case-insensitive)
    const namesSeen = new Map();
    for (let i = 0; i < data.competitors.length; i++) {
      const name = data.competitors[i]?.name;
      if (typeof name === 'string') {
        const lower = name.toLowerCase();
        if (namesSeen.has(lower)) {
          errors.push(
            `Duplicate competitor name '${name}' at indices ${namesSeen.get(lower)} and ${i}. Rename one competitor.`
          );
        } else {
          namesSeen.set(lower, i);
        }
      }
    }

    for (let i = 0; i < data.competitors.length; i++) {
      const c = data.competitors[i];
      const prefix = `competitors[${i}]`;

      const results = [
        validateString(c?.name, `${prefix}.name`, 1),
        validateString(c?.position, `${prefix}.position`, 1),
        validateEnum(c?.threat, `${prefix}.threat`, THREAT_LEVELS),
        validateEnum(c?.pricingModel, `${prefix}.pricingModel`, PRICING_MODELS),
        validateArray(c?.strengths, `${prefix}.strengths`, 1),
        validateArray(c?.weaknesses, `${prefix}.weaknesses`, 1),
      ];
      errors.push(...collectErrors(results));

      // SWOT validation
      if (!c?.swot || typeof c.swot !== 'object') {
        errors.push(`${prefix}.swot is required and must be an object`);
      } else {
        const swotResults = [
          validateArray(c.swot.strengths, `${prefix}.swot.strengths`, 1),
          validateArray(c.swot.weaknesses, `${prefix}.swot.weaknesses`, 1),
          validateArray(c.swot.opportunities, `${prefix}.swot.opportunities`, 1),
          validateArray(c.swot.threats, `${prefix}.swot.threats`, 1),
        ];
        errors.push(...collectErrors(swotResults));
      }
    }

    return { valid: errors.length === 0, errors };
  },

  /**
   * Compute derived fields: stage5Handoff artifact for downstream consumption.
   * @param {Object} data - Validated input data
   * @returns {Object} Data with stage5Handoff
   */
  computeDerived(data) {
    const competitors = data.competitors || [];

    // Build pricing landscape summary
    const pricingModels = competitors.map(c => `${c.name}: ${c.pricingModel}`);
    const pricingLandscape = pricingModels.length > 0
      ? `Pricing models: ${pricingModels.join('; ')}`
      : '';

    // Build competitive positioning summary
    const highThreats = competitors.filter(c => c.threat === 'H');
    const competitivePositioning = highThreats.length > 0
      ? `${highThreats.length} high-threat competitor(s): ${highThreats.map(c => c.name).join(', ')}`
      : 'No high-threat competitors identified';

    // Extract market gaps from competitor weaknesses
    const marketGaps = [];
    for (const c of competitors) {
      if (c.swot?.opportunities) {
        marketGaps.push(...c.swot.opportunities);
      }
    }
    // Deduplicate
    const uniqueGaps = [...new Set(marketGaps)];

    const stage5Handoff = {
      pricingLandscape,
      competitivePositioning,
      marketGaps: uniqueGaps,
    };

    return { ...data, stage5Handoff };
  },
};

TEMPLATE.analysisStep = analyzeStage04;

export { THREAT_LEVELS, PRICING_MODELS };
export default TEMPLATE;
