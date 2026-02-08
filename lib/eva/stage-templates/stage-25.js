/**
 * Stage 25 Template - Venture Review
 * Phase: LAUNCH & LEARN (Stages 23-25)
 * Part of SD-LEO-FEAT-TMPL-LAUNCH-001
 *
 * Final venture review with 5-category initiatives,
 * drift detection against Stage 1 vision/constraints,
 * and drift justification requirement.
 *
 * @module lib/eva/stage-templates/stage-25
 */

import { validateString, validateArray, collectErrors } from './validation.js';

const REVIEW_CATEGORIES = ['product', 'market', 'technical', 'financial', 'team'];
const MIN_INITIATIVES_PER_CATEGORY = 1;

const TEMPLATE = {
  id: 'stage-25',
  slug: 'venture-review',
  title: 'Venture Review',
  version: '1.0.0',
  schema: {
    review_summary: { type: 'string', minLength: 20, required: true },
    initiatives: {
      type: 'object',
      required: true,
      properties: Object.fromEntries(REVIEW_CATEGORIES.map(cat => [cat, {
        type: 'array',
        minItems: MIN_INITIATIVES_PER_CATEGORY,
        items: {
          title: { type: 'string', required: true },
          status: { type: 'string', required: true },
          outcome: { type: 'string', required: true },
        },
      }])),
    },
    current_vision: { type: 'string', minLength: 10, required: true },
    drift_justification: { type: 'string' },
    next_steps: {
      type: 'array',
      minItems: 1,
      items: {
        action: { type: 'string', required: true },
        owner: { type: 'string', required: true },
        timeline: { type: 'string', required: true },
      },
    },
    // Derived
    total_initiatives: { type: 'number', derived: true },
    all_categories_reviewed: { type: 'boolean', derived: true },
    drift_detected: { type: 'boolean', derived: true },
    drift_check: { type: 'object', derived: true },
  },
  defaultData: {
    review_summary: null,
    initiatives: {},
    current_vision: null,
    drift_justification: null,
    next_steps: [],
    total_initiatives: 0,
    all_categories_reviewed: false,
    drift_detected: false,
    drift_check: null,
  },

  validate(data) {
    const errors = [];

    const summaryCheck = validateString(data?.review_summary, 'review_summary', 20);
    if (!summaryCheck.valid) errors.push(summaryCheck.error);

    if (!data?.initiatives || typeof data.initiatives !== 'object') {
      errors.push('initiatives is required and must be an object');
    } else {
      for (const cat of REVIEW_CATEGORIES) {
        const items = data.initiatives[cat];
        const arrCheck = validateArray(items, `initiatives.${cat}`, MIN_INITIATIVES_PER_CATEGORY);
        if (!arrCheck.valid) {
          errors.push(arrCheck.error);
          continue;
        }
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const prefix = `initiatives.${cat}[${i}]`;
          const results = [
            validateString(item?.title, `${prefix}.title`, 1),
            validateString(item?.status, `${prefix}.status`, 1),
            validateString(item?.outcome, `${prefix}.outcome`, 1),
          ];
          errors.push(...collectErrors(results));
        }
      }
    }

    const visionCheck = validateString(data?.current_vision, 'current_vision', 10);
    if (!visionCheck.valid) errors.push(visionCheck.error);

    const stepsCheck = validateArray(data?.next_steps, 'next_steps', 1);
    if (!stepsCheck.valid) {
      errors.push(stepsCheck.error);
    } else {
      for (let i = 0; i < data.next_steps.length; i++) {
        const ns = data.next_steps[i];
        const prefix = `next_steps[${i}]`;
        const results = [
          validateString(ns?.action, `${prefix}.action`, 1),
          validateString(ns?.owner, `${prefix}.owner`, 1),
          validateString(ns?.timeline, `${prefix}.timeline`, 1),
        ];
        errors.push(...collectErrors(results));
      }
    }

    return { valid: errors.length === 0, errors };
  },

  /**
   * Compute derived fields including drift detection.
   * @param {Object} data - Validated input data
   * @param {Object} [prerequisites] - Optional: { stage01 } for drift detection
   * @returns {Object} Data with derived fields
   */
  computeDerived(data, prerequisites) {
    let total_initiatives = 0;
    let categoriesPresent = 0;

    for (const cat of REVIEW_CATEGORIES) {
      const items = data.initiatives[cat] || [];
      if (items.length > 0) categoriesPresent++;
      total_initiatives += items.length;
    }

    const all_categories_reviewed = categoriesPresent === REVIEW_CATEGORIES.length;

    // Drift detection against Stage 1 vision
    const drift_check = prerequisites?.stage01
      ? detectDrift({
          original_vision: prerequisites.stage01.venture_name
            ? `${prerequisites.stage01.venture_name}: ${prerequisites.stage01.elevator_pitch || ''}`
            : null,
          current_vision: data.current_vision,
        })
      : { drift_detected: false, rationale: 'Stage 1 data not provided - drift check skipped', original_vision: null, current_vision: data.current_vision };

    const drift_detected = drift_check.drift_detected;

    return {
      ...data,
      total_initiatives,
      all_categories_reviewed,
      drift_detected,
      drift_check,
    };
  },
};

/**
 * Pure function: detect drift between original and current vision.
 * Drift is detected when current_vision differs significantly from original.
 *
 * @param {{ original_vision: string|null, current_vision: string }} params
 * @returns {{ drift_detected: boolean, rationale: string, original_vision: string|null, current_vision: string }}
 */
export function detectDrift({ original_vision, current_vision }) {
  if (!original_vision) {
    return {
      drift_detected: false,
      rationale: 'No original vision available for comparison',
      original_vision,
      current_vision,
    };
  }

  // Simple drift detection: check if visions share significant overlap
  const originalWords = new Set(original_vision.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const currentWords = new Set(current_vision.toLowerCase().split(/\s+/).filter(w => w.length > 3));

  let overlap = 0;
  for (const word of originalWords) {
    if (currentWords.has(word)) overlap++;
  }

  const overlapRatio = originalWords.size > 0 ? overlap / originalWords.size : 1;
  const drift_detected = overlapRatio < 0.3;

  const rationale = drift_detected
    ? `Significant drift detected: only ${Math.round(overlapRatio * 100)}% overlap with original vision`
    : `Vision aligned: ${Math.round(overlapRatio * 100)}% overlap with original vision`;

  return { drift_detected, rationale, original_vision, current_vision };
}

export { REVIEW_CATEGORIES, MIN_INITIATIVES_PER_CATEGORY };
export default TEMPLATE;
