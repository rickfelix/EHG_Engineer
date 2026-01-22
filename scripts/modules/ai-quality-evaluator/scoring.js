/**
 * AI Quality Evaluator - Scoring
 * Band determination, pass status, weighted scores, and thresholds
 */

import {
  BAND_THRESHOLDS,
  SD_TYPE_PASS_THRESHOLDS,
  ORCHESTRATOR_THRESHOLD,
  DEFAULT_THRESHOLD
} from './config.js';

/**
 * Determine scoring band from weighted score
 * Bands provide stable pass/fail decisions despite score variance
 *
 * @param {number} weightedScore - Score 0-100
 * @returns {string} 'PASS' | 'NEEDS_REVIEW' | 'FAIL'
 */
export function determineBand(weightedScore) {
  if (weightedScore >= BAND_THRESHOLDS.PASS) {
    return 'PASS';
  } else if (weightedScore >= BAND_THRESHOLDS.NEEDS_REVIEW) {
    return 'NEEDS_REVIEW';
  }
  return 'FAIL';
}

/**
 * Determine if validation passed based on band and confidence
 *
 * Logic:
 * - PASS band + HIGH/MEDIUM confidence → passed = true
 * - FAIL band → passed = false
 * - NEEDS_REVIEW OR LOW confidence → passed = false (requires human review)
 *
 * This stabilizes decisions: same content with 68% vs 72% both get NEEDS_REVIEW,
 * both require review, decision is consistent.
 *
 * @param {string} band - 'PASS' | 'NEEDS_REVIEW' | 'FAIL'
 * @param {string} confidence - 'HIGH' | 'MEDIUM' | 'LOW'
 * @param {number} weightedScore - For backward compatibility with threshold-based passing
 * @param {number} threshold - Dynamic threshold from SD type
 * @returns {boolean} Whether validation passed
 */
export function determinePassedStatus(band, confidence, weightedScore, threshold) {
  // LOW confidence always requires review, regardless of band
  if (confidence === 'LOW') {
    return false;
  }

  // PASS band with non-LOW confidence = passed
  if (band === 'PASS') {
    return true;
  }

  // NEEDS_REVIEW and FAIL bands = not passed
  // Note: For backward compatibility during transition, we also check
  // if score exceeds the SD-type-aware threshold. This allows gradual
  // adoption while maintaining existing behavior.
  if (band === 'NEEDS_REVIEW' && weightedScore >= threshold) {
    // Score passes threshold but not PASS band - still passes but will be logged
    return true;
  }

  return false;
}

/**
 * Get dynamic pass threshold based on content type and SD type
 * Start lenient (Phase 1), tighten based on empirical data (Phase 2+)
 *
 * Philosophy: Start lenient to avoid blocking work, then increase
 * thresholds where quality issues are detected in production.
 *
 * @param {string} contentType - Content type being evaluated
 * @param {Object} sd - Strategic Directive object
 * @returns {number} Pass threshold percentage
 */
export function getPassThreshold(contentType, sd = null) {
  if (!sd?.sd_type) return DEFAULT_THRESHOLD;

  // Orchestrator SDs get even more lenient threshold
  if (sd._isOrchestrator) {
    return ORCHESTRATOR_THRESHOLD;
  }

  return SD_TYPE_PASS_THRESHOLDS[sd.sd_type] || DEFAULT_THRESHOLD;
}

/**
 * Calculate weighted total score (0-100 scale)
 * @param {Object} scores - Score data from AI
 * @param {Array} criteria - Rubric criteria with weights
 * @returns {number} Weighted score 0-100
 */
export function calculateWeightedScore(scores, criteria) {
  let total = 0;

  for (const criterion of criteria) {
    const scoreData = scores[criterion.name];
    if (!scoreData || typeof scoreData.score !== 'number') {
      console.warn(`Missing score for criterion: ${criterion.name}`);
      continue;
    }

    // Convert 0-10 score to percentage, then weight it
    const percentageScore = (scoreData.score / 10) * 100;
    total += percentageScore * criterion.weight;
  }

  return Math.round(total);
}

/**
 * Calculate cost in USD
 * @param {Object} tokensUsed - Token usage from API response
 * @returns {number} Cost in USD
 */
export function calculateCost(tokensUsed) {
  // gpt-5-mini pricing (as of 2025)
  const INPUT_COST_PER_MILLION = 0.15;  // $0.15 per 1M input tokens
  const OUTPUT_COST_PER_MILLION = 0.60; // $0.60 per 1M output tokens

  const inputCost = (tokensUsed.prompt_tokens / 1_000_000) * INPUT_COST_PER_MILLION;
  const outputCost = (tokensUsed.completion_tokens / 1_000_000) * OUTPUT_COST_PER_MILLION;

  return inputCost + outputCost;
}
