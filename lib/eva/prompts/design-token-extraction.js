/**
 * LLM prompt template for extracting design tokens from Awwwards reference sites.
 *
 * Produces a structured JSON with 7 design dimensions from site metadata.
 *
 * SD-DYNAMIC-ARCHETYPEMATCHED-DESIGN-REFERENCE-ORCH-001-B
 * @module lib/eva/prompts/design-token-extraction
 */

const DESIGN_DIMENSIONS = [
  'color_strategy',
  'typography_hierarchy',
  'layout_pattern',
  'interaction_style',
  'narrative_approach',
  'spacing_system',
  'visual_density',
];

/**
 * Build the extraction prompt for a single design reference.
 *
 * @param {object} ref - A design_reference_library row
 * @param {string} ref.site_name
 * @param {string} ref.description
 * @param {string} ref.archetype_category
 * @param {number} ref.score_design
 * @param {number} ref.score_usability
 * @param {number} ref.score_creativity
 * @param {number} ref.score_content
 * @returns {string} The prompt text
 */
export function buildDesignTokenPrompt(ref) {
  return `Analyze this Awwwards-winning website and extract design tokens.

Site: ${ref.site_name}
Description: ${ref.description || 'No description available'}
Archetype: ${ref.archetype_category}
Scores: design=${ref.score_design}, usability=${ref.score_usability}, creativity=${ref.score_creativity}, content=${ref.score_content}

Extract exactly these 7 design dimensions as a JSON object. Each value should be a concise natural-language description (1-2 sentences) of the design approach:

{
  "color_strategy": "How colors are used (palette type, contrast approach, mood)",
  "typography_hierarchy": "Font choices, sizing scale, weight usage, readability approach",
  "layout_pattern": "Grid system, content arrangement, responsive approach",
  "interaction_style": "Animation philosophy, micro-interactions, user feedback patterns",
  "narrative_approach": "How content tells a story, visual flow, information hierarchy",
  "spacing_system": "Whitespace philosophy, density, breathing room approach",
  "visual_density": "Overall information density, minimalist vs. rich, element concentration"
}

Respond with ONLY the JSON object, no markdown fencing or explanation.`;
}

export { DESIGN_DIMENSIONS };
