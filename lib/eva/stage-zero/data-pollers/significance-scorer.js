/**
 * Significance Scorer
 * Scores competitive ranking movements on a 0-100 scale based on magnitude, context, and source weight.
 *
 * Part of SD-LEO-INFRA-COMPETITOR-MONITORING-PHASE-004
 */

const SOURCE_WEIGHTS = {
  apple_appstore: 1.0,
  google_play: 1.0,
  product_hunt: 0.8,
};

/**
 * Score a single ranking movement.
 *
 * @param {Object} movement
 * @param {number} movement.magnitude - Absolute position change
 * @param {string} movement.direction - 'up' or 'down'
 * @param {string} movement.source - Data source identifier
 * @param {number} movement.current_position - Current ranking position
 * @param {Object} [options]
 * @param {number} [options.maxMagnitude=50] - Movement magnitude that maps to max score
 * @returns {number} Score 0-100
 */
export function scoreMovement(movement, options = {}) {
  const { maxMagnitude = 50 } = options;

  // Base score from magnitude (0-60 points)
  const magnitudeScore = Math.min(movement.magnitude / maxMagnitude, 1) * 60;

  // Position bonus: movements in top 20 are more significant (0-20 points)
  const positionBonus = movement.current_position <= 20
    ? 20 * (1 - (movement.current_position - 1) / 19)
    : 0;

  // Source weight (0-10 points)
  const sourceWeight = (SOURCE_WEIGHTS[movement.source] || 0.5) * 10;

  // Direction bonus: upward movements slightly more actionable (0-10 points)
  const directionBonus = movement.direction === 'up' ? 10 : 5;

  const rawScore = magnitudeScore + positionBonus + sourceWeight + directionBonus;
  return Math.round(Math.min(rawScore, 100));
}

/**
 * Score a batch of movements.
 *
 * @param {Array} movements - Array of movement objects from change-detector.js
 * @param {Object} [options] - Scoring options
 * @returns {Array} Movements with added `significance_score` field, sorted by score descending
 */
export function scoreMovements(movements, options = {}) {
  if (!movements || movements.length === 0) return [];

  return movements
    .map(m => ({
      ...m,
      significance_score: scoreMovement(m, options),
    }))
    .sort((a, b) => b.significance_score - a.significance_score);
}
