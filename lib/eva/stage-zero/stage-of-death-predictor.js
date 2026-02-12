/**
 * Stage-of-Death Prediction Engine
 *
 * Predicts WHERE a venture will die (which stage), not just IF.
 * Uses historical kill gate data per profile+archetype combination
 * to generate mortality curves and death predictions.
 *
 * Example output: "Democratizers with viral-first that score below 60
 * on moat have 80% chance of dying at Stage 5."
 *
 * Part of SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-J
 */

import { VALID_COMPONENTS } from './profile-service.js';

/** Default stage boundaries matching EHG 25-stage venture lifecycle */
const TOTAL_STAGES = 25;

/** Stage groupings for mortality curve generation */
const STAGE_PHASES = {
  filtering: { start: 1, end: 5, label: 'Filtering & Validation' },
  building: { start: 6, end: 12, label: 'Planning & Building' },
  testing: { start: 13, end: 18, label: 'Testing & Launch' },
  scaling: { start: 19, end: 25, label: 'Scaling & Optimization' },
};

/**
 * Predict the most likely stage of death for a venture.
 *
 * @param {Object} params
 * @param {string} params.archetype - Archetype key (e.g., 'democratizer')
 * @param {Object} params.componentScores - Map of component name → score (0-100)
 * @param {Object} params.profileWeights - Profile weights for scoring
 * @param {Object} [params.archetypeData] - Historical archetype data with common_kill_stages
 * @param {Object} [params.options]
 * @returns {Object} { death_stage, probability, death_factors, confidence, message }
 */
export function predictStageOfDeath({ archetype, componentScores, profileWeights, archetypeData, options: _options = {} }) {
  if (!archetype || !componentScores || !profileWeights) {
    throw new Error('archetype, componentScores, and profileWeights are required');
  }

  // Build mortality curve from historical data
  const mortalityCurve = buildMortalityCurve({
    archetypeData,
    profileWeights,
    componentScores,
  });

  // Find the peak mortality stage
  let peakStage = 5; // default fallback
  let peakProbability = 0;

  for (let stage = 1; stage <= TOTAL_STAGES; stage++) {
    if (mortalityCurve[stage] > peakProbability) {
      peakProbability = mortalityCurve[stage];
      peakStage = stage;
    }
  }

  // Identify death factors from component scores
  const deathFactors = identifyDeathFactors(componentScores, profileWeights);

  // Calculate confidence based on data availability
  const confidence = calculateConfidence(archetypeData);

  // Generate human-readable message
  const topFactor = deathFactors[0];
  const phaseLabel = getPhaseLabel(peakStage);
  const message = `${capitalize(archetype)}s scoring ${topFactor ? `below ${Math.round(topFactor.threshold)} on ${topFactor.component}` : 'poorly overall'} have ${Math.round(peakProbability * 100)}% chance of dying at Stage ${peakStage} (${phaseLabel}).`;

  return {
    death_stage: peakStage,
    probability: Math.round(peakProbability * 1000) / 1000,
    death_factors: deathFactors,
    confidence: Math.round(confidence * 100) / 100,
    mortality_curve: mortalityCurve,
    message,
    archetype,
  };
}

/**
 * Build a per-stage mortality curve for an archetype-profile combination.
 *
 * Mortality rates are computed by combining:
 * 1. Historical common_kill_stages from the archetype
 * 2. Profile weight emphasis (high-weight weak components → earlier death)
 * 3. Component score weakness amplification
 *
 * @param {Object} params
 * @param {Object} [params.archetypeData] - Historical data with common_kill_stages, killed_count, etc.
 * @param {Object} params.profileWeights - Profile weights
 * @param {Object} params.componentScores - Per-component scores (0-100)
 * @returns {Object} Map of stage (1-25) → mortality rate (0-1), sums to <= 1.0
 */
