/**
 * Stage 10 Template - Naming / Brand
 * Phase: THE IDENTITY (Stages 10-12)
 * Part of SD-LEO-FEAT-TMPL-IDENTITY-001
 *
 * Brand genome inputs and naming candidates with weighted scoring.
 * Weights must sum to exactly 100. Minimum 5 candidates required.
 *
 * @module lib/eva/stage-templates/stage-10
 */

import { validateString, validateNumber, validateArray, validateInteger, collectErrors } from './validation.js';

const MIN_CANDIDATES = 5;
const WEIGHT_SUM = 100;
const BRAND_GENOME_KEYS = ['archetype', 'values', 'tone', 'audience', 'differentiators'];

const TEMPLATE = {
  id: 'stage-10',
  slug: 'naming-brand',
  title: 'Naming / Brand',
  version: '1.0.0',
  schema: {
    brandGenome: {
      type: 'object',
      required: true,
      fields: {
        archetype: { type: 'string', required: true },
        values: { type: 'array', minItems: 1 },
        tone: { type: 'string', required: true },
        audience: { type: 'string', required: true },
        differentiators: { type: 'array', minItems: 1 },
      },
    },
    scoringCriteria: {
      type: 'array',
      minItems: 1,
      items: {
        name: { type: 'string', required: true },
        weight: { type: 'number', min: 0, max: 100, required: true },
      },
    },
    candidates: {
      type: 'array',
      minItems: MIN_CANDIDATES,
      items: {
        name: { type: 'string', required: true },
        rationale: { type: 'string', required: true },
        scores: { type: 'object', required: true },
        weighted_score: { type: 'number', derived: true },
      },
    },
    // Derived
    ranked_candidates: { type: 'array', derived: true },
  },
  defaultData: {
    brandGenome: {
      archetype: null,
      values: [],
      tone: null,
      audience: null,
      differentiators: [],
    },
    scoringCriteria: [],
    candidates: [],
    ranked_candidates: [],
  },

  /**
   * Validate stage input data.
   * @param {Object} data
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(data) {
    const errors = [];

    // Brand genome
    const bg = data?.brandGenome;
    if (!bg || typeof bg !== 'object') {
      errors.push('brandGenome is required and must be an object');
    } else {
      for (const key of BRAND_GENOME_KEYS) {
        if (Array.isArray(bg[key])) {
          const arrCheck = validateArray(bg[key], `brandGenome.${key}`, 1);
          if (!arrCheck.valid) errors.push(arrCheck.error);
        } else {
          const strCheck = validateString(bg[key], `brandGenome.${key}`, 1);
          if (!strCheck.valid) errors.push(strCheck.error);
        }
      }
    }

    // Scoring criteria
    const criteriaCheck = validateArray(data?.scoringCriteria, 'scoringCriteria', 1);
    if (!criteriaCheck.valid) {
      errors.push(criteriaCheck.error);
    } else {
      let weightSum = 0;
      for (let i = 0; i < data.scoringCriteria.length; i++) {
        const c = data.scoringCriteria[i];
        const prefix = `scoringCriteria[${i}]`;
        const results = [
          validateString(c?.name, `${prefix}.name`, 1),
          validateNumber(c?.weight, `${prefix}.weight`, 0),
        ];
        errors.push(...collectErrors(results));
        if (typeof c?.weight === 'number') {
          if (c.weight > 100) errors.push(`${prefix}.weight must be <= 100 (got ${c.weight})`);
          weightSum += c.weight;
        }
      }
      if (Math.abs(weightSum - WEIGHT_SUM) > 0.001) {
        errors.push(`Scoring criteria weights must sum to ${WEIGHT_SUM} (got ${weightSum})`);
      }
    }

    // Candidates
    const candidatesCheck = validateArray(data?.candidates, 'candidates', MIN_CANDIDATES);
    if (!candidatesCheck.valid) {
      errors.push(candidatesCheck.error);
    } else {
      for (let i = 0; i < data.candidates.length; i++) {
        const c = data.candidates[i];
        const prefix = `candidates[${i}]`;
        const results = [
          validateString(c?.name, `${prefix}.name`, 1),
          validateString(c?.rationale, `${prefix}.rationale`, 1),
        ];
        errors.push(...collectErrors(results));

        if (!c?.scores || typeof c.scores !== 'object') {
          errors.push(`${prefix}.scores is required and must be an object`);
        } else if (data?.scoringCriteria) {
          for (let j = 0; j < data.scoringCriteria.length; j++) {
            const criterion = data.scoringCriteria[j];
            if (criterion?.name) {
              const scoreVal = c.scores[criterion.name];
              const scoreCheck = validateInteger(scoreVal, `${prefix}.scores.${criterion.name}`, 0, 100);
              if (!scoreCheck.valid) errors.push(scoreCheck.error);
            }
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  },

  /**
   * Compute derived fields: weighted scores and ranking.
   * @param {Object} data - Validated input data
   * @returns {Object} Data with weighted scores and ranked candidates
   */
  computeDerived(data) {
    const candidates = data.candidates.map(c => {
      let weighted_score = 0;
      for (const criterion of data.scoringCriteria) {
        const score = c.scores[criterion.name] || 0;
        weighted_score += (score * criterion.weight) / 100;
      }
      return { ...c, weighted_score: Math.round(weighted_score * 100) / 100 };
    });

    const ranked_candidates = [...candidates].sort((a, b) => b.weighted_score - a.weighted_score);

    return { ...data, candidates, ranked_candidates };
  },
};

export { MIN_CANDIDATES, WEIGHT_SUM, BRAND_GENOME_KEYS };
export default TEMPLATE;
