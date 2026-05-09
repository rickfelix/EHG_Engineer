/**
 * Stage 25 Analysis Step - Venture Review (Capstone)
 * Phase: LAUNCH & LEARN (Stages 23-25)
 * Part of SD-EVA-FEAT-TEMPLATES-LAUNCH-001
 *
 * The most complex analysis step in the pipeline.
 * Consumes Stages 1 (origin vision), 5/16 (projections), 13 (roadmap),
 * 20-22 (quality/review/release), 23 (launch), 24 (metrics).
 * Produces: journey summary, financial comparison, drift analysis,
 * venture health assessment, and decision recommendation.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-25-venture-review
 */

// NOTE: These constants intentionally duplicated from stage-25.js
// to avoid circular dependency (template imports analysis step at module-level eval).
const VENTURE_DECISIONS = ['continue', 'pivot', 'expand', 'sunset', 'exit'];
const HEALTH_RATINGS = ['excellent', 'good', 'fair', 'poor', 'critical'];
const REVIEW_CATEGORIES = ['product', 'market', 'technical', 'financial', 'team'];
const EXPANSION_VECTORS = ['market', 'feature', 'segment'];
const EXPANSION_WEIGHTS = { market: 0.4, feature: 0.35, segment: 0.25 };

/**
 * Generate comprehensive venture review from full lifecycle data.
 *
 * @param {Object} params
 * @param {Object} params.stage24Data - Metrics & learning (AARRR, launch outcome)
 * @param {Object} [params.stage23Data] - Launch execution (success criteria)
 * @param {Object} [params.stage01Data] - Venture hydration (original vision)
 * @param {Object} [params.stage05Data] - Financial model (projections)
 * @param {Object} [params.stage16Data] - Financial projections (detailed)
 * @param {Object} [params.stage13Data] - Product roadmap
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Comprehensive venture review with decision
 */
export async function analyzeStage25({ stage24Data, stage23Data, stage01Data, stage05Data, stage16Data, stage13Data, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage25] Starting analysis', { ventureName });
  if (!stage24Data) {
    throw new Error('Stage 26 venture review requires Stage 25 (metrics & learning) data');
  }

  throw new Error(
    `[Stage26] REFUSED: No real build data found for venture ${ventureName || 'unknown'}. ` +
    'LLM synthesis is disabled — this stage requires real data from upstream SD completion. ' +
    'Check that the venture-to-LEO bridge created SDs and BUILD_PENDING blocked until they completed.'
  );
}


/**
 * Analyze expansion vectors when venture decision is 'expand'.
 *
 * @param {Object} params
 * @param {Object} params.ventureHealth - Health dimensions from main analysis
 * @param {Object} params.ventureDecision - Decision object with recommendation/rationale
 * @param {string} [params.ventureName]
 * @param {Object} [params.logger]
 * @returns {Promise<Object>} Expansion analysis with per-vector scores and composite readinessScore
 */
export async function analyzeExpansionVectors({ ventureHealth, ventureDecision, ventureName, logger = console }) {
  throw new Error(
    `[Stage26] REFUSED: No real expansion data found for venture ${ventureName || 'unknown'}. ` +
    'LLM synthesis is disabled — this stage requires real data from upstream SD completion. ' +
    'Check that the venture-to-LEO bridge created SDs and BUILD_PENDING blocked until they completed.'
  );
}

export { VENTURE_DECISIONS, HEALTH_RATINGS, REVIEW_CATEGORIES, EXPANSION_VECTORS, EXPANSION_WEIGHTS };
