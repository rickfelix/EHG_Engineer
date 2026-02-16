/**
 * Assumption-Reality Tracker for EVA Pipeline
 * SD-MAN-ORCH-EVA-INTELLIGENCE-LAYER-001-D
 *
 * Closes the assumptions-vs-reality loop:
 *   1. Collects reality measurements from venture_artifacts at stage >= 17
 *   2. Builds calibration reports comparing assumptions vs reality
 *   3. Updates assumption_sets with reality_data, calibration_report, status
 *
 * Design principles (matching token-tracker.js):
 *   - Fire-and-forget for writes (errors logged, never thrown)
 *   - Dependency-injected supabase client
 *   - Pure analysis functions where possible
 *   - Deterministic rounding via round2()
 */

import { round2 } from '../cross-venture-learning.js';

const REALITY_STAGE_THRESHOLD = 17;

const ASSUMPTION_CATEGORIES = [
  'market_assumptions',
  'competitor_assumptions',
  'product_assumptions',
  'timing_assumptions',
];

const STATUS_THRESHOLDS = {
  VALIDATED: 0.7,
  INVALIDATED: 0.3,
};

/**
 * Collect reality measurements from venture_artifacts at stages >= 17.
 * Extracts factual data points that correspond to assumption categories.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {number} stageId - Current lifecycle stage
 * @param {Object} [logger=console] - Logger
 * @returns {Promise<Object|null>} Reality measurements keyed by category, or null on error
 */
export async function collectRealityMeasurements(supabase, ventureId, stageId, logger = console) {
  if (stageId < REALITY_STAGE_THRESHOLD) {
    return null;
  }

  try {
    const { data: artifacts, error } = await supabase
      .from('venture_artifacts')
      .select('artifact_type, artifact_data, lifecycle_stage')
      .eq('venture_id', ventureId)
      .eq('is_current', true)
      .gte('lifecycle_stage', REALITY_STAGE_THRESHOLD)
      .order('lifecycle_stage', { ascending: true });

    if (error) {
      logger.warn(`[RealityTracker] Artifact query failed: ${error.message}`);
      return null;
    }

    if (!artifacts || artifacts.length === 0) {
      return null;
    }

    const measurements = {
      market_assumptions: [],
      competitor_assumptions: [],
      product_assumptions: [],
      timing_assumptions: [],
    };

    for (const art of artifacts) {
      const data = art.artifact_data;
      if (!data || typeof data !== 'object') continue;

      // Extract market reality data
      if (data.market_validation || data.market_metrics || data.tam_sam_som) {
        measurements.market_assumptions.push({
          stage: art.lifecycle_stage,
          type: art.artifact_type,
          data: data.market_validation || data.market_metrics || data.tam_sam_som,
        });
      }

      // Extract competitor reality data
      if (data.competitive_analysis || data.competitor_data) {
        measurements.competitor_assumptions.push({
          stage: art.lifecycle_stage,
          type: art.artifact_type,
          data: data.competitive_analysis || data.competitor_data,
        });
      }

      // Extract product reality data
      if (data.product_metrics || data.user_feedback || data.feature_usage) {
        measurements.product_assumptions.push({
          stage: art.lifecycle_stage,
          type: art.artifact_type,
          data: data.product_metrics || data.user_feedback || data.feature_usage,
        });
      }

      // Extract timing reality data
      if (data.timeline_actual || data.milestone_tracking || data.sprint_velocity) {
        measurements.timing_assumptions.push({
          stage: art.lifecycle_stage,
          type: art.artifact_type,
          data: data.timeline_actual || data.milestone_tracking || data.sprint_velocity,
        });
      }
    }

    return measurements;
  } catch (err) {
    logger.warn(`[RealityTracker] collectRealityMeasurements failed: ${err.message}`);
    return null;
  }
}

/**
 * Build a calibration report comparing original assumptions vs reality.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {Object} [logger=console] - Logger
 * @returns {Promise<Object|null>} Calibration report or null on error
 */
