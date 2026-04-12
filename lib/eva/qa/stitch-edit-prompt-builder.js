/**
 * Stitch Edit Prompt Builder
 * SD: SD-WIREFRAME-FIDELITY-QA-WITH-ORCH-001-F
 *
 * Translates wireframe fidelity QA results (missing elements and low-scoring
 * dimensions) into targeted Stitch screen.edit() prompts.
 */

const DIMENSION_LABELS = {
  components: 'component presence (buttons, forms, navigation elements)',
  layout: 'layout fidelity (spatial arrangement and zones)',
  navigation: 'navigation accuracy (links, menus, navigation structure)',
  purpose: 'screen purpose (overall function and user flow)',
};

/**
 * Build a targeted edit prompt from QA fidelity results.
 *
 * @param {Object} qaResult - Fidelity QA result for a single screen
 * @param {string[]} [qaResult.missing_elements] - Specific missing UI elements
 * @param {Object} [qaResult.dimensions] - Per-dimension scores {components, layout, navigation, purpose}
 * @param {number} [qaResult.score] - Overall fidelity score (0-100)
 * @param {string} [qaResult.name] - Screen name for context
 * @returns {string} Edit prompt for screen.edit()
 */
export function buildEditPrompt(qaResult) {
  if (!qaResult || typeof qaResult !== 'object') {
    return 'Improve the overall design quality and ensure all expected UI elements are present.';
  }

  const parts = [];

  // Missing elements — most actionable feedback
  const missing = qaResult.missing_elements || [];
  if (missing.length > 0) {
    parts.push(`Add the following missing elements: ${missing.join(', ')}.`);
  }

  // Low-scoring dimensions — guide structural improvements
  const dimensions = qaResult.dimensions || {};
  const lowDimensions = Object.entries(dimensions)
    .filter(([, score]) => typeof score === 'number' && score < 70)
    .sort(([, a], [, b]) => a - b); // worst first

  for (const [dim, score] of lowDimensions) {
    const label = DIMENSION_LABELS[dim] || dim;
    parts.push(`Improve ${label} (currently ${score}% fidelity).`);
  }

  // If no specific feedback, provide generic improvement
  if (parts.length === 0) {
    return 'Refine the design to better match the wireframe specification. Ensure all components are present and properly laid out.';
  }

  // Context prefix
  const screenContext = qaResult.name ? `For the "${qaResult.name}" screen: ` : '';
  return `${screenContext}${parts.join(' ')}`;
}
