/**
 * Dual Evaluator - Runs control and variant evaluations for experiments
 *
 * SD-STAGE-ZERO-EXPERIMENTATION-FRAMEWORK-ORCH-001-C
 */

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
 * Used when no custom evaluateFn is provided.
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
