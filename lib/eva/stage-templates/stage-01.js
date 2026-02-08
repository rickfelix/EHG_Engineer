/**
 * Stage 01 Template - Draft Idea
 * Phase: THE TRUTH (Stages 1-5)
 * Part of SD-LEO-FEAT-TMPL-TRUTH-001
 *
 * Captures a minimally viable venture idea with required fields
 * and enforces input constraints for consistent downstream scoring.
 *
 * @module lib/eva/stage-templates/stage-01
 */

import { validateString, collectErrors } from './validation.js';

const TEMPLATE = {
  id: 'stage-01',
  slug: 'draft-idea',
  title: 'Draft Idea',
  version: '1.0.0',
  schema: {
    description: { type: 'string', minLength: 50, required: true },
    valueProp: { type: 'string', minLength: 20, required: true },
    targetMarket: { type: 'string', minLength: 10, required: true },
  },
  defaultData: {
    description: '',
    valueProp: '',
    targetMarket: '',
  },

  /**
   * Validate stage input data.
   * @param {Object} data
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(data) {
    const results = [
      validateString(data?.description, 'description', 50),
      validateString(data?.valueProp, 'valueProp', 20),
      validateString(data?.targetMarket, 'targetMarket', 10),
    ];
    const errors = collectErrors(results);
    return { valid: errors.length === 0, errors };
  },

  /**
   * Compute derived fields (none for Stage 01).
   * @param {Object} data - Validated input data
   * @returns {Object} Data with any derived fields
   */
  computeDerived(data) {
    return { ...data };
  },
};

export default TEMPLATE;
