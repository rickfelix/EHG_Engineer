/**
 * Gate Failure Predictor — Historical Pattern-Based Prediction
 * SD: SD-MAN-ORCH-VISION-HEAL-SCORE-93-002-04-A
 *
 * Analyzes historical gate failure data from sd_phase_handoffs and
 * eva_event_log to predict which gates are likely to fail for a given
 * SD based on its type, complexity, and past patterns.
 *
 * @module lib/eva/gate-failure-predictor
 */

const MIN_SAMPLE_SIZE = 10;
const DEFAULT_LOOKBACK_DAYS = 90;
const NEUTRAL_PROBABILITY = 0.5;

const CONFIDENCE_LEVELS = Object.freeze({
  HIGH: 'high',       // >= 30 samples
  MEDIUM: 'medium',   // 10-29 samples
  LOW: 'low',         // < 10 samples (returns neutral)
});

/**
 * Predict gate failure probabilities for an SD.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} params
 * @param {string} params.sdId - SD UUID
 * @param {string} params.sdType - SD type (feature, infrastructure, fix, etc.)
 * @param {string} [params.handoffType] - Target handoff type (e.g., 'PLAN-TO-EXEC')
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @param {number} [options.lookbackDays] - Days to look back (default: 90)
 * @returns {Promise<{ predictions: Array, sampleSize: number, confidence: string, error?: string }>}
 */
export async function predictGateFailures(supabase, params, options = {}) {
  const { logger = console, lookbackDays = DEFAULT_LOOKBACK_DAYS } = options;
  const { sdId, sdType, handoffType } = params;

  if (!supabase || !sdType) {
    return { predictions: [], sampleSize: 0, confidence: CONFIDENCE_LEVELS.LOW, error: 'Missing required params' };
  }

  try {
    const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

    // Query historical handoffs for same SD type
    const { data: handoffs, error: queryError } = await supabase
      .from('sd_phase_handoffs')
      .select('id, handoff_type, status, validation_score, sd_id, created_at')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false });

    if (queryError) {
      logger.warn(`[GatePredictor] Query failed: ${queryError.message}`);
      return { predictions: [], sampleSize: 0, confidence: CONFIDENCE_LEVELS.LOW, error: queryError.message };
    }

    const all = handoffs || [];

    // Get SD types for matching
    const sdIds = [...new Set(all.map((h) => h.sd_id))];
    let sdTypeMap = {};

    if (sdIds.length > 0) {
      const { data: sds } = await supabase
        .from('strategic_directives_v2')
        .select('id, sd_type')
        .in('id', sdIds.slice(0, 100)); // Limit for performance

      if (sds) {
        for (const sd of sds) {
          sdTypeMap[sd.id] = sd.sd_type;
        }
      }
    }

    // Filter to matching SD type
    const typeMatched = all.filter((h) => sdTypeMap[h.sd_id] === sdType);
    const sampleSize = typeMatched.length;
    const confidence = getConfidenceLevel(sampleSize);

    if (sampleSize < MIN_SAMPLE_SIZE) {
      return {
        predictions: getNeutralPredictions(handoffType),
        sampleSize,
        confidence,
        note: `Insufficient data (${sampleSize} samples, need ${MIN_SAMPLE_SIZE}). Returning neutral predictions.`,
      };
    }

    // Group by handoff type and calculate failure rates
    const groups = {};
    for (const h of typeMatched) {
      if (!groups[h.handoff_type]) {
        groups[h.handoff_type] = { total: 0, failed: 0, scores: [] };
      }
      groups[h.handoff_type].total++;
      if (h.status === 'rejected' || h.status === 'failed') {
        groups[h.handoff_type].failed++;
      }
      if (h.validation_score != null) {
        groups[h.handoff_type].scores.push(h.validation_score);
      }
    }

    // Build predictions
    const predictions = [];
    for (const [gate, stats] of Object.entries(groups)) {
      if (handoffType && gate !== handoffType) continue;

      const failureRate = stats.total > 0 ? stats.failed / stats.total : 0;
      const avgScore = stats.scores.length > 0
        ? Math.round(stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length)
        : null;

      predictions.push({
        gate,
        failureProbability: Math.round(failureRate * 100) / 100,
        riskLevel: getRiskLevel(failureRate),
        sampleCount: stats.total,
        failedCount: stats.failed,
        avgScore,
        recommendation: getRecommendation(gate, failureRate),
      });
    }

    // Sort by failure probability (highest risk first)
    predictions.sort((a, b) => b.failureProbability - a.failureProbability);

    return { predictions, sampleSize, confidence };
  } catch (err) {
    logger.warn(`[GatePredictor] Prediction error: ${err.message}`);
    return { predictions: [], sampleSize: 0, confidence: CONFIDENCE_LEVELS.LOW, error: err.message };
  }
}

