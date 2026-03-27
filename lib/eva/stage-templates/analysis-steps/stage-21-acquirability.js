/**
 * Stage 20 Acquirability Delta - Quality Assurance
 * Phase: THE BUILD LOOP (Stages 17-22)
 * Part of SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-C
 *
 * SOFT-GATE: Advisory only, never blocks stage progression.
 * Evaluates how quality assurance outcomes impact a venture's acquirability,
 * detecting quality gaps that reduce the venture's standalone value.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-20-acquirability
 */

/**
 * Evaluate acquirability impact of quality assurance outcomes.
 *
 * @param {Object} params
 * @param {Object} params.qaData - Quality assurance data (from Stage 20)
 * @param {Object} [params.ventureAssets] - Existing venture asset inventory
 * @param {string} [params.ventureName] - Name of the venture
 * @param {Object} [params.logger] - Logger instance
 * @returns {Promise<Object>} Acquirability delta result with _soft_gate flag
 */
export async function analyzeStage20Acquirability({ qaData, ventureAssets, ventureName, logger = console }) {
  throw new Error(
    `[Stage21] REFUSED: No real build data found for venture ${ventureName || 'unknown'}. ` +
    'LLM synthesis is disabled — this stage requires real data from upstream SD completion. ' +
    'Check that the venture-to-LEO bridge created SDs and BUILD_PENDING blocked until they completed.'
  );
}
