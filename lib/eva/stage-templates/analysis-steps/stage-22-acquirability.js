/**
 * Stage 21 Acquirability Delta - Build Review
 * Phase: THE BUILD LOOP (Stages 17-22)
 * Part of SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-C
 *
 * SOFT-GATE: Advisory only, never blocks stage progression.
 * Evaluates how build review outcomes and technical debt affect
 * a venture's acquirability, assessing architecture quality for
 * independent operation.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-21-acquirability
 */

/**
 * Evaluate acquirability impact of build review and technical debt.
 *
 * @param {Object} params
 * @param {Object} params.reviewData - Build review data (from Stage 21)
 * @param {Object} [params.ventureAssets] - Existing venture asset inventory
 * @param {string} [params.ventureName] - Name of the venture
 * @param {Object} [params.logger] - Logger instance
 * @returns {Promise<Object>} Acquirability delta result with _soft_gate flag
 */
export async function analyzeStage21Acquirability({ reviewData, ventureAssets, ventureName, logger = console }) {
  throw new Error(
    `[Stage22] REFUSED: No real build data found for venture ${ventureName || 'unknown'}. ` +
    'LLM synthesis is disabled — this stage requires real data from upstream SD completion. ' +
    'Check that the venture-to-LEO bridge created SDs and BUILD_PENDING blocked until they completed.'
  );
}
