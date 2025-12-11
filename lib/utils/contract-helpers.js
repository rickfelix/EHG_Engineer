/**
 * Contract Helpers for Sub-Agent Modules
 * Agentic Context Engineering v3.0
 *
 * Purpose: Optional utilities for sub-agents to leverage contract-based handoffs
 *
 * Usage: Import these helpers to store large outputs as artifacts or process
 * contract-provided artifacts. Sub-agents work without these - they're enhancements.
 *
 * Created: 2025-12-11 (SD-FOUND-AGENTIC-CONTEXT-001)
 */

import {
  readArtifact,
  createArtifact,
  claimTaskContract,
  completeTaskContract
} from '../artifact-tools.js';

/**
 * Threshold for auto-storing outputs as artifacts (bytes)
 * Outputs larger than this should be stored as artifacts
 */
export const OUTPUT_ARTIFACT_THRESHOLD = 4096; // 4KB

/**
 * Store large analysis results as an artifact
 * Returns a pointer that can be included in results instead of full content
 *
 * @param {string} content - Content to store
 * @param {Object} options - Storage options
 * @param {string} options.sdId - SD ID for linking
 * @param {string} options.subAgentCode - Sub-agent code
 * @param {string} options.type - Artifact type (default: 'analysis')
 * @returns {Promise<Object>} Artifact reference { artifact_id, summary, token_count }
 *
 * @example
 * const analysisText = JSON.stringify(largeAnalysis, null, 2);
 * if (analysisText.length > OUTPUT_ARTIFACT_THRESHOLD) {
 *   const ref = await storeAnalysisAsArtifact(analysisText, {
 *     sdId: 'SD-XXX',
 *     subAgentCode: 'VALIDATION'
 *   });
 *   results.analysis_artifact_id = ref.artifact_id;
 *   results.analysis_summary = ref.summary;
 * }
 */
export async function storeAnalysisAsArtifact(content, options = {}) {
  const { sdId, subAgentCode, type = 'analysis' } = options;

  const artifact = await createArtifact(content, {
    source_tool: 'sub-agent-executor',
    type,
    sd_id: sdId,
    metadata: {
      sub_agent_code: subAgentCode,
      stored_at: new Date().toISOString()
    }
  });

  return {
    artifact_id: artifact.artifact_id,
    summary: artifact.summary,
    token_count: artifact.token_count,
    pointer: artifact.pointer
  };
}

/**
 * Load full content from input artifacts referenced in contract
 * Use this when you need the full instructions or context
 *
 * @param {string[]} artifactIds - Array of artifact IDs from contract
 * @returns {Promise<Object[]>} Array of artifact contents
 *
 * @example
 * if (options.inputArtifacts?.length > 0) {
 *   const artifacts = await loadInputArtifacts(options.inputArtifacts);
 *   for (const artifact of artifacts) {
 *     console.log(`Loaded: ${artifact.token_count} tokens`);
 *     // Process artifact.content
 *   }
 * }
 */
export async function loadInputArtifacts(artifactIds) {
  const artifacts = [];

  for (const artifactId of artifactIds) {
    try {
      const artifact = await readArtifact(artifactId);
      artifacts.push({
        artifact_id: artifactId,
        content: artifact.content,
        confidence: artifact.confidence,
        is_expired: artifact.is_expired,
        token_count: artifact.token_count
      });
    } catch (error) {
      console.warn(`   ⚠️  Failed to load artifact ${artifactId}: ${error.message}`);
      artifacts.push({
        artifact_id: artifactId,
        error: error.message,
        content: null
      });
    }
  }

  return artifacts;
}

/**
 * Compress results for compact storage
 * Moves large fields to artifacts and replaces with pointers
 *
 * @param {Object} results - Sub-agent execution results
 * @param {Object} options - Options
 * @param {string} options.sdId - SD ID
 * @param {string} options.subAgentCode - Sub-agent code
 * @param {number} options.threshold - Size threshold (default: OUTPUT_ARTIFACT_THRESHOLD)
 * @returns {Promise<Object>} Compressed results with artifact references
 *
 * @example
 * const results = { verdict: 'PASS', detailed_analysis: {...huge object...} };
 * const compressed = await compressResults(results, {
 *   sdId: 'SD-XXX',
 *   subAgentCode: 'VALIDATION'
 * });
 * // compressed.detailed_analysis is now an artifact reference
 */
export async function compressResults(results, options = {}) {
  const { sdId, subAgentCode, threshold = OUTPUT_ARTIFACT_THRESHOLD } = options;
  const compressed = { ...results };
  const artifactRefs = {};

  // Fields that might be large
  const largeFields = ['detailed_analysis', 'findings', 'raw_output', 'full_report'];

  for (const field of largeFields) {
    if (compressed[field]) {
      const content = typeof compressed[field] === 'string'
        ? compressed[field]
        : JSON.stringify(compressed[field], null, 2);

      if (content.length > threshold) {
        try {
          const ref = await storeAnalysisAsArtifact(content, {
            sdId,
            subAgentCode,
            type: 'contract_output'
          });

          // Replace with reference
          compressed[field] = null;
          compressed[`${field}_artifact_id`] = ref.artifact_id;
          compressed[`${field}_summary`] = ref.summary;
          artifactRefs[field] = ref;

          console.log(`   📦 Stored ${field} as artifact (${ref.token_count} tokens)`);
        } catch (error) {
          console.warn(`   ⚠️  Failed to compress ${field}: ${error.message}`);
          // Keep original on failure
        }
      }
    }
  }

  if (Object.keys(artifactRefs).length > 0) {
    compressed._artifact_refs = artifactRefs;
  }

  return compressed;
}

/**
 * Check if running in contract mode
 * @returns {boolean} Whether contract-based handoffs are enabled
 */
export function isContractMode() {
  return process.env.LEO_USE_TASK_CONTRACTS !== 'false';
}

/**
 * Claim pending contract for a sub-agent
 * Re-export for convenience
 */
export { claimTaskContract, completeTaskContract };
