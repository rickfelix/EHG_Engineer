/**
 * Calibration Report Generator
 *
 * Computes baseline predictive accuracy of Stage 0 scores against
 * actual kill gate outcomes. Produces FPR/FNR metrics, per-gate
 * correlations, and actionable recommendations.
 *
 * SD-CLOSE-EXPERIMENT-FEEDBACK-LOOP-ORCH-001-C
 */

const DEFAULT_GATE_STAGES = [3, 5, 13];
const MIN_SAMPLE_SIZE = 30;

/**
 * Compute False Positive Rate and False Negative Rate.
 * FPR = count(score > highThreshold AND gate_failed) / count(score > highThreshold)
 * FNR = count(score < lowThreshold AND gate_passed) / count(score < lowThreshold)
 *
 * @param {Object} deps - { supabase, logger }
 * @param {Object} options
 * @param {number} [options.highThreshold=80] - Score above which we expect pass
 * @param {number} [options.lowThreshold=50] - Score below which we expect fail
 * @param {number} [options.limit=1000] - Max records to query
 * @returns {Promise<Object>} { fpr, fnr, sample_size, high_count, low_count, insufficient_data }
 */
export async function computeBaselineAccuracy(deps, options = {}) {
  const { supabase, logger = console } = deps;
  const { highThreshold = 80, lowThreshold = 50, limit = 1000 } = options;

  // Table stage_zero_experiment_telemetry does not exist yet
  const telemetry = [];
  const error = null;

  if (!telemetry?.length) {
    return { insufficient_data: true, reason: 'no_telemetry_table', fpr: 0, fnr: 0, sample_size: 0, high_count: 0, low_count: 0 };
  }

  const records = telemetry || [];
  if (records.length < MIN_SAMPLE_SIZE) {
    logger.log(`   [Calibration] Insufficient data: ${records.length} < ${MIN_SAMPLE_SIZE}`);
    return { insufficient_data: true, reason: 'sample_too_small', fpr: 0, fnr: 0, sample_size: records.length, high_count: 0, low_count: 0 };
  }

  // High-scoring ventures (predicted to pass)
  const highScored = records.filter(r => r.synthesis_score > highThreshold);
  const falsePositives = highScored.filter(r => !r.gate_passed).length;
  const highCount = highScored.length;
  const fpr = highCount > 0 ? round3(falsePositives / highCount) : 0;

  // Low-scoring ventures (predicted to fail)
  const lowScored = records.filter(r => r.synthesis_score < lowThreshold);
  const falseNegatives = lowScored.filter(r => r.gate_passed).length;
  const lowCount = lowScored.length;
  const fnr = lowCount > 0 ? round3(falseNegatives / lowCount) : 0;

  logger.log(`   [Calibration] FPR=${fpr} (${falsePositives}/${highCount}), FNR=${fnr} (${falseNegatives}/${lowCount}), n=${records.length}`);

  return {
    insufficient_data: false,
    fpr,
    fnr,
    sample_size: records.length,
    high_count: highCount,
    low_count: lowCount,
    false_positives: falsePositives,
    false_negatives: falseNegatives,
    high_threshold: highThreshold,
    low_threshold: lowThreshold,
  };
}

/**
 * Compute point-biserial correlation between Stage 0 dimension scores
 * and binary gate survival at each kill gate stage.
 *
 * Point-biserial r = (M1 - M0) / S * sqrt(n0*n1/n^2)
 * where M1 = mean score for passed, M0 = mean score for failed
 *
 * @param {Object} deps - { supabase, logger }
 * @param {Object} options
 * @param {number[]} [options.gateStages=[3, 5, 13]]
 * @param {number} [options.limit=1000]
 * @returns {Promise<Object>} { correlations: { [stage]: { [dimension]: { r, classification } } }, dimensions }
 */
export async function computePerGateCorrelation(deps, options = {}) {
  const { supabase, logger = console } = deps;
  const { gateStages = DEFAULT_GATE_STAGES, limit = 1000 } = options;

  // Table stage_zero_experiment_telemetry does not exist yet
  const records = [];

  if (!records?.length) {
    logger.log('   [Calibration] No telemetry data (table not yet created)');
    return { correlations: {}, dimensions: [], insufficient_data: true };
  }

  // Discover dimensions from the first record with dimension_scores
  const sampleWithDims = records.find(r => r.dimension_scores && typeof r.dimension_scores === 'object');
  const dimensions = sampleWithDims ? Object.keys(sampleWithDims.dimension_scores) : ['synthesis_score'];

  const correlations = {};

  for (const stage of gateStages) {
    const stageRecords = records.filter(r => r.kill_gate_stage === stage);
    correlations[stage] = {};

    if (stageRecords.length < 5) {
      for (const dim of dimensions) {
        correlations[stage][dim] = { r: 0, classification: 'insufficient_data', n: stageRecords.length };
      }
      continue;
    }

    for (const dim of dimensions) {
      const scored = stageRecords.map(r => ({
        score: dim === 'synthesis_score' ? r.synthesis_score : (r.dimension_scores?.[dim] ?? null),
        passed: r.gate_passed,
      })).filter(s => s.score !== null);

      const r = pointBiserialCorrelation(scored);
      correlations[stage][dim] = {
        r: round3(r),
        classification: classifyCorrelation(r),
        n: scored.length,
      };
    }
  }

  logger.log(`   [Calibration] Computed correlations for ${dimensions.length} dimensions across ${gateStages.length} gates`);

  return { correlations, dimensions, insufficient_data: false };
}

/**
 * Generate full calibration report combining all analyses.
 *
 * @param {Object} deps - { supabase, logger }
 * @param {Object} [options]
 * @returns {Promise<Object>} Full calibration report
 */