/**
 * Get historical gate performance summary.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @param {number} [options.lookbackDays] - Days to look back
 * @returns {Promise<{ summary: Object, error?: string }>}
 */
export async function getGatePerformanceSummary(supabase, options = {}) {
  const { logger = console, lookbackDays = DEFAULT_LOOKBACK_DAYS } = options;

  if (!supabase) {
    return { summary: emptySummary(), error: 'No supabase client' };
  }

  try {
    const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: handoffs, error } = await supabase
      .from('sd_phase_handoffs')
      .select('id, handoff_type, status, validation_score, created_at')
      .gte('created_at', cutoff);

    if (error) {
      logger.warn(`[GatePredictor] Summary query failed: ${error.message}`);
      return { summary: emptySummary(), error: error.message };
    }

    const all = handoffs || [];
    let totalHandoffs = all.length;
    let totalFailed = 0;
    let totalPassed = 0;
    let scoreSum = 0;
    let scoreCount = 0;

    for (const h of all) {
      if (h.status === 'rejected' || h.status === 'failed') {
        totalFailed++;
      } else if (h.status === 'accepted') {
        totalPassed++;
      }
      if (h.validation_score != null) {
        scoreSum += h.validation_score;
        scoreCount++;
      }
    }

    return {
      summary: {
        totalHandoffs,
        totalPassed,
        totalFailed,
        passRate: totalHandoffs > 0 ? Math.round((totalPassed / totalHandoffs) * 100) : 0,
        avgScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0,
        lookbackDays,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    logger.warn(`[GatePredictor] Summary error: ${err.message}`);
    return { summary: emptySummary(), error: err.message };
  }
}

/**
 * Get confidence level constants.
 * @returns {Object}
 */
export function getConfidenceLevels() {
  return { ...CONFIDENCE_LEVELS };
}

// ── Internal Helpers ─────────────────────────────

function getConfidenceLevel(sampleSize) {
  if (sampleSize >= 30) return CONFIDENCE_LEVELS.HIGH;
  if (sampleSize >= MIN_SAMPLE_SIZE) return CONFIDENCE_LEVELS.MEDIUM;
  return CONFIDENCE_LEVELS.LOW;
}

function getRiskLevel(failureRate) {
  if (failureRate >= 0.5) return 'high';
  if (failureRate >= 0.25) return 'medium';
  return 'low';
}

function getRecommendation(gate, failureRate) {
  if (failureRate >= 0.5) {
    return `High failure rate for ${gate}. Review quality criteria before attempting handoff.`;
  }
  if (failureRate >= 0.25) {
    return `Moderate failure rate for ${gate}. Ensure all prerequisites are met.`;
  }
  return `Low failure rate for ${gate}. Standard preparation should suffice.`;
}

function getNeutralPredictions(handoffType) {
  const gates = handoffType
    ? [handoffType]
    : ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'];

  return gates.map((gate) => ({
    gate,
    failureProbability: NEUTRAL_PROBABILITY,
    riskLevel: 'unknown',
    sampleCount: 0,
    failedCount: 0,
    avgScore: null,
    recommendation: 'Insufficient historical data for prediction.',
  }));
}

function emptySummary() {
  return {
    totalHandoffs: 0,
    totalPassed: 0,
    totalFailed: 0,
    passRate: 0,
    avgScore: 0,
    lookbackDays: DEFAULT_LOOKBACK_DAYS,
    generatedAt: new Date().toISOString(),
  };
}
