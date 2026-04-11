/**
 * Design Directive Generator — Converts design tokens into NL directives.
 *
 * Produces human-readable design direction text from structured tokens,
 * capped at 400 characters per directive.
 *
 * SD-DYNAMIC-ARCHETYPEMATCHED-DESIGN-REFERENCE-ORCH-001-C
 * @module lib/eva/design-reference/design-directive-generator
 */

import { sanitizeDesignReference } from '../utils/sanitize-design-reference.js';

const MAX_DIRECTIVE_LENGTH = 400;

const DIMENSION_LABELS = {
  color_strategy: 'Color',
  typography_hierarchy: 'Typography',
  layout_pattern: 'Layout',
  interaction_style: 'Interactions',
  narrative_approach: 'Narrative',
  spacing_system: 'Spacing',
  visual_density: 'Density',
};

/**
 * Generate a natural-language design directive from design tokens.
 *
 * @param {object} tokens - The design_tokens JSONB from a reference
 * @param {string} siteName - The reference site name
 * @returns {string} A concise design directive (max 400 chars)
 */
export function generateDirective(tokens, siteName) {
  if (!tokens || typeof tokens !== 'object') {
    return '';
  }

  const parts = [];

  for (const [key, label] of Object.entries(DIMENSION_LABELS)) {
    if (tokens[key]) {
      const value = sanitizeDesignReference(String(tokens[key]), 80);
      if (value) {
        parts.push(`${label}: ${value}`);
      }
    }
  }

  if (parts.length === 0) return '';

  let directive = `Inspired by ${siteName}: ${parts.join('. ')}.`;

  if (directive.length > MAX_DIRECTIVE_LENGTH) {
    directive = directive.substring(0, MAX_DIRECTIVE_LENGTH - 3) + '...';
  }

  return directive;
}

/**
 * Generate directives for multiple selected references.
 *
 * @param {Array} selectedRefs - References with design_tokens populated
 * @returns {string} Combined design reference section text
 */
export function generateDesignReferenceSection(selectedRefs) {
  if (!selectedRefs || selectedRefs.length === 0) return '';

  const directives = selectedRefs
    .filter((ref) => ref.design_tokens)
    .map((ref) => generateDirective(ref.design_tokens, ref.site_name))
    .filter(Boolean);

  if (directives.length === 0) return '';

  return `## Design References\n${directives.map((d, i) => `${i + 1}. ${d}`).join('\n')}`;
}

export { MAX_DIRECTIVE_LENGTH };