export async function buildCalibrationReport(supabase, ventureId, logger = console) {
  try {
    // Load active assumption sets
    const { data: assumptionSets, error: asErr } = await supabase
      .from('assumption_sets')
      .select('id, market_assumptions, competitor_assumptions, product_assumptions, timing_assumptions, confidence_scores, status')
      .eq('venture_id', ventureId)
      .in('status', ['active', 'draft']);

    if (asErr) {
      logger.warn(`[RealityTracker] Assumption sets query failed: ${asErr.message}`);
      return null;
    }

    if (!assumptionSets || assumptionSets.length === 0) {
      return null;
    }

    // Load reality measurements from artifacts
    const { data: artifacts, error: artErr } = await supabase
      .from('venture_artifacts')
      .select('artifact_type, artifact_data, lifecycle_stage')
      .eq('venture_id', ventureId)
      .eq('is_current', true)
      .gte('lifecycle_stage', REALITY_STAGE_THRESHOLD);

    if (artErr) {
      logger.warn(`[RealityTracker] Reality artifacts query failed: ${artErr.message}`);
      return null;
    }

    const realityData = extractRealityFromArtifacts(artifacts || []);

    // Build per-category calibration
    const categoryScores = {};
    let totalScore = 0;
    let categoryCount = 0;

    for (const category of ASSUMPTION_CATEGORIES) {
      const assumptionData = mergeAssumptionCategory(assumptionSets, category);
      const reality = realityData[category] || {};

      if (Object.keys(assumptionData).length === 0 && Object.keys(reality).length === 0) {
        continue;
      }

      const score = computeCategoryAccuracy(assumptionData, reality);
      categoryScores[category] = {
        accuracy: round2(score.accuracy),
        matched_fields: score.matchedFields,
        total_fields: score.totalFields,
        error_magnitude: round2(score.errorMagnitude),
      };

      totalScore += score.accuracy;
      categoryCount++;
    }

    const aggregateAccuracy = categoryCount > 0 ? round2(totalScore / categoryCount) : 0;

    return {
      venture_id: ventureId,
      aggregate_accuracy: aggregateAccuracy,
      category_scores: categoryScores,
      reality_artifact_count: (artifacts || []).length,
      assumption_set_count: assumptionSets.length,
      calibrated_at: new Date().toISOString(),
      calibrator_version: '1.0.0',
    };
  } catch (err) {
    logger.warn(`[RealityTracker] buildCalibrationReport failed: ${err.message}`);
    return null;
  }
}

/**
 * Update assumption_sets with reality data, calibration report, and status.
 * Fire-and-forget: errors are logged but never thrown.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {number} stageId - Current lifecycle stage
 * @param {Object} calibrationReport - Result from buildCalibrationReport
 * @param {Object} [logger=console] - Logger
 */
export function updateAssumptionSetStatus(supabase, ventureId, stageId, calibrationReport, logger = console) {
  if (!supabase || !calibrationReport) return;

  const newStatus = deriveStatus(calibrationReport.aggregate_accuracy);

  // Fire-and-forget
  supabase
    .from('assumption_sets')
    .update({
      reality_data: calibrationReport.category_scores,
      calibration_report: calibrationReport,
      status: newStatus,
      finalized_at_stage: stageId,
    })
    .eq('venture_id', ventureId)
    .in('status', ['active', 'draft', 'partially_validated'])
    .then(({ error }) => {
      if (error) {
        logger.warn(`[RealityTracker] Update failed (non-fatal): ${error.message}`);
      }
    })
    .catch((err) => {
      logger.warn(`[RealityTracker] Update error (non-fatal): ${err.message}`);
    });
}

/**
 * Run the full reality tracking pipeline for a venture at the current stage.
 * Orchestrates collect → calibrate → update in sequence.
 *
 * @param {Object} params
 * @param {string} params.ventureId
 * @param {number} params.stageId
 * @param {Object} deps
 * @param {Object} deps.supabase
 * @param {Object} [deps.logger]
 * @returns {Promise<Object|null>} Calibration report or null if not applicable
 */
export async function runRealityTracking({ ventureId, stageId }, deps = {}) {
  const { supabase, logger = console } = deps;

  if (!supabase || stageId < REALITY_STAGE_THRESHOLD) {
    return null;
  }

  const measurements = await collectRealityMeasurements(supabase, ventureId, stageId, logger);
  if (!measurements) {
    return null;
  }

  const report = await buildCalibrationReport(supabase, ventureId, logger);
  if (!report) {
    return null;
  }

  // Fire-and-forget status update
  updateAssumptionSetStatus(supabase, ventureId, stageId, report, logger);

  return report;
}

// ── Internal helpers ──

/**
 * Extract reality data from artifacts into category buckets.
 */
