/**
 * Canonical vision dimension extractor.
 * SD-LEO-INFRA-EAGER-SYNTHESIS-VISION-DIMS-EXTRACT-001
 *
 * Relocated verbatim from scripts/eva/vision-command.mjs (extractDimensions) so the ONE canonical
 * LLM extractor can be reused by both the CLI (vision-command.mjs) and the eager-synthesis writer
 * (lib/eva/artifact-persistence-service.js upsertEvaVisionFromArtifacts) — which previously wrote
 * visions with NULL extracted_dimensions, failing eva_vision_documents_active_rich_check on promotion.
 *
 * Importing this module has NO CLI/argv side effects.
 *
 * @module lib/eva/vision-dimensions-extractor
 */
import { getValidationClient } from '../llm/client-factory.js';

// Cap content sent to the LLM (token/cost guard). Matches the original CLI constant.
export const MAX_LLM_CONTENT_CHARS = 15000;

/**
 * Extract 6-10 weighted scoring dimensions from a vision document via the validation LLM.
 * Fail-soft: returns null after one retry rather than throwing, so callers never lose the write.
 *
 * @param {string} content - the vision markdown content
 * @param {number} [retryCount=0] - internal retry counter
 * @returns {Promise<Array<{name:string,weight:number,description:string,source_section?:string}>|null>}
 */
export async function extractDimensions(content, retryCount = 0) {
  if (content.length > MAX_LLM_CONTENT_CHARS) {
    console.warn(`\n   ⚠️  Content truncated from ${content.length.toLocaleString()} to ${MAX_LLM_CONTENT_CHARS.toLocaleString()} chars for LLM extraction`);
  }
  const truncated = content.length > MAX_LLM_CONTENT_CHARS
    ? content.slice(0, MAX_LLM_CONTENT_CHARS) + '\n...[truncated for dimension extraction]'
    : content;

  const prompt = `You are analyzing a strategic vision document. Extract 6-10 key scoring dimensions that represent the major requirements, principles, or goals of this vision. These dimensions will be used to score whether built software aligns with this vision.

For each dimension, provide:
- name: short identifier (e.g., "chairman_governance", "stage_completeness")
- weight: relative importance 0.0-1.0 (all weights should sum to approximately 1.0)
- description: one sentence explaining what this dimension measures
- source_section: which section or principle in the doc this comes from

Return ONLY a valid JSON array of objects with these exact fields. No explanation text.

Document:
${truncated}`;

  try {
    const client = getValidationClient();
    const systemPrompt = 'You are a document analyst. Extract structured scoring dimensions from strategic documents. Return only valid JSON arrays.';
    const response = await client.complete(systemPrompt, prompt);
    const text = typeof response === 'string' ? response : response?.content || response?.text || JSON.stringify(response);

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array found in LLM response');

    const dimensions = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(dimensions) || dimensions.length < 1) throw new Error('LLM returned empty dimensions');

    for (const dim of dimensions) {
      if (!dim.name || typeof dim.weight !== 'number' || !dim.description) {
        throw new Error(`Invalid dimension shape: ${JSON.stringify(dim)}`);
      }
    }

    return dimensions;
  } catch (err) {
    if (retryCount === 0) {
      console.warn(`\n   ⚠️  LLM extraction failed (attempt 1): ${err.message}`);
      console.warn('   Retrying...');
      return extractDimensions(content, 1);
    }
    console.warn(`\n   ⚠️  LLM extraction failed after 2 attempts: ${err.message}`);
    console.warn('   Storing null extracted_dimensions — can be re-extracted later by scorer.');
    return null;
  }
}
