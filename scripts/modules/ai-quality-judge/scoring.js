/**
 * Russian Judge Scoring Module
 * Phase 1: SD-LEO-SELF-IMPROVE-AIJUDGE-001
 *
 * Multi-criterion weighted scoring for improvement proposals
 */

import { SCORING_CRITERIA, RECOMMENDATION_THRESHOLDS } from './config.js';

/**
 * Calculate weighted score from criterion scores
 *
 * @param {Object} criteriaScores - Scores for each criterion (0-10)
 * @returns {number} Weighted aggregate score (0-100)
 */
export function calculateWeightedScore(criteriaScores) {
  let totalScore = 0;
  let totalWeight = 0;

  for (const [criterion, config] of Object.entries(SCORING_CRITERIA)) {
    const score = criteriaScores[criterion];
    if (typeof score === 'number' && !isNaN(score)) {
      // Normalize 0-10 to 0-100 and apply weight
      totalScore += (score / 10) * config.weight;
      totalWeight += config.weight;
    }
  }

  // Return normalized score
  if (totalWeight === 0) return 0;
  return Math.round((totalScore / totalWeight) * 100);
}

/**
 * Determine recommendation based on score
 *
 * @param {number} score - Aggregate score (0-100)
 * @returns {string} Recommendation: APPROVE, NEEDS_REVISION, or REJECT
 */
export function getRecommendation(score) {
  if (score >= RECOMMENDATION_THRESHOLDS.approve_high) {
    return 'APPROVE';
  } else if (score >= RECOMMENDATION_THRESHOLDS.approve_medium) {
    return 'APPROVE';
  } else if (score >= RECOMMENDATION_THRESHOLDS.needs_revision) {
    return 'NEEDS_REVISION';
  } else {
    return 'REJECT';
  }
}

/**
 * Get confidence level based on score
 *
 * @param {number} score - Aggregate score (0-100)
 * @returns {string} Confidence: HIGH, MEDIUM, or LOW
 */
export function getConfidenceLevel(score) {
  if (score >= RECOMMENDATION_THRESHOLDS.approve_high) {
    return 'HIGH';
  } else if (score >= RECOMMENDATION_THRESHOLDS.approve_medium) {
    return 'MEDIUM';
  } else {
    return 'LOW';
  }
}

/**
 * Parse AI response to extract criterion scores
 *
 * @param {string} aiResponse - Raw AI response with scores
 * @returns {Object} Parsed criterion scores
 */
export function parseAIScores(aiResponse) {
  const scores = {};

  // Try to parse JSON response
  try {
    const jsonMatch = aiResponse.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.criteria_scores) {
        return parsed.criteria_scores;
      }
      return parsed;
    }

    // Try direct JSON parse
    const parsed = JSON.parse(aiResponse);
    if (parsed.criteria_scores) {
      return parsed.criteria_scores;
    }
    return parsed;
  } catch (_e) {
    // Fallback: extract scores from text
    for (const criterion of Object.keys(SCORING_CRITERIA)) {
      const regex = new RegExp(`${criterion}[:\\s]+([0-9]+(?:\\.[0-9]+)?)`, 'i');
      const match = aiResponse.match(regex);
      if (match) {
        scores[criterion] = parseFloat(match[1]);
      }
    }
  }

  return scores;
}

/**
 * Validate criterion scores
 *
 * @param {Object} scores - Criterion scores to validate
 * @returns {Object} Validation result
 */
export function validateScores(scores) {
  const errors = [];
  const validatedScores = {};

  for (const criterion of Object.keys(SCORING_CRITERIA)) {
    const score = scores[criterion];

    if (score === undefined || score === null) {
      errors.push(`Missing score for criterion: ${criterion}`);
      validatedScores[criterion] = 5; // Default to middle score
    } else if (typeof score !== 'number' || isNaN(score)) {
      errors.push(`Invalid score type for ${criterion}: ${typeof score}`);
      validatedScores[criterion] = 5;
    } else if (score < 0 || score > 10) {
      errors.push(`Score out of range for ${criterion}: ${score} (must be 0-10)`);
      validatedScores[criterion] = Math.max(0, Math.min(10, score));
    } else {
      validatedScores[criterion] = score;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    scores: validatedScores
  };
}

/**
 * Generate scoring summary for display
 *
 * @param {Object} criteriaScores - Scores for each criterion
 * @param {number} aggregateScore - Total weighted score
 * @param {string} recommendation - APPROVE/REJECT/NEEDS_REVISION
 * @returns {string} Formatted summary
 */
export function generateScoringSummary(criteriaScores, aggregateScore, recommendation) {
  const lines = [
    '┌─────────────────────────────────────────────────┐',
    '│           AI QUALITY JUDGE ASSESSMENT           │',
    '├─────────────────────────────────────────────────┤'
  ];

  for (const [criterion, config] of Object.entries(SCORING_CRITERIA)) {
    const score = criteriaScores[criterion] ?? 0;
    const bar = '█'.repeat(Math.round(score)) + '░'.repeat(10 - Math.round(score));
    const weightStr = `(${config.weight}%)`.padStart(6);
    lines.push(`│ ${criterion.padEnd(12)} ${bar} ${score.toFixed(1)}/10 ${weightStr} │`);
  }

  lines.push('├─────────────────────────────────────────────────┤');
  lines.push(`│ AGGREGATE SCORE: ${aggregateScore.toString().padStart(3)}%                         │`);
  lines.push(`│ RECOMMENDATION:  ${recommendation.padEnd(15)}               │`);
  lines.push(`│ CONFIDENCE:      ${getConfidenceLevel(aggregateScore).padEnd(15)}               │`);
  lines.push('└─────────────────────────────────────────────────┘');

  return lines.join('\n');
}

/**
 * Create scoring result object
 *
 * @param {Object} criteriaScores - Individual criterion scores
 * @param {string} reasoning - AI's reasoning for scores
 * @returns {Object} Complete scoring result
 */
export function createScoringResult(criteriaScores, reasoning = '') {
  const validation = validateScores(criteriaScores);
  const aggregateScore = calculateWeightedScore(validation.scores);
  const recommendation = getRecommendation(aggregateScore);
  const confidence = getConfidenceLevel(aggregateScore);

  return {
    criteria_scores: validation.scores,
    aggregate_score: aggregateScore,
    recommendation,
    confidence,
    reasoning,
    validation_errors: validation.errors,
    scored_at: new Date().toISOString()
  };
}

export default {
  calculateWeightedScore,
  getRecommendation,
  getConfidenceLevel,
  parseAIScores,
  validateScores,
  generateScoringSummary,
  createScoringResult
};