export function buildMortalityCurve({ archetypeData, profileWeights, componentScores }) {
  const curve = {};
  for (let s = 1; s <= TOTAL_STAGES; s++) {
    curve[s] = 0;
  }

  // Layer 1: Historical kill stages from archetype data
  if (archetypeData?.common_kill_stages?.length > 0) {
    const killStages = archetypeData.common_kill_stages;
    const historicalWeight = 0.5; // 50% weight for historical data
    const perStage = historicalWeight / killStages.length;

    for (const stage of killStages) {
      if (stage >= 1 && stage <= TOTAL_STAGES) {
        curve[stage] += perStage;
        // Spread some probability to adjacent stages (Gaussian-like)
        if (stage > 1) curve[stage - 1] += perStage * 0.3;
        if (stage < TOTAL_STAGES) curve[stage + 1] += perStage * 0.3;
      }
    }
  } else {
    // No historical data: use default lifecycle mortality distribution
    // Higher mortality at phase transitions (stages 5, 12, 18, 24)
    const defaults = { 5: 0.15, 12: 0.12, 18: 0.10, 24: 0.08 };
    for (const [stage, rate] of Object.entries(defaults)) {
      curve[Number(stage)] = rate;
    }
  }

  // Layer 2: Score-weighted mortality amplification
  // Weak component scores shift mortality curve toward earlier stages.
  // Uses multiplicative adjustment so normalization preserves the relative boost.
  if (componentScores && profileWeights) {
    const weaknesses = identifyWeaknesses(componentScores, profileWeights);

    if (weaknesses.length > 0) {
      const totalWeight = weaknesses.reduce((s, w) => s + w.weight, 0);
      const avgSeverity = weaknesses.reduce(
        (s, w) => s + (1 - w.score / 100) * w.weight, 0,
      ) / Math.max(totalWeight, 0.01);

      for (let s = 1; s <= TOTAL_STAGES; s++) {
        // earlyFactor: 1.0 at stage 1, 0.0 at stage 25
        const earlyFactor = Math.max(0, 1 - (s - 1) / (TOTAL_STAGES - 1));
        curve[s] *= (1 + avgSeverity * earlyFactor);
      }
    }
  }

  // Normalize so total mortality <= 1.0
  const total = Object.values(curve).reduce((sum, v) => sum + v, 0);
  if (total > 1.0) {
    for (const stage of Object.keys(curve)) {
      curve[stage] = Math.round((curve[stage] / total) * 10000) / 10000;
    }
  } else {
    // Round all values
    for (const stage of Object.keys(curve)) {
      curve[stage] = Math.round(curve[stage] * 10000) / 10000;
    }
  }

  return curve;
}

/**
 * Calibrate predictions by comparing past predictions against actual outcomes.
 *
 * @param {Array<Object>} predictions - Array of { venture_id, predicted_stage, actual_stage, actual_outcome }
 * @returns {Object} { accuracy_score, mean_absolute_error, directional_accuracy, per_archetype }
 */
export function calibratePredictions(predictions) {
  if (!predictions?.length) {
    return {
      accuracy_score: 0,
      mean_absolute_error: 0,
      directional_accuracy: 0,
      total_predictions: 0,
      per_archetype: {},
      message: 'Insufficient data for calibration',
    };
  }

  let totalError = 0;
  let directionalCorrect = 0;
  const killedPredictions = predictions.filter(p => p.actual_outcome === 'killed');
  const byArchetype = {};

  for (const pred of killedPredictions) {
    const error = Math.abs(pred.predicted_stage - pred.actual_stage);
    totalError += error;

    // Directionally correct: predicted within 5 stages of actual
    if (error <= 5) directionalCorrect++;

    // Group by archetype
    const arch = pred.archetype || 'unknown';
    if (!byArchetype[arch]) {
      byArchetype[arch] = { count: 0, total_error: 0, directional_correct: 0 };
    }
    byArchetype[arch].count++;
    byArchetype[arch].total_error += error;
    if (error <= 5) byArchetype[arch].directional_correct++;
  }

  const n = killedPredictions.length;
  const mae = n > 0 ? Math.round((totalError / n) * 100) / 100 : 0;
  const dirAccuracy = n > 0 ? Math.round((directionalCorrect / n) * 1000) / 1000 : 0;

  // Accuracy score: inverse of MAE normalized to 0-1
  // Perfect prediction (MAE=0) → 1.0, MAE=25 → 0
  const accuracyScore = n > 0 ? Math.round(Math.max(0, 1 - mae / TOTAL_STAGES) * 1000) / 1000 : 0;

  // Per-archetype breakdown
  const perArchetype = {};
  for (const [arch, data] of Object.entries(byArchetype)) {
    perArchetype[arch] = {
      predictions: data.count,
      mean_absolute_error: Math.round((data.total_error / data.count) * 100) / 100,
      directional_accuracy: Math.round((data.directional_correct / data.count) * 1000) / 1000,
    };
  }

  return {
    accuracy_score: accuracyScore,
    mean_absolute_error: mae,
    directional_accuracy: dirAccuracy,
    total_predictions: n,
    per_archetype: perArchetype,
  };
}

