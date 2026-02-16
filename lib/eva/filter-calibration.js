/**
 * Filter Calibration Module
 * SD-LEO-FEAT-FILTER-CALIBRATE-001
 *
 * Compares Decision Filter Engine outputs against Chairman decisions
 * to compute accuracy metrics and generate threshold recommendations.
 *
 * Pure read-only analysis — never modifies chairman_decisions or preferences.
 * Uses dependency injection for Supabase client.
 */

import { TRIGGER_TYPES, DEFAULTS, PREFERENCE_KEYS } from './decision-filter-engine.js';

/**
 * Maps trigger types to their configurable threshold preference keys.
 * Used by calibration to identify which thresholds can be adjusted.
 */
export const CALIBRATION_KEYS = {
  cost_threshold: { preferenceKey: PREFERENCE_KEYS.cost_threshold, defaultValue: DEFAULTS['filter.cost_max_usd'], unit: 'usd', type: 'number' },
  low_score: { preferenceKey: PREFERENCE_KEYS.low_score, defaultValue: DEFAULTS['filter.min_score'], unit: 'score', type: 'number' },
};

/**
 * Run full calibration analysis against chairman decisions.
 *
 * @param {Object} supabase - Supabase client (injected)
 * @param {Object} [options]
 * @param {number} [options.minSamples=5] - Min samples to generate a recommendation
 * @param {number} [options.maxDelta=0.20] - Max proportional threshold adjustment (20%)
 * @param {number} [options.minConfidence=0.6] - Min confidence for recommendations
 * @param {number} [options.minSamplesPerRule=5] - Min samples per trigger type
 * @param {string} [options.since] - ISO date to filter decisions from
 * @param {string} [options.until] - ISO date to filter decisions until
 * @returns {Promise<Object>} Calibration report
 */
export async function runCalibration(supabase, options = {}) {
  const config = {
    minSamples: options.minSamples ?? 5,
    maxDelta: options.maxDelta ?? 0.20,
    minConfidence: options.minConfidence ?? 0.6,
    minSamplesPerRule: options.minSamplesPerRule ?? 5,
    since: options.since ?? null,
    until: options.until ?? null,
  };

  // Fetch resolved decisions with DFE context
  let query = supabase
    .from('chairman_decisions')
    .select('id, venture_id, lifecycle_stage, status, decision, dfe_context, created_at')
    .not('dfe_context', 'is', null)
    .in('status', ['approved', 'rejected']);

  if (config.since) query = query.gte('created_at', config.since);
  if (config.until) query = query.lte('created_at', config.until);

  const { data: reviewDecisions, error } = await query.order('created_at', { ascending: true });

  if (error) {
    return { error: error.message, total_decisions: 0 };
  }

  // Also fetch auto-proceed decisions (no chairman decision created = filter approved)
  // These are tracked via venture_artifacts with filter results
  const decisions = (reviewDecisions || []).filter(d => isValidDfeContext(d.dfe_context));

  if (decisions.length === 0) {
    return buildEmptyReport(config);
  }

  // Compute confusion matrix
  const matrix = computeConfusionMatrix(decisions);
  const overallMetrics = computeMetrics(matrix);

  // Per-trigger breakdown
  const perTrigger = computePerTriggerMetrics(decisions, config);

  // Generate recommendations
  const recommendations = generateRecommendations(perTrigger, config);

  // Build period info
  const period = {
    from: decisions[0].created_at,
    to: decisions[decisions.length - 1].created_at,
  };

  return {
    total_decisions: decisions.length,
    agreement_rate: overallMetrics.agreement_rate,
    false_positive_rate: overallMetrics.false_positive_rate,
    false_negative_rate: overallMetrics.false_negative_rate,
    confusion_matrix: matrix,
    period,
    per_trigger: perTrigger.included,
    excluded_rules: perTrigger.excluded,
    recommendations: recommendations.included,
    top_recommendations: recommendations.included
      .sort((a, b) => b.impact_score - a.impact_score)
      .slice(0, 3),
    config,
  };
}

