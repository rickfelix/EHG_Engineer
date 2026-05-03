/**
 * DISPOSITION (FR-5, SD-LEO-FEAT-STAGE-DISTRIBUTION-SETUP-001):
 *   This file's filename (stage-22-acquirability.js) is OFF-BY-ONE relative to its
 *   JSDoc @module path (stage-21-acquirability) and its export name
 *   (analyzeStage21Acquirability). The body genuinely implements the Stage-21
 *   acquirability evaluator. Renaming the file is deferred because the
 *   `index.js` re-export and at least one downstream consumer
 *   (lib/eva/stage-templates/analysis-steps/stage-23-acquirability.js) wire to
 *   the current path; a coordinated multi-file rename belongs in a follow-up SD.
 *   Documented as part of the disposition audit; no behavioural change here.
 *
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