/**
 * Persist stage-of-death predictions to the database.
 *
 * @param {Object} deps - { supabase, logger }
 * @param {Array<Object>} predictions - Array of prediction results
 * @returns {Promise<Object>} { inserted, skipped, errors }
 */
export async function persistPredictions(deps, predictions) {
  const { supabase, logger = console } = deps;
  if (!supabase) throw new Error('supabase client is required');

  let inserted = 0;
  let skipped = 0;
  const errors = [];

  for (const pred of predictions) {
    const { error } = await supabase
      .from('stage_of_death_predictions')
      .upsert({
        venture_id: pred.venture_id,
        archetype_key: pred.archetype,
        profile_id: pred.profile_id,
        predicted_death_stage: pred.death_stage,
        predicted_probability: pred.probability,
        death_factors: pred.death_factors,
        confidence_score: pred.confidence,
        mortality_curve: pred.mortality_curve,
      }, { onConflict: 'venture_id,profile_id' });

    if (error) {
      errors.push({ venture_id: pred.venture_id, error: error.message });
      skipped++;
    } else {
      inserted++;
    }
  }

  logger.info?.(`   Persisted ${inserted} predictions (${skipped} skipped)`);
  return { inserted, skipped, errors };
}

// --- Internal helpers ---

/**
 * Identify the top death factors from component scores weighted by profile.
 * A death factor is a component where the score is low relative to its weight.
 */
function identifyDeathFactors(componentScores, profileWeights) {
  const factors = [];

  for (const component of VALID_COMPONENTS) {
    const score = extractScore(component, componentScores);
    const weight = profileWeights[component] || 0;

    if (weight === 0) continue;

    // Risk = weight * (1 - normalized_score)
    const risk = weight * (1 - score / 100);
    const threshold = score < 50 ? score + 10 : 60; // What score would make this safe

    factors.push({
      component,
      score,
      weight,
      risk: Math.round(risk * 1000) / 1000,
      threshold,
    });
  }

  // Sort by risk descending, return top 5
  return factors
    .sort((a, b) => b.risk - a.risk)
    .slice(0, 5);
}

/**
 * Identify weakness scores: components with high weight but low score.
 */
function identifyWeaknesses(componentScores, profileWeights) {
  const weaknesses = [];

  for (const component of VALID_COMPONENTS) {
    const score = extractScore(component, componentScores);
    const weight = profileWeights[component] || 0;

    if (weight > 0 && score < 70) {
      weaknesses.push({ component, score, weight });
    }
  }

  return weaknesses.sort((a, b) => (a.score * a.weight) - (b.score * b.weight));
}

/**
 * Extract a numeric score from component scores (handles both raw numbers and objects).
 */
function extractScore(component, componentScores) {
  const val = componentScores[component];
  if (typeof val === 'number') return val;
  if (val?.score != null) return val.score;
  if (val?.raw_score != null) return val.raw_score;
  return 0;
}

/**
 * Calculate prediction confidence based on data availability.
 */
function calculateConfidence(archetypeData) {
  if (!archetypeData) return 0.2; // Low confidence without data

  let confidence = 0.3; // Base confidence

  // More historical ventures = higher confidence
  const totalVentures = archetypeData.total_ventures || 0;
  if (totalVentures >= 20) confidence += 0.3;
  else if (totalVentures >= 10) confidence += 0.2;
  else if (totalVentures >= 5) confidence += 0.1;

  // Having kill stage data adds confidence
  if (archetypeData.common_kill_stages?.length > 0) confidence += 0.15;

  // Having kill reason data adds confidence
  if (archetypeData.common_kill_reasons?.length > 0) confidence += 0.1;

  // Having killed count adds confidence
  if (archetypeData.killed_count > 0) confidence += 0.05;

  return Math.min(1.0, confidence);
}

/**
 * Get the phase label for a given stage number.
 */
function getPhaseLabel(stage) {
  for (const [, phase] of Object.entries(STAGE_PHASES)) {
    if (stage >= phase.start && stage <= phase.end) return phase.label;
  }
  return 'Unknown Phase';
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export { TOTAL_STAGES, STAGE_PHASES };
