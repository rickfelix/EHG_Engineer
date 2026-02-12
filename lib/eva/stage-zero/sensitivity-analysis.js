/**
 * Sensitivity Analysis Engine
 *
 * Performs one-at-a-time (OAT) weight perturbation analysis to identify
 * which synthesis component weights most influence composite venture scores.
 *
 * Part of SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-F
 */

import { calculateWeightedScore, VALID_COMPONENTS } from './profile-service.js';

const DEFAULT_DELTA = 0.05;

/**
 * Run one-at-a-time sensitivity analysis on synthesis results.
 *
 * For each component weight, perturb it by ±delta while holding others constant,
 * then measure the composite score shift. Returns components ranked by influence.
 *
 * @param {Object} synthesisResults - Map of component name → result object
 * @param {Object} weights - Map of component name → weight (0-1)
 * @param {Object} [options]
 * @param {number} [options.delta=0.05] - Perturbation amount for each weight
 * @returns {Array<Object>} Ranked array of { component, influence_score, elasticity, score_delta }
 */
export function runSensitivityAnalysis(synthesisResults, weights, options = {}) {
  const delta = options.delta ?? DEFAULT_DELTA;

  if (!synthesisResults || !weights) {
    return VALID_COMPONENTS.map(c => ({
      component: c,
      influence_score: 0,
      elasticity: 0,
      score_delta: 0,
    }));
  }

  const results = [];
  let totalAbsDelta = 0;

  for (const component of VALID_COMPONENTS) {
    const _currentWeight = weights[component] ?? 0;
    const elasticity = calculateElasticity(component, synthesisResults, weights, delta);
    const scoreDelta = Math.abs(elasticity * delta);

    results.push({
      component,
      influence_score: 0, // placeholder, normalized below
      elasticity,
      score_delta: Math.round(scoreDelta * 100) / 100,
    });

    totalAbsDelta += scoreDelta;
  }

  // Normalize influence scores to sum to 1.0
  for (const r of results) {
    r.influence_score = totalAbsDelta > 0
      ? Math.round((r.score_delta / totalAbsDelta) * 10000) / 10000
      : 0;
  }

  // Sort by influence descending
  results.sort((a, b) => b.influence_score - a.influence_score);

  return results;
}

/**
 * Identify the minimal set of key driver components that explain
 * at least the given threshold of total score variance.
 *
 * @param {Array<Object>} ranking - Output from runSensitivityAnalysis
 * @param {number} [threshold=0.80] - Minimum cumulative influence to reach
 * @returns {Array<Object>} Subset of ranking explaining ≥ threshold of variance
 */
export function identifyKeyDrivers(ranking, threshold = 0.80) {
  if (!ranking || ranking.length === 0) return [];

  // Ranking should already be sorted by influence descending
  const sorted = [...ranking].sort((a, b) => b.influence_score - a.influence_score);

  const drivers = [];
  let cumulative = 0;

  for (const item of sorted) {
    drivers.push(item);
    cumulative += item.influence_score;
    if (cumulative >= threshold) break;
  }

  return drivers;
}

/**
 * Calculate the elasticity coefficient for a single component.
 *
 * Elasticity = (score_at_weight+delta - score_at_weight-delta) / (2 * delta)
 *
 * This measures how sensitive the composite score is to changes in this
 * component's weight, in units of "score points per unit weight change".
 *
 * @param {string} component - Component name
 * @param {Object} synthesisResults - Map of component → result object
 * @param {Object} weights - Map of component → weight
 * @param {number} [delta=0.05] - Perturbation amount
 * @returns {number} Elasticity coefficient
 */
export function calculateElasticity(component, synthesisResults, weights, delta = DEFAULT_DELTA) {
  if (!synthesisResults || !weights) return 0;

  const currentWeight = weights[component] ?? 0;

  // If weight is 0 and delta would go negative, elasticity is 0
  if (currentWeight === 0 && delta > 0) {
    // Can only perturb upward from 0
    const weightsUp = { ...weights, [component]: delta };
    const scoreUp = calculateWeightedScore(synthesisResults, weightsUp).total_score;
    const scoreBase = calculateWeightedScore(synthesisResults, weights).total_score;
    return Math.round(((scoreUp - scoreBase) / delta) * 100) / 100;
  }

  // Perturb up and down
  const weightUp = Math.min(1, currentWeight + delta);
  const weightDown = Math.max(0, currentWeight - delta);
  const actualDelta = (weightUp - weightDown) / 2;

  if (actualDelta === 0) return 0;

  const weightsUp = { ...weights, [component]: weightUp };
  const weightsDown = { ...weights, [component]: weightDown };

  const scoreUp = calculateWeightedScore(synthesisResults, weightsUp).total_score;
  const scoreDown = calculateWeightedScore(synthesisResults, weightsDown).total_score;

  return Math.round(((scoreUp - scoreDown) / (2 * actualDelta)) * 100) / 100;
}
