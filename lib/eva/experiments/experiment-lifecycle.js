/**
 * Experiment Lifecycle Manager — Manages experiment state transitions:
 * check stopping rules after each gate outcome, promote winner,
 * invoke meta-optimizer, create next experiment.
 *
 * SD-LEO-FEAT-EXPERIMENT-FEEDBACK-LOOP-001 (FR-004)
 *
 * @module lib/eva/experiments/experiment-lifecycle
 */

import { analyzeExperiment } from './bayesian-analyzer.js';
import { evaluatePromotion } from './prompt-promotion.js';
import { getGateSurvivalOutcomes } from './gate-outcome-bridge.js';

/**
 * Check stopping rules and advance experiment if threshold is met.
 *
 * @param {Object} deps - { supabase, logger }
 * @param {string} experimentId - Experiment UUID
 * @param {Object} [options]
 * @param {boolean} [options.survivalMode=true] - Use survival data instead of synthesis scores
 * @param {Function} [options.generateChallenger] - Meta-optimizer function for next challenger
 * @returns {Promise<Object>} { action: 'continue'|'stopped_and_promoted'|'stopped_and_rejected', details }
 */
export async function checkAndAdvanceExperiment(deps, experimentId, options = {}) {
  const { supabase, logger = console } = deps;
  const { survivalMode = true, generateChallenger = null } = options;

  // Get experiment
  const { data: experiment, error: expErr } = await supabase
    .from('experiments')
    .select('*')
    .eq('id', experimentId)
    .single();

  if (expErr || !experiment) {
    return { action: 'error', reason: 'experiment_not_found' };
  }

  if (experiment.status !== 'running') {
    return { action: 'error', reason: `experiment_status_is_${experiment.status}` };
  }

  // Check maturity threshold before proceeding (US-003)
  const maturityHours = experiment.maturity_hours ?? 48;
  const hoursElapsed = (Date.now() - new Date(experiment.created_at).getTime()) / (1000 * 60 * 60);
  if (hoursElapsed < maturityHours) {
    logger.log(
      `   [Lifecycle] Experiment ${experimentId.slice(0, 8)}: ` +
      `immature (${hoursElapsed.toFixed(1)}/${maturityHours}h elapsed)`
    );
    return {
      action: 'continue',
      reason: 'immature',
      details: {
        hours_elapsed: Math.round(hoursElapsed * 10) / 10,
        maturity_hours_required: maturityHours,
      },
    };
  }

  // Get outcomes based on mode
  let outcomes;
  if (survivalMode) {
    outcomes = await getGateSurvivalOutcomes(deps, experimentId);
  } else {
    const { data } = await supabase
      .from('experiment_outcomes')
      .select('*')
      .eq('experiment_id', experimentId)
      .eq('outcome_type', 'synthesis');
    outcomes = data || [];
  }

  if (outcomes.length === 0) {
    return { action: 'continue', reason: 'no_outcomes_yet', total_outcomes: 0 };
  }

  // Check per-variant observation counts against minimum (US-003)
  const minObsRequired = experiment.min_observations_per_variant ?? 20;
  const variantCounts = {};
  for (const o of outcomes) {
    variantCounts[o.variant_key] = (variantCounts[o.variant_key] || 0) + 1;
  }
  const minVariantCount = Math.min(...Object.values(variantCounts));

  if (minVariantCount < minObsRequired) {
    logger.log(
      `   [Lifecycle] Experiment ${experimentId.slice(0, 8)}: ` +
      `insufficient_data (${minVariantCount}/${minObsRequired} per variant)`
    );
    return {
      action: 'continue',
      reason: 'insufficient_data',
      total_outcomes: outcomes.length,
      details: {
        variant_counts: variantCounts,
        min_per_variant: minVariantCount,
        required: minObsRequired,
      },
    };
  }

  // Run Bayesian analysis (analyzer auto-detects survival mode from outcome_type)
  const analysis = analyzeExperiment({ logger }, {
    experiment,
    outcomes,
    survivalMode,
    config: experiment.config?.stopping_rules || {},
  });

  // Check if we should stop
  if (!analysis.stopping?.shouldStop) {
    logger.log(
      `   [Lifecycle] Experiment ${experimentId.slice(0, 8)}: ` +
      `${outcomes.length} outcomes, continuing (${analysis.stopping?.reason})`
    );
    return {
      action: 'continue',
      reason: analysis.stopping?.reason || 'no_clear_winner',
      total_outcomes: outcomes.length,
      analysis_summary: {
        status: analysis.status,
        per_variant: Object.fromEntries(
          Object.entries(analysis.per_variant || {}).map(([k, v]) => [k, {
            count: v.count,
            success_rate: v.posterior ? v.posterior.alpha / (v.posterior.alpha + v.posterior.beta) : 0,
          }])
        ),
      },
    };
  }

  // Experiment has reached a conclusion
  const winner = analysis.stopping.winner;
  logger.log(
    `   [Lifecycle] Experiment ${experimentId.slice(0, 8)}: ` +
    `STOPPING — winner=${winner} (${analysis.stopping.reason})`
  );

  // Evaluate promotion
  const promotionResult = await evaluatePromotion(deps, {
    experimentId,
    analysis,
    experiment,
  });

  // Update experiment status
  await supabase
    .from('experiments')
    .update({
      status: 'completed',
      ended_at: new Date().toISOString(),
      config: {
        ...experiment.config,
        final_analysis: {
          winner,
          total_outcomes: outcomes.length,
          stopping_reason: analysis.stopping.reason,
          promoted: promotionResult.promoted,
        },
      },
    })
    .eq('id', experimentId);

  const action = promotionResult.promoted ? 'stopped_and_promoted' : 'stopped_and_rejected';

  // If promoted and meta-optimizer available, generate next challenger
  let nextExperiment = null;
  if (promotionResult.promoted && generateChallenger) {
    try {
      nextExperiment = await createNextExperiment(deps, {
        previousExperiment: experiment,
        winner,
        winnerAnalysis: analysis.per_variant?.[winner],
        generateChallenger,
      });
    } catch (err) {
      logger.warn(`[Lifecycle] Failed to create next experiment: ${err.message}`);
    }
  }

  return {
    action,
    winner,
    promotion: promotionResult,
    total_outcomes: outcomes.length,
    analysis_summary: {
      status: analysis.status,
      stopping_reason: analysis.stopping.reason,
    },
    next_experiment: nextExperiment?.id || null,
  };
}

