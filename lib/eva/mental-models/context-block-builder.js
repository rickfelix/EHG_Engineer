/**
 * Context Block Builder
 *
 * Formats selected mental models into a prompt-injectable text block.
 * Follows the same pattern as strategicContext.formattedPromptBlock
 * and getCapabilityContextBlock().
 *
 * Part of SD-LEO-FEAT-MENTAL-MODELS-REPOSITORY-001
 */

/**
 * Build a formatted context block from selected models.
 *
 * @param {Object[]} models - Selected models from model-selector
 * @returns {string} Formatted prompt block (empty string if no models)
 */
export function buildContextBlock(models) {
  if (!models || models.length === 0) {
    return '';
  }

  const modelBlocks = models.map((model, i) => {
    const parts = [`${i + 1}. **${model.name}** (${model.category})`];

    if (model.core_concept) {
      parts.push(`   Core Concept: ${model.core_concept}`);
    }

    if (model.prompt_context_block) {
      parts.push(`   ${model.prompt_context_block}`);
    }

    return parts.join('\n');
  });

  return `## Mental Model Frameworks
Consider these analytical frameworks when evaluating this opportunity:

${modelBlocks.join('\n\n')}`;
}