export async function generateCalibrationReport(deps, options = {}) {
  const { logger = console } = deps;

  const accuracy = await computeBaselineAccuracy(deps, options);
  const correlations = await computePerGateCorrelation(deps, options);

  const recommendations = generateRecommendations(accuracy, correlations);

  const report = {
    generated_at: new Date().toISOString(),
    summary: {
      fpr: accuracy.fpr,
      fnr: accuracy.fnr,
      sample_size: accuracy.sample_size,
      insufficient_data: accuracy.insufficient_data || false,
    },
    accuracy,
    correlations,
    recommendations,
  };

  logger.log(`   [Calibration] Report generated: FPR=${accuracy.fpr}, FNR=${accuracy.fnr}, ${recommendations.length} recommendations`);

  return report;
}

/**
 * Generate actionable recommendations from calibration data.
 *
 * Rules:
 * - Dimension with r < 0.1 at ALL gates -> recommend DROP
 * - Dimension with r > 0.5 at ANY gate -> recommend INCREASE_WEIGHT
 * - Dimension with 0.1 <= r <= 0.5 -> recommend KEEP
 * - FPR > 0.3 -> recommend RAISE_THRESHOLD
 * - FNR > 0.3 -> recommend LOWER_THRESHOLD
 *
 * @param {Object} accuracy
 * @param {Object} correlationData
 * @returns {Array<Object>} recommendations
 */
export function generateRecommendations(accuracy, correlationData) {
  const recommendations = [];

  // Threshold recommendations based on FPR/FNR
  if (!accuracy.insufficient_data) {
    if (accuracy.fpr > 0.3) {
      recommendations.push({
        type: 'RAISE_THRESHOLD',
        target: 'high_threshold',
        current: accuracy.high_threshold || 80,
        reason: `FPR of ${accuracy.fpr} exceeds 0.3 — too many high-scoring ventures are failing gates`,
        priority: 'high',
      });
    }

    if (accuracy.fnr > 0.3) {
      recommendations.push({
        type: 'LOWER_THRESHOLD',
        target: 'low_threshold',
        current: accuracy.low_threshold || 50,
        reason: `FNR of ${accuracy.fnr} exceeds 0.3 — too many low-scoring ventures are passing gates`,
        priority: 'high',
      });
    }
  }

  // Dimension recommendations based on correlations
  if (!correlationData.insufficient_data && correlationData.dimensions?.length > 0) {
    const { correlations, dimensions } = correlationData;
    const gates = Object.keys(correlations).map(Number);

    for (const dim of dimensions) {
      const rValues = gates
        .map(g => correlations[g]?.[dim])
        .filter(c => c && c.classification !== 'insufficient_data');

      if (rValues.length === 0) continue;

      const maxR = Math.max(...rValues.map(v => Math.abs(v.r)));
      const allNoise = rValues.every(v => Math.abs(v.r) < 0.1);

      if (allNoise) {
        recommendations.push({
          type: 'DROP',
          target: dim,
          reason: 'Correlation r < 0.1 at all gates — dimension adds noise, not signal',
          max_r: round3(maxR),
          priority: 'medium',
        });
      } else if (maxR > 0.5) {
        recommendations.push({
          type: 'INCREASE_WEIGHT',
          target: dim,
          reason: 'Strong correlation (r > 0.5) at one or more gates — dimension is highly predictive',
          max_r: round3(maxR),
          priority: 'high',
        });
      } else {
        recommendations.push({
          type: 'KEEP',
          target: dim,
          reason: 'Moderate correlation (0.1 <= r <= 0.5) — dimension has some predictive value',
          max_r: round3(maxR),
          priority: 'low',
        });
      }
    }
  }

  return recommendations;
}

/**
 * Get the most recent calibration report.
 *
 * @param {Object} deps - { supabase, logger }
 * @returns {Promise<Object>} calibration report
 */
export async function getLatestCalibrationReport(deps) {
  // Generate fresh report. In future, cache in DB.
  return generateCalibrationReport(deps);
}

// --- Internal helpers ---

/**
 * Compute point-biserial correlation coefficient.
 *
 * r_pb = (M1 - M0) / S * sqrt(n0 * n1 / n^2)
 *
 * @param {Array<{score: number, passed: boolean}>} data
 * @returns {number} correlation coefficient (-1 to 1)
 */
function pointBiserialCorrelation(data) {
  if (data.length < 2) return 0;

  const passed = data.filter(d => d.passed);
  const failed = data.filter(d => !d.passed);

  if (passed.length === 0 || failed.length === 0) return 0;

  const n = data.length;
  const n1 = passed.length;
  const n0 = failed.length;

  const m1 = passed.reduce((sum, d) => sum + d.score, 0) / n1;
  const m0 = failed.reduce((sum, d) => sum + d.score, 0) / n0;

  // Overall standard deviation
  const allScores = data.map(d => d.score);
  const mean = allScores.reduce((s, v) => s + v, 0) / n;
  const variance = allScores.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);

  if (sd === 0) return 0;

  return (m1 - m0) / sd * Math.sqrt((n0 * n1) / (n * n));
}

/**
 * Classify a correlation coefficient.
 * @param {number} r
 * @returns {string} 'predictive' | 'noise' | 'moderate'
 */
function classifyCorrelation(r) {
  const absR = Math.abs(r);
  if (absR > 0.3) return 'predictive';
  if (absR < 0.1) return 'noise';
  return 'moderate';
}

function round3(n) { return Math.round(n * 1000) / 1000; }

export { DEFAULT_GATE_STAGES, MIN_SAMPLE_SIZE, pointBiserialCorrelation, classifyCorrelation };