/**
 * Create the next experiment using the winner as champion
 * and the meta-optimizer to generate a challenger.
 *
 * @param {Object} deps - { supabase, logger }
 * @param {Object} params
 * @param {Object} params.previousExperiment - Completed experiment
 * @param {string} params.winner - Winning variant key
 * @param {Object} params.winnerAnalysis - Winner's analysis data
 * @param {Function} params.generateChallenger - Meta-optimizer function
 * @returns {Promise<Object>} Created experiment record
 */
async function createNextExperiment(deps, params) {
  const { supabase, logger = console } = deps;
  const { previousExperiment, winner, winnerAnalysis, generateChallenger } = params;

  // Find the winning variant's prompt
  const winningVariant = (previousExperiment.variants || []).find(v => v.key === winner);
  if (!winningVariant?.prompt_name) {
    throw new Error('Winner has no prompt_name — cannot create next experiment');
  }

  // Generate challenger via meta-optimizer
  const challenger = await generateChallenger({
    championPromptName: winningVariant.prompt_name,
    previousExperimentId: previousExperiment.id,
    winnerPosterior: winnerAnalysis?.posterior,
  });

  // Create new experiment with informative prior for champion
  const { data: newExperiment, error } = await supabase
    .from('experiments')
    .insert({
      name: `Auto-iteration from ${previousExperiment.name}`,
      hypothesis: challenger.hypothesis || `Testing ${challenger.perturbation_used} perturbation against champion`,
      variants: [
        {
          key: 'champion',
          label: `Champion (from ${previousExperiment.name})`,
          weight: 0.5,
          prompt_name: winningVariant.prompt_name,
          prior: winnerAnalysis?.posterior
            ? { alpha: winnerAnalysis.posterior.alpha, beta: winnerAnalysis.posterior.beta }
            : { alpha: 2, beta: 2 },
        },
        {
          key: 'challenger',
          label: `Challenger (${challenger.perturbation_used})`,
          weight: 0.5,
          prompt_name: challenger.prompt_name,
          prior: { alpha: 2, beta: 2 },
        },
      ],
      config: {
        ...previousExperiment.config,
        previous_experiment_id: previousExperiment.id,
        auto_created: true,
      },
      status: 'draft',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create next experiment: ${error.message}`);

  logger.log(`   [Lifecycle] Next experiment created: ${newExperiment.id} (auto-iteration)`);
  return newExperiment;
}

export { createNextExperiment };
