/**
 * Stage 24 Analysis Step - Metrics & Learning (Launch Scorecard)
 * Phase: LAUNCH & LEARN (Stages 23-25)
 * Part of SD-EVA-FEAT-TEMPLATES-LAUNCH-001
 *
 * Evaluates Stage 23 success criteria against AARRR metrics.
 * Produces launch scorecard with per-criterion assessment.
 * Interprets metrics in context of launchType.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-24-metrics-learning
 */


// NOTE: These constants intentionally duplicated from stage-24.js
// to avoid circular dependency (template imports analysis step at module-level eval).
const AARRR_CATEGORIES = ['acquisition', 'activation', 'retention', 'revenue', 'referral'];
const TREND_DIRECTIONS = ['up', 'flat', 'down'];
const OUTCOME_ASSESSMENTS = ['success', 'partial', 'failure', 'indeterminate'];
const IMPACT_LEVELS = ['high', 'medium', 'low'];
const EXPERIMENT_STATUSES = ['running', 'concluded', 'cancelled'];
const EXPERIMENT_OUTCOMES = ['positive', 'negative', 'inconclusive'];
const COHORT_PERIODS = ['day_1', 'day_7', 'day_14', 'day_30', 'day_60', 'day_90'];
const ENGAGEMENT_LEVELS = ['highly_engaged', 'engaged', 'casual', 'at_risk', 'churned'];

/**
 * Generate launch scorecard from Stage 23 success criteria and AARRR metrics.
 *
 * @param {Object} params
 * @param {Object} params.stage23Data - Launch execution data (successCriteria, launchType)
 * @param {Object} [params.stage05Data] - Financial model (projected metrics)
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Launch scorecard with AARRR metrics and outcome
 */
export async function analyzeStage24({ stage23Data, stage05Data, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage24] Starting analysis', { ventureName });
  if (!stage23Data) {
    throw new Error('Stage 24 metrics & learning requires Stage 23 (launch execution) data');
  }

  throw new Error(
    `[Stage25] REFUSED: No real build data found for venture ${ventureName || 'unknown'}. ` +
    'LLM synthesis is disabled — this stage requires real data from upstream SD completion. ' +
    'Check that the venture-to-LEO bridge created SDs and BUILD_PENDING blocked until they completed.'
  );
}


export {
  AARRR_CATEGORIES, TREND_DIRECTIONS, OUTCOME_ASSESSMENTS, IMPACT_LEVELS,
  EXPERIMENT_STATUSES, EXPERIMENT_OUTCOMES, COHORT_PERIODS, ENGAGEMENT_LEVELS,
};