/**
 * Compute confusion matrix from resolved chairman decisions.
 *
 * Positive = proceed (filter said auto_proceed=true OR chairman approved)
 * - TP: filter said proceed, chairman approved
 * - FP: filter said don't proceed (REQUIRE_REVIEW), chairman approved anyway
 * - FN: filter said proceed but chairman would have rejected (detected via override decisions)
 * - TN: filter said don't proceed, chairman rejected
 *
 * Note: Since all decisions in our dataset went through REQUIRE_REVIEW
 * (auto_proceed=false triggered the chairman decision), we track:
 * - FP = chairman approved (filter was too conservative)
 * - TN = chairman rejected (filter was correct to flag)
 */
export function computeConfusionMatrix(decisions) {
  let tp = 0, tn = 0, fp = 0, fn = 0;

  for (const d of decisions) {
    const filterSaidProceed = d.dfe_context?.auto_proceed === true;
    const chairmanApproved = d.status === 'approved' || d.decision === 'proceed';

    if (filterSaidProceed && chairmanApproved) tp++;
    else if (filterSaidProceed && !chairmanApproved) fn++;
    else if (!filterSaidProceed && chairmanApproved) fp++;
    else tn++;
  }

  return { tp, tn, fp, fn, total: tp + tn + fp + fn };
}

/**
 * Compute accuracy metrics from confusion matrix.
 */
export function computeMetrics(matrix) {
  const { tp, tn, fp, fn, total } = matrix;

  return {
    agreement_rate: total > 0 ? (tp + tn) / total : null,
    false_positive_rate: (fp + tn) > 0 ? fp / (fp + tn) : null,
    false_negative_rate: (fn + tp) > 0 ? fn / (fn + tp) : null,
    total,
  };
}

/**
 * Compute per-trigger-type metrics.
 * Each trigger in dfe_context.triggers is tracked independently.
 */
export function computePerTriggerMetrics(decisions, config) {
  const triggerStats = {};

  for (const d of decisions) {
    const triggers = d.dfe_context?.triggers || [];
    const chairmanApproved = d.status === 'approved' || d.decision === 'proceed';

    for (const trigger of triggers) {
      const type = trigger.type;
      if (!type) continue;

      if (!triggerStats[type]) {
        triggerStats[type] = { type, samples: 0, fp: 0, tn: 0, thresholds_used: [] };
      }

      triggerStats[type].samples++;

      // For REQUIRE_REVIEW triggers: chairman approved = false positive, rejected = true negative
      if (chairmanApproved) {
        triggerStats[type].fp++;
      } else {
        triggerStats[type].tn++;
      }

      // Track thresholds used
      const threshold = trigger.details?.thresholdUsed ?? trigger.details?.threshold;
      if (threshold !== undefined && threshold !== null) {
        triggerStats[type].thresholds_used.push(threshold);
      }
    }
  }

  const included = [];
  const excluded = [];

  for (const [type, stats] of Object.entries(triggerStats)) {
    if (stats.samples < config.minSamplesPerRule) {
      excluded.push({ type, samples: stats.samples, reason: 'insufficient_samples' });
    } else {
      const fpRate = (stats.fp + stats.tn) > 0 ? stats.fp / (stats.fp + stats.tn) : null;
      included.push({
        type,
        samples: stats.samples,
        fp: stats.fp,
        tn: stats.tn,
        false_positive_rate: fpRate,
        high_fp: fpRate !== null && fpRate > 0.5,
        avg_threshold: stats.thresholds_used.length > 0
          ? stats.thresholds_used.reduce((a, b) => a + b, 0) / stats.thresholds_used.length
          : null,
      });
    }
  }

  return { included, excluded };
}

/**
 * Generate threshold adjustment recommendations.
 */
