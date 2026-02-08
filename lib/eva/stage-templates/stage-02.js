/**
 * Stage 02 Template - AI Review
 * Phase: THE TRUTH (Stages 1-5)
 * Part of SD-LEO-FEAT-TMPL-TRUTH-001
 *
 * Stores critiques from multiple AI models/agents and computes
 * a deterministic composite score as the rounded average.
 *
 * @module lib/eva/stage-templates/stage-02
 */

import { validateString, validateInteger, validateArray, collectErrors } from './validation.js';

const TEMPLATE = {
  id: 'stage-02',
  slug: 'ai-review',
  title: 'AI Review',
  version: '1.0.0',
  schema: {
    critiques: {
      type: 'array',
      minItems: 1,
      items: {
        model: { type: 'string', required: true },
        summary: { type: 'string', minLength: 20, required: true },
        strengths: { type: 'array', minItems: 1, items: { type: 'string' } },
        risks: { type: 'array', minItems: 1, items: { type: 'string' } },
        score: { type: 'integer', min: 0, max: 100, required: true },
      },
    },
    compositeScore: { type: 'integer', min: 0, max: 100, derived: true },
  },
  defaultData: {
    critiques: [],
    compositeScore: null,
  },

  /**
   * Validate stage input data.
   * @param {Object} data
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(data) {
    const errors = [];

    const arrayCheck = validateArray(data?.critiques, 'critiques', 1);
    if (!arrayCheck.valid) {
      return { valid: false, errors: [arrayCheck.error] };
    }

    for (let i = 0; i < data.critiques.length; i++) {
      const c = data.critiques[i];
      const prefix = `critiques[${i}]`;
      const results = [
        validateString(c?.model, `${prefix}.model`, 1),
        validateString(c?.summary, `${prefix}.summary`, 20),
        validateArray(c?.strengths, `${prefix}.strengths`, 1),
        validateArray(c?.risks, `${prefix}.risks`, 1),
        validateInteger(c?.score, `${prefix}.score`, 0, 100),
      ];
      errors.push(...collectErrors(results));
    }

    return { valid: errors.length === 0, errors };
  },

  /**
   * Compute derived fields: compositeScore as rounded average of critique scores.
   * Ties round .5 up (Math.round behavior).
   * @param {Object} data - Validated input data
   * @returns {Object} Data with compositeScore
   */
  computeDerived(data) {
    const critiques = data.critiques || [];
    if (critiques.length === 0) {
      return { ...data, compositeScore: null };
    }
    const sum = critiques.reduce((acc, c) => acc + c.score, 0);
    const compositeScore = Math.round(sum / critiques.length);
    return { ...data, compositeScore };
  },
};

export default TEMPLATE;
