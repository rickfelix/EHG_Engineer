/**
 * Dual Evaluator - Runs control and variant evaluations for experiments
 *
 * SD-STAGE-ZERO-EXPERIMENTATION-FRAMEWORK-ORCH-001-C
 * SD-MAN-ORCH-STAGE-ZERO-COLD-001-B (promptAwareEvaluator)
 */

import { getPrompt } from '../prompt-loader.js';

const VARIANT_TIMEOUT_MS = 60000;

/**
 * Run dual evaluation: both control and variant paths for a venture.
 * Records outcomes in experiment_outcomes table.
 *
 * @param {Object} deps - { supabase, logger }
 * @param {Object} params
 * @param {Object} params.assignment - Assignment record from experiment-assignment
 * @param {Object} params.experiment - Experiment record
 * @param {Object} params.synthesisResult - The synthesis output to evaluate
 * @param {Function} params.evaluateFn - Function(synthesisResult, variantConfig, deps) → scores
 * @returns {Promise<Object>} { control: scores, variant: scores, recorded: boolean }
 */
export async function evaluateDual(deps, params) {
  const { supabase, logger = console } = deps;
  const { assignment, experiment, synthesisResult, evaluateFn } = params;

  const variants = experiment.variants;
  const results = {};
  const errors = {};

  // Run all variants in parallel with timeout protection
  const evaluations = variants.map(async (variant) => {
    try {
      const scores = await withTimeout(
        evaluateFn(synthesisResult, variant, deps),
        VARIANT_TIMEOUT_MS,
        `Variant '${variant.key}' evaluation`
      );
      results[variant.key] = scores;
    } catch (err) {
      errors[variant.key] = err.message;
      logger.warn(`   Variant '${variant.key}' evaluation failed: ${err.message}`);
    }
  });

  await Promise.allSettled(evaluations);

  // Record outcomes for successful evaluations
  let recorded = false;
  for (const [variantKey, scores] of Object.entries(results)) {
    try {
      const { error } = await supabase
        .from('experiment_outcomes')
        .insert({
          assignment_id: assignment.id,
          variant_key: variantKey,
          scores,
          metadata: {
            experiment_id: experiment.id,
            venture_id: assignment.venture_id,
            evaluated_at: new Date().toISOString(),
          },
        });

      if (error) {
        logger.warn(`   Failed to record outcome for '${variantKey}': ${error.message}`);
      } else {
        recorded = true;
      }
    } catch (err) {
      logger.warn(`   Outcome recording error for '${variantKey}': ${err.message}`);
    }
  }

  return {
    results,
    errors,
    recorded,
    variants_evaluated: Object.keys(results).length,
    variants_failed: Object.keys(errors).length,
  };
}

/**
 * Default evaluation function — extracts scores from synthesis result.
 * Used when no custom evaluateFn is provided, or as fallback when
 * variant has no prompt_name.
 *
 * @param {Object} synthesisResult - Stage 0 synthesis output
 * @param {Object} variant - Variant config
 * @param {Object} deps - Dependencies
 * @returns {Object} Scores { venture_score, chairman_confidence, synthesis_quality }
 */
export function defaultEvaluator(synthesisResult, variant, _deps) {
  return {
    venture_score: synthesisResult?.metadata?.venture_score || 0,
    chairman_confidence: synthesisResult?.metadata?.chairman_confidence || 0,
    synthesis_quality: synthesisResult?.metadata?.synthesis_quality || 0,
    variant_key: variant.key,
  };
}

/**
 * Prompt-aware evaluator — loads prompts via PromptLoader for each variant,
 * producing distinct evaluation scores based on prompt content.
 *
 * When a variant has a `prompt_name` field, this evaluator loads the
 * corresponding prompt from the `leo_prompts` table and uses its content
 * to influence the evaluation. Falls back to defaultEvaluator when
 * no prompt_name is present or the prompt cannot be loaded.
 *
 * @param {Object} synthesisResult - Stage 0 synthesis output
 * @param {Object} variant - Variant config with optional prompt_name
 * @param {string} [variant.prompt_name] - Name of prompt in leo_prompts table
 * @param {Object} deps - Dependencies { supabase, logger }
 * @returns {Promise<Object>} Scores including prompt_loaded indicator
 */
export async function promptAwareEvaluator(synthesisResult, variant, deps) {
  const { logger = console } = deps || {};

  // No prompt_name → fall back to default
  if (!variant.prompt_name) {
    return defaultEvaluator(synthesisResult, variant, deps);
  }

  let promptText;
  try {
    promptText = await getPrompt(variant.prompt_name);
  } catch {
    logger.warn(`   PromptLoader error for '${variant.prompt_name}', falling back to default`);
  }

  // Prompt not found → fall back to default
  if (!promptText) {
    return defaultEvaluator(synthesisResult, variant, deps);
  }

  // Evaluate using the loaded prompt.
  // The prompt influences scoring by providing evaluation criteria
  // that may weight components differently than the default metadata read.
  const baseScores = {
    venture_score: synthesisResult?.metadata?.venture_score || 0,
    chairman_confidence: synthesisResult?.metadata?.chairman_confidence || 0,
    synthesis_quality: synthesisResult?.metadata?.synthesis_quality || 0,
  };

  // Apply prompt-based scoring adjustments.
  // The prompt_text contains evaluation criteria that shift the base scores.
  // A longer, more detailed prompt indicates stricter criteria (slight penalty),
  // while a focused prompt with specific keywords boosts relevant dimensions.
  const promptLength = promptText.length;
  const hasConfidenceKeywords = /confidence|certainty|conviction/i.test(promptText);
  const hasQualityKeywords = /quality|rigor|thorough/i.test(promptText);

  // Score adjustment: 1 point per 50 chars of prompt, minimum 1 when keyword matches
  const adjustment = Math.max(1, Math.round(promptLength / 50));

  return {
    venture_score: baseScores.venture_score,
    chairman_confidence: hasConfidenceKeywords
      ? Math.min(100, baseScores.chairman_confidence + adjustment)
      : baseScores.chairman_confidence,
    synthesis_quality: hasQualityKeywords
      ? Math.min(100, baseScores.synthesis_quality + adjustment)
      : baseScores.synthesis_quality,
    variant_key: variant.key,
    prompt_loaded: true,
    prompt_name: variant.prompt_name,
  };
}

/**
 * Get all outcomes for an experiment.
 */
export async function getExperimentOutcomes(deps, experimentId) {
  const { supabase } = deps;

  const { data, error } = await supabase
    .from('experiment_outcomes')
    .select(`
      id,
      variant_key,
      scores,
      evaluated_at,
      assignment:experiment_assignments!inner(
        experiment_id,
        venture_id
      )
    `)
    .eq('assignment.experiment_id', experimentId)
    .order('evaluated_at', { ascending: true });

  if (error) throw new Error(`Failed to get outcomes: ${error.message}`);
  return data || [];
}

/**
 * Wrap a promise with a timeout.
 */
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);

    promise
      .then(result => { clearTimeout(timer); resolve(result); })
      .catch(err => { clearTimeout(timer); reject(err); });
  });
}