export function generateRecommendations(perTriggerResult, config) {
  const included = [];
  const excluded = [];

  for (const trigger of perTriggerResult.included) {
    const calibrationKey = CALIBRATION_KEYS[trigger.type];

    if (!calibrationKey) {
      // Not a calibratable trigger type
      continue;
    }

    if (trigger.samples < config.minSamples) {
      excluded.push({ trigger_type: trigger.type, reason: 'insufficient_samples', samples: trigger.samples });
      continue;
    }

    // Compute confidence based on sample size
    const confidence = computeConfidence(trigger.samples);
    if (confidence.score < config.minConfidence) {
      excluded.push({
        trigger_type: trigger.type,
        reason: 'confidence_below_threshold',
        confidence: confidence.level,
        confidence_score: confidence.score,
        samples: trigger.samples,
      });
      continue;
    }

    const currentThreshold = calibrationKey.defaultValue;
    const fpRate = trigger.false_positive_rate ?? 0;

    // Determine direction: high FP rate → loosen threshold, low FP rate → keep or tighten
    let direction = 'keep';
    let suggestedThreshold = currentThreshold;
    let clampedDeltaApplied = false;

    if (fpRate > 0.5) {
      // Too many false positives → loosen the threshold
      direction = 'loosen';
      const rawDelta = currentThreshold * fpRate * 0.5; // Proportional adjustment
      const maxAllowedDelta = currentThreshold * config.maxDelta;
      const actualDelta = Math.min(rawDelta, maxAllowedDelta);
      clampedDeltaApplied = rawDelta > maxAllowedDelta;

      if (calibrationKey.type === 'number') {
        // For cost: increase threshold (loosen = allow higher costs)
        suggestedThreshold = currentThreshold + actualDelta;
      }
    } else if (fpRate < 0.2) {
      // Very few false positives → could tighten (but cautiously)
      direction = 'tighten';
      const rawDelta = currentThreshold * (1 - fpRate) * 0.1; // Small tightening
      const maxAllowedDelta = currentThreshold * config.maxDelta;
      const actualDelta = Math.min(rawDelta, maxAllowedDelta);
      clampedDeltaApplied = rawDelta > maxAllowedDelta;

      if (calibrationKey.type === 'number') {
        suggestedThreshold = currentThreshold - actualDelta;
      }
    }

    // Impact score: higher FP rate with more samples = more impactful change
    const impactScore = fpRate * Math.log10(trigger.samples + 1);

    included.push({
      trigger_type: trigger.type,
      current_threshold: currentThreshold,
      suggested_threshold: Math.round(suggestedThreshold * 100) / 100,
      direction,
      confidence: confidence.level,
      confidence_score: confidence.score,
      clamped_delta_applied: clampedDeltaApplied,
      supporting_data: {
        sample_count: trigger.samples,
        fp_rate: fpRate,
        fp_count: trigger.fp,
        tn_count: trigger.tn,
      },
      rationale: buildRationale(trigger, direction, clampedDeltaApplied),
      impact_score: Math.round(impactScore * 1000) / 1000,
    });
  }

  return { included, excluded };
}

/**
 * Build full calibration report (convenience wrapper).
 */
export async function buildCalibrationReport(supabase, options = {}) {
  return runCalibration(supabase, options);
}

// ── Internal Helpers ──────────────────────────────────────────

function isValidDfeContext(ctx) {
  return ctx && typeof ctx === 'object' && 'auto_proceed' in ctx;
}

function computeConfidence(sampleCount) {
  if (sampleCount < 5) return { level: 'none', score: 0 };
  if (sampleCount < 10) return { level: 'low', score: 0.4 };
  if (sampleCount < 50) return { level: 'medium', score: 0.7 };
  return { level: 'high', score: 0.9 };
}

function buildRationale(trigger, direction, clamped) {
  const parts = [];

  if (direction === 'loosen') {
    parts.push(`${trigger.type} has ${(trigger.false_positive_rate * 100).toFixed(1)}% false positive rate (${trigger.fp}/${trigger.fp + trigger.tn} flagged decisions were approved by chairman)`);
    parts.push('Consider loosening threshold to reduce unnecessary reviews');
  } else if (direction === 'tighten') {
    parts.push(`${trigger.type} has only ${(trigger.false_positive_rate * 100).toFixed(1)}% false positive rate — threshold may be too permissive`);
  } else {
    parts.push(`${trigger.type} false positive rate (${(trigger.false_positive_rate * 100).toFixed(1)}%) is within acceptable range`);
  }

  if (clamped) {
    parts.push('Suggested adjustment was clamped to maximum 20% delta from current threshold');
  }

  return parts.join('. ') + '.';
}

function buildEmptyReport(config) {
  return {
    total_decisions: 0,
    agreement_rate: null,
    false_positive_rate: null,
    false_negative_rate: null,
    confusion_matrix: { tp: 0, tn: 0, fp: 0, fn: 0, total: 0 },
    period: null,
    per_trigger: [],
    excluded_rules: [],
    recommendations: [],
    top_recommendations: [],
    config,
  };
}
