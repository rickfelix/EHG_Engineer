/**
 * Counterfactual Scoring Engine
 *
 * Generates what-if scores by applying different evaluation profile weights
 * to venture synthesis results. Enables the chairman to understand how
 * different assumptions would change venture evaluation outcomes.
 *
 * Key capabilities:
 * - Single venture counterfactual: compare original vs alternative profile scores
 * - Batch historical re-scoring: N ventures × P profiles
 * - Predictive accuracy: which profiles best predicted actual outcomes
 *
 * Part of SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-I
 */

import { calculateWeightedScore, VALID_COMPONENTS } from './profile-service.js';

/**
 * Generate a counterfactual score for a single venture under alternative weights.
 *
 * @param {Object} params
 * @param {Object} params.synthesisResults - Map of component name → result object
 * @param {Object} params.currentWeights - Original profile weights used for scoring
 * @param {Object} params.scenarioWeights - Alternative profile weights to evaluate
 * @returns {Object} { original_score, counterfactual_score, delta, breakdown }
 */
export function generateCounterfactual({ synthesisResults, currentWeights, scenarioWeights }) {
  if (!synthesisResults) {
    throw new Error('synthesisResults is required');
  }
  if (!currentWeights || !scenarioWeights) {
    throw new Error('Both currentWeights and scenarioWeights are required');
  }

  validateWeights(currentWeights);
  validateWeights(scenarioWeights);

  const original = calculateWeightedScore(synthesisResults, currentWeights);
  const counterfactual = calculateWeightedScore(synthesisResults, scenarioWeights);

  // Build per-component comparison
  const componentComparison = VALID_COMPONENTS.map(component => {
    const origItem = original.breakdown.find(b => b.component === component) || { contribution: 0, raw_score: 0, weight: 0 };
    const cfItem = counterfactual.breakdown.find(b => b.component === component) || { contribution: 0, raw_score: 0, weight: 0 };

    return {
      component,
      raw_score: origItem.raw_score,
      original_weight: origItem.weight,
      original_contribution: origItem.contribution,
      counterfactual_weight: cfItem.weight,
      counterfactual_contribution: cfItem.contribution,
      contribution_delta: Math.round((cfItem.contribution - origItem.contribution) * 100) / 100,
    };
  }).sort((a, b) => Math.abs(b.contribution_delta) - Math.abs(a.contribution_delta));

  return {
    original_score: original.total_score,
    counterfactual_score: counterfactual.total_score,
    delta: counterfactual.total_score - original.total_score,
    breakdown: componentComparison,
  };
}

/**
 * Batch re-score multiple ventures across multiple profiles.
 *
 * @param {Object} params
 * @param {Array<Object>} params.ventures - Array of { id, synthesisResults, currentWeights }
 * @param {Array<Object>} params.profiles - Array of { id, name, weights }
 * @param {Object} [params.logger] - Optional logger
 * @returns {Array<Object>} Array of counterfactual results per venture-profile pair
 */
export function runBatchCounterfactual({ ventures, profiles, logger = console }) {
  if (!ventures?.length) throw new Error('ventures array is required');
  if (!profiles?.length) throw new Error('profiles array is required');

  const results = [];

  for (const venture of ventures) {
    if (!venture.synthesisResults) {
      logger.warn(`   Skipping venture ${venture.id}: missing synthesis results`);
      continue;
    }

    for (const profile of profiles) {
      try {
        validateWeights(profile.weights);

        const cf = generateCounterfactual({
          synthesisResults: venture.synthesisResults,
          currentWeights: venture.currentWeights,
          scenarioWeights: profile.weights,
        });

        results.push({
          venture_id: venture.id,
          profile_id: profile.id,
          profile_name: profile.name,
          original_score: cf.original_score,
          counterfactual_score: cf.counterfactual_score,
          delta: cf.delta,
          breakdown: cf.breakdown,
        });
      } catch (err) {
        logger.warn(`   Skipping venture ${venture.id} × profile ${profile.name}: ${err.message}`);
      }
    }
  }

  return results;
}

/**
 * Generate a predictive accuracy report comparing counterfactual scores
 * against actual venture outcomes.
 *
 * For each profile, calculates what percentage of venture pairs are
 * correctly ordered (higher score = better outcome).
 *
 * @param {Array<Object>} counterfactualResults - Output from runBatchCounterfactual
 * @param {Object} outcomes - Map of venture_id → outcome ('completed'|'killed'|'parked')
 * @returns {Object} Per-profile accuracy metrics
 */
