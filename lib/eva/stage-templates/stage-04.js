/**
 * Stage 04 Template - Competitive Intel
 * Phase: THE TRUTH (Stages 1-5)
 * Part of SD-LEO-FEAT-TMPL-TRUTH-001
 *
 * Captures competitor cards with positioning, threat level,
 * strengths/weaknesses, and SWOT analysis per competitor.
 *
 * @module lib/eva/stage-templates/stage-04
 */

import { validateString, validateArray, validateEnum, collectErrors } from './validation.js';

const THREAT_LEVELS = ['H', 'M', 'L'];

const TEMPLATE = {
  id: 'stage-04',
  slug: 'competitive-intel',
  title: 'Competitive Intel',
  version: '1.0.0',
  schema: {
    competitors: {
      type: 'array',
      minItems: 1,
      items: {
        name: { type: 'string', required: true },
        position: { type: 'string', required: true },
        threat: { type: 'enum', values: ['H', 'M', 'L'], required: true },
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
  },
  defaultData: {
    competitors: [],
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
   * Compute derived fields (none for Stage 04).
   * @param {Object} data - Validated input data
   * @returns {Object} Data unchanged
   */
  computeDerived(data) {
    return { ...data };
  },
};

export { THREAT_LEVELS };
export default TEMPLATE;
