/**
 * AI Quality Evaluator - Feedback Generation
 * Graduated feedback based on scores, weights, and SD type
 */

import { SD_TYPE_BLOCKING_THRESHOLDS } from './config.js';

/**
 * Get SD-type-aware blocking thresholds for generateFeedback
 * Aligns blocking behavior with pass thresholds by SD type
 *
 * @param {string} sdType - SD type (feature, infrastructure, documentation, etc.)
 * @returns {Object} { severeThreshold, majorThreshold }
 */
export function getBlockingThresholds(sdType) {
  return SD_TYPE_BLOCKING_THRESHOLDS[sdType] || SD_TYPE_BLOCKING_THRESHOLDS.feature;
}

/**
 * Generate graduated feedback from scores
 *
 * Blocking issues (required) are only generated for:
 * - High-weight criteria (weight >= 0.15) with score < 5
 * - Medium-weight criteria (weight >= 0.10) with score < 3 (severe failure)
 *
 * Low-weight criteria (< 0.10) NEVER block, even with severe scores
 * This prevents a 5% weight criterion from blocking the entire handoff
 *
 * Phase 1 (ADVISORY): Calibrating thresholds based on empirical data
 *
 * @param {Object} scores - Score data from AI
 * @param {Array} criteria - Rubric criteria with weights
 * @param {Object} sd - Strategic Directive object
 * @returns {Object} { required, recommended, improvements }
 */
export function generateFeedback(scores, criteria = null, sd = null) {
  const required = [];
  const recommended = [];
  const improvements = []; // Actionable improvement suggestions

  // SD-TYPE-AWARE BLOCKING THRESHOLDS
  const sdType = sd?.sd_type || 'feature';
  const blockingConfig = getBlockingThresholds(sdType);

  // Build weight lookup from criteria config
  const weightLookup = {};
  if (criteria && Array.isArray(criteria)) {
    for (const c of criteria) {
      weightLookup[c.name] = c.weight;
    }
  }

  for (const [criterionName, scoreData] of Object.entries(scores)) {
    const score = scoreData.score;
    const reasoning = scoreData.reasoning;
    const improvement = scoreData.improvement || '';
    const weight = weightLookup[criterionName] || 0.10; // Default to 10% if unknown

    // Collect improvement suggestions for any score < 8
    if (score < 8 && improvement) {
      improvements.push({
        criterion: criterionName,
        score,
        weight,
        suggestion: improvement
      });
    }

    // Low-weight criteria (<10%) NEVER block, regardless of score
    // This is critical for Phase 1 calibration
    if (weight < 0.10) {
      if (score < 5) {
        recommended.push(`${criterionName}: Needs improvement (${score}/10) - ${reasoning}`);
      } else if (score < 7) {
        recommended.push(`${criterionName}: Room for improvement (${score}/10) - ${reasoning}`);
      }
      continue;
    }

    // For medium+ weight criteria (>=10%) - SD-TYPE-AWARE BLOCKING
    if (score < blockingConfig.severeThreshold && weight >= 0.10) {
      // Severe failure on medium+ weight criteria - blocking
      required.push(`${criterionName}: Needs significant improvement (${score}/10) - ${reasoning}`);
    } else if (score < blockingConfig.majorThreshold && weight >= 0.15) {
      // Major criterion failure - blocking only for high-weight criteria
      required.push(`${criterionName}: Needs significant improvement (${score}/10) - ${reasoning}`);
    } else if (score < 5) {
      // Medium-weight with score 3-4 - recommended, not blocking
      recommended.push(`${criterionName}: Needs improvement (${score}/10) - ${reasoning}`);
    } else if (score < 7) {
      recommended.push(`${criterionName}: Room for improvement (${score}/10) - ${reasoning}`);
    }
    // Scores 7+ are good, no feedback needed
  }

  return { required, recommended, improvements };
}
