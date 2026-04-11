/**
 * Validate design tokens extracted by LLM enrichment.
 *
 * Ensures all 7 required dimension fields are present and non-empty.
 *
 * SD-DYNAMIC-ARCHETYPEMATCHED-DESIGN-REFERENCE-ORCH-001-B
 * @module lib/eva/utils/validate-design-tokens
 */

import { DESIGN_DIMENSIONS } from '../prompts/design-token-extraction.js';

/**
 * Validate a design_tokens object has all required fields.
 *
 * @param {object|null} tokens - The design_tokens JSONB value
 * @returns {{ valid: boolean, missing: string[], empty: string[] }}
 */
export function validateDesignTokens(tokens) {
  if (!tokens || typeof tokens !== 'object') {
    return { valid: false, missing: [...DESIGN_DIMENSIONS], empty: [] };
  }

  const missing = [];
  const empty = [];

  for (const dim of DESIGN_DIMENSIONS) {
    if (!(dim in tokens)) {
      missing.push(dim);
    } else if (!tokens[dim] || String(tokens[dim]).trim() === '') {
      empty.push(dim);
    }
  }

  return {
    valid: missing.length === 0 && empty.length === 0,
    missing,
    empty,
  };
}
