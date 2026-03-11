/**
 * Prompt Promotion — Manages the promotion workflow for winning
 * experiment variants. Creates promotion records and updates
 * prompt status when confidence thresholds are met.
 *
 * SD-MAN-ORCH-STAGE-ZERO-COLD-001-F
 *
 * @module lib/eva/experiments/prompt-promotion
 */

/**
 * Default promotion configuration.
 */
const DEFAULT_CONFIG = {
  confidenceThreshold: 0.90,
  minSamples: 20,
  requireConclusiveStatus: true,
};

/**
 * Evaluate whether an experiment result qualifies for prompt promotion
 * and create a promotion record if it does.
 *
 * @param {Object} deps - { supabase, logger }
 * @param {Object} params
 * @param {string} params.experimentId - Experiment ID
 * @param {Object} params.analysis - Output from analyzeExperiment()
 * @param {Object} params.experiment - Experiment record with variants
 * @param {Object} [params.promotionConfig] - Override promotion config
 * @returns {Promise<Object>} Promotion result
 */
export async function evaluatePromotion(deps, params) {
  const { logger = console } = deps;
  const {
    experimentId,
    analysis,
    experiment,
    promotionConfig = {},
  } = params;

  if (!experimentId) throw new Error('experimentId is required');
  if (!analysis) throw new Error('analysis is required');

  const config = { ...DEFAULT_CONFIG, ...promotionConfig };

  // Step 1: Check if experiment is conclusive
  if (config.requireConclusiveStatus && analysis.status !== 'conclusive') {
    return {
      promoted: false,
      reason: 'experiment_not_conclusive',
      status: analysis.status,
    };
  }

  // Step 2: Check for a winner
  const winner = analysis.stopping?.winner;
  if (!winner) {
    return {
      promoted: false,
      reason: 'no_winner',
    };
  }

  // Step 3: Check sample size
  const totalSamples = analysis.total_samples || 0;
  if (totalSamples < config.minSamples) {
    return {
      promoted: false,
      reason: 'insufficient_samples',
      samples: totalSamples,
      required: config.minSamples,
    };
  }

  // Step 4: Check confidence threshold
  const confidence = getWinnerConfidence(analysis, winner);
  if (confidence < config.confidenceThreshold) {
    return {
      promoted: false,
      reason: 'below_confidence_threshold',
      confidence,
      threshold: config.confidenceThreshold,
      mode: analysis.mode || 'synthesis',
    };
  }

  // Step 5: Find the winning variant's prompt_name
  const winningVariant = (experiment?.variants || []).find(v => v.key === winner);
  const promptName = winningVariant?.prompt_name;

  if (!promptName) {
    logger.log(`   [Promotion] Winner '${winner}' has no prompt_name — skipping promotion`);
    return {
      promoted: false,
      reason: 'no_prompt_name',
      winner,
    };
  }

  // Step 6: Create promotion record
  const promotionRecord = createPromotionRecord({
    experimentId,
    winner,
    promptName,
    confidence,
    analysis,
    config,
  });

  logger.log(`   [Promotion] Promoting '${promptName}' (confidence: ${(confidence * 100).toFixed(1)}%)`);

  return {
    promoted: true,
    promotion: promotionRecord,
    winner,
    promptName,
    confidence,
  };
}

/**
 * Create a promotion record for a winning prompt.
 *
 * @param {Object} params
 * @returns {Object} Promotion record
 */
export function createPromotionRecord(params) {
  const {
    experimentId,
    winner,
    promptName,
    confidence,
    analysis,
    config,
  } = params;

  const winnerData = analysis.per_variant?.[winner];
  const loserKey = Object.keys(analysis.per_variant || {}).find(k => k !== winner);
  const loserData = loserKey ? analysis.per_variant[loserKey] : null;

  // Build effect summary — survival mode uses gate survival rates
  const isSurvivalMode = analysis.mode === 'survival';
  let effectSummary;

  if (isSurvivalMode) {
    const winnerSurvival = getSurvivalRate(winnerData);
    const loserSurvival = getSurvivalRate(loserData);
    effectSummary = {
      mode: 'survival',
      winner_survival_rate: winnerSurvival,
      loser_survival_rate: loserSurvival,
      absolute_diff: round2(winnerSurvival - loserSurvival),
      relative_pct: loserSurvival > 0
        ? round2(((winnerSurvival - loserSurvival) / loserSurvival) * 100)
        : 0,
      winner_mean: winnerData?.mean_score || 0,
      loser_mean: loserData?.mean_score || 0,
    };
  } else {
    effectSummary = {
      mode: 'synthesis',
      winner_mean: winnerData?.mean_score || 0,
      loser_mean: loserData?.mean_score || 0,
      absolute_diff: winnerData && loserData
        ? round2(winnerData.mean_score - loserData.mean_score)
        : 0,
      relative_pct: winnerData && loserData && loserData.mean_score !== 0
        ? round2(((winnerData.mean_score - loserData.mean_score) / loserData.mean_score) * 100)
        : 0,
    };
  }

  return {
    experiment_id: experimentId,
    promoted_variant: winner,
    prompt_name: promptName,
    status: 'pending_review',
    confidence,
    confidence_threshold: config.confidenceThreshold,
    total_samples: analysis.total_samples,
    analysis_mode: isSurvivalMode ? 'survival' : 'synthesis',
    effect_summary: effectSummary,
    created_at: new Date().toISOString(),
  };
}

/**
 * Get the confidence level for the winning variant.
 *
 * @param {Object} analysis - Analysis results
 * @param {string} winner - Winning variant key
 * @returns {number} Confidence probability
 */
export function getWinnerConfidence(analysis, winner) {
  for (const comp of (analysis.comparisons || [])) {
    if (comp.variantA === winner) return comp.probABetterThanB;
    if (comp.variantB === winner) return comp.probBBetterThanA;
  }
  return 0;
}

/**
 * Extract survival rate from variant analysis data.
 * Uses the Beta posterior: rate = alpha / (alpha + beta).
 *
 * @param {Object} variantData - Per-variant analysis data
 * @returns {number} Survival rate in [0, 1]
 */
function getSurvivalRate(variantData) {
  if (!variantData?.posterior) return 0;
  const { alpha, beta } = variantData.posterior;
  return alpha / (alpha + beta);
}

function round2(n) { return Math.round(n * 100) / 100; }