export function generatePredictiveReport(counterfactualResults, outcomes) {
  if (!counterfactualResults?.length) {
    return { profiles: {}, total_ventures: 0, total_pairs: 0 };
  }

  // Group results by profile
  const byProfile = {};
  for (const result of counterfactualResults) {
    if (!byProfile[result.profile_id]) {
      byProfile[result.profile_id] = {
        profile_name: result.profile_name,
        scores: [],
      };
    }
    byProfile[result.profile_id].scores.push({
      venture_id: result.venture_id,
      score: result.counterfactual_score,
      outcome: outcomeToNumeric(outcomes[result.venture_id]),
    });
  }

  // Calculate pairwise concordance per profile
  const profileMetrics = {};
  for (const [profileId, data] of Object.entries(byProfile)) {
    const { concordant, discordant, tied } = pairwiseConcordance(data.scores);
    const totalPairs = concordant + discordant + tied;
    const accuracy = totalPairs > 0
      ? Math.round((concordant / totalPairs) * 10000) / 10000
      : 0;

    // Kendall's tau-b
    const tau = totalPairs > 0
      ? Math.round(((concordant - discordant) / totalPairs) * 10000) / 10000
      : 0;

    profileMetrics[profileId] = {
      profile_name: data.profile_name,
      ventures_scored: data.scores.length,
      concordant_pairs: concordant,
      discordant_pairs: discordant,
      tied_pairs: tied,
      accuracy,
      kendall_tau: tau,
    };
  }

  const ventureIds = new Set(counterfactualResults.map(r => r.venture_id));

  return {
    profiles: profileMetrics,
    total_ventures: ventureIds.size,
    total_pairs: Object.values(profileMetrics)[0]?.concordant_pairs
      + Object.values(profileMetrics)[0]?.discordant_pairs
      + Object.values(profileMetrics)[0]?.tied_pairs || 0,
  };
}

/**
 * Persist batch counterfactual results to the database.
 *
 * @param {Object} deps - { supabase, logger }
 * @param {Array<Object>} results - Output from runBatchCounterfactual
 * @returns {Promise<Object>} { inserted, skipped, errors }
 */
export async function persistCounterfactualResults(deps, results) {
  const { supabase, logger = console } = deps;
  if (!supabase) throw new Error('supabase client is required');

  let inserted = 0;
  let skipped = 0;
  const errors = [];

  for (const result of results) {
    const { error } = await supabase
      .from('counterfactual_scores')
      .upsert({
        venture_id: result.venture_id,
        profile_id: result.profile_id,
        original_score: result.original_score,
        counterfactual_score: result.counterfactual_score,
        delta: result.delta,
        breakdown: result.breakdown,
      }, { onConflict: 'venture_id,profile_id' });

    if (error) {
      errors.push({ venture_id: result.venture_id, profile_id: result.profile_id, error: error.message });
      skipped++;
    } else {
      inserted++;
    }
  }

  logger.info?.(`   Persisted ${inserted} counterfactual scores (${skipped} skipped)`);
  return { inserted, skipped, errors };
}

// --- Internal helpers ---

/**
 * Validate that weights are non-negative and sum > 0.
 */
function validateWeights(weights) {
  if (!weights || typeof weights !== 'object') {
    throw new Error('Weights must be a non-null object');
  }

  let sum = 0;
  for (const [key, value] of Object.entries(weights)) {
    if (typeof value !== 'number' || value < 0) {
      throw new Error(`Weight for "${key}" must be a non-negative number, got ${value}`);
    }
    sum += value;
  }

  if (sum === 0) {
    throw new Error('Sum of weights must be greater than 0');
  }
}

/**
 * Convert outcome string to numeric value for correlation.
 */
function outcomeToNumeric(outcome) {
  switch (outcome) {
    case 'completed': return 1;
    case 'parked': return 0.5;
    case 'killed': return 0;
    default: return 0.5; // unknown treated as neutral
  }
}

/**
 * Calculate pairwise concordance between scores and outcomes.
 * A pair is concordant if higher score → better outcome.
 */
function pairwiseConcordance(scoreOutcomePairs) {
  let concordant = 0;
  let discordant = 0;
  let tied = 0;

  for (let i = 0; i < scoreOutcomePairs.length; i++) {
    for (let j = i + 1; j < scoreOutcomePairs.length; j++) {
      const a = scoreOutcomePairs[i];
      const b = scoreOutcomePairs[j];

      const scoreDiff = a.score - b.score;
      const outcomeDiff = a.outcome - b.outcome;

      if (scoreDiff === 0 || outcomeDiff === 0) {
        tied++;
      } else if ((scoreDiff > 0 && outcomeDiff > 0) || (scoreDiff < 0 && outcomeDiff < 0)) {
        concordant++;
      } else {
        discordant++;
      }
    }
  }

  return { concordant, discordant, tied };
}
