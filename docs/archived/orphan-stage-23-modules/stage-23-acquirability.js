/**
 * Stage 22 Acquirability Delta - Release Readiness
 * Phase: THE BUILD LOOP (Stages 17-22)
 * Part of SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-C
 *
 * SOFT-GATE: Advisory only, never blocks stage progression.
 * Evaluates how release infrastructure and deployment decisions
 * affect a venture's acquirability, assessing whether the venture
 * can operate independently post-acquisition.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-22-acquirability
 */

/**
 * Evaluate acquirability impact of release readiness and deployment infrastructure.
 *
 * @param {Object} params
 * @param {Object} params.releaseData - Release readiness data (from Stage 22)
 * @param {Object} [params.ventureAssets] - Existing venture asset inventory
 * @param {string} [params.ventureName] - Name of the venture
 * @param {Object} [params.logger] - Logger instance
 * @returns {Promise<Object>} Acquirability delta result with _soft_gate flag
 */
export async function analyzeStage22Acquirability({ releaseData, ventureAssets, ventureName, logger = console }) {
  throw new Error(
    `[Stage23] REFUSED: No real build data found for venture ${ventureName || 'unknown'}. ` +
    'LLM synthesis is disabled — this stage requires real data from upstream SD completion. ' +
    'Check that the venture-to-LEO bridge created SDs and BUILD_PENDING blocked until they completed.'
  );
}