function extractRealityFromArtifacts(artifacts) {
  const reality = {};
  for (const cat of ASSUMPTION_CATEGORIES) {
    reality[cat] = {};
  }

  for (const art of artifacts) {
    const data = art.artifact_data;
    if (!data || typeof data !== 'object') continue;

    if (data.market_validation) Object.assign(reality.market_assumptions, flattenObject(data.market_validation));
    if (data.market_metrics) Object.assign(reality.market_assumptions, flattenObject(data.market_metrics));
    if (data.competitive_analysis) Object.assign(reality.competitor_assumptions, flattenObject(data.competitive_analysis));
    if (data.product_metrics) Object.assign(reality.product_assumptions, flattenObject(data.product_metrics));
    if (data.user_feedback) Object.assign(reality.product_assumptions, flattenObject(data.user_feedback));
    if (data.timeline_actual) Object.assign(reality.timing_assumptions, flattenObject(data.timeline_actual));
    if (data.milestone_tracking) Object.assign(reality.timing_assumptions, flattenObject(data.milestone_tracking));
  }

  return reality;
}

/**
 * Flatten a nested object to single-level key-value pairs.
 */
function flattenObject(obj, prefix = '') {
  const result = {};
  if (!obj || typeof obj !== 'object') return result;

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

/**
 * Merge assumption data from multiple assumption sets for a given category.
 */
function mergeAssumptionCategory(assumptionSets, category) {
  const merged = {};
  for (const as of assumptionSets) {
    const catData = as[category];
    if (catData && typeof catData === 'object') {
      Object.assign(merged, flattenObject(catData));
    }
  }
  return merged;
}

/**
 * Compute accuracy score for a single category by comparing assumptions vs reality.
 *
 * accuracy_score = 1 - avg(error_magnitude)
 * where error_magnitude for each field is normalized to 0-1 range.
 */
function computeCategoryAccuracy(assumptions, reality) {
  const assumptionKeys = Object.keys(assumptions);
  const realityKeys = Object.keys(reality);

  if (assumptionKeys.length === 0) {
    return { accuracy: 0, matchedFields: 0, totalFields: 0, errorMagnitude: 1 };
  }

  let totalError = 0;
  let matchedFields = 0;

  for (const key of assumptionKeys) {
    if (key in reality) {
      matchedFields++;
      const assumed = assumptions[key];
      const actual = reality[key];
      totalError += computeFieldError(assumed, actual);
    }
  }

  if (matchedFields === 0) {
    return { accuracy: 0, matchedFields: 0, totalFields: assumptionKeys.length, errorMagnitude: 1 };
  }

  const avgError = totalError / matchedFields;
  return {
    accuracy: round2(1 - avgError),
    matchedFields,
    totalFields: assumptionKeys.length,
    errorMagnitude: round2(avgError),
  };
}

/**
 * Compute error magnitude for a single field (0 = exact match, 1 = max divergence).
 */
function computeFieldError(assumed, actual) {
  // Both numeric: relative error capped at 1
  if (typeof assumed === 'number' && typeof actual === 'number') {
    if (assumed === 0 && actual === 0) return 0;
    const denom = Math.max(Math.abs(assumed), Math.abs(actual), 1);
    return Math.min(Math.abs(assumed - actual) / denom, 1);
  }

  // Both strings: exact match = 0, mismatch = 1
  if (typeof assumed === 'string' && typeof actual === 'string') {
    return assumed.toLowerCase() === actual.toLowerCase() ? 0 : 1;
  }

  // Both booleans: match = 0, mismatch = 1
  if (typeof assumed === 'boolean' && typeof actual === 'boolean') {
    return assumed === actual ? 0 : 1;
  }

  // Type mismatch = full error
  return 1;
}

/**
 * Derive assumption set status from aggregate accuracy.
 */
function deriveStatus(accuracy) {
  if (accuracy >= STATUS_THRESHOLDS.VALIDATED) return 'validated';
  if (accuracy < STATUS_THRESHOLDS.INVALIDATED) return 'invalidated';
  return 'partially_validated';
}

// Exported for testing
export const _internal = {
  extractRealityFromArtifacts,
  flattenObject,
  mergeAssumptionCategory,
  computeCategoryAccuracy,
  computeFieldError,
  deriveStatus,
  REALITY_STAGE_THRESHOLD,
  STATUS_THRESHOLDS,
  ASSUMPTION_CATEGORIES,
};
