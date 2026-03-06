/**
 * Effectiveness Tracker
 *
 * Non-blocking application logging for mental model usage.
 * Uses setImmediate to avoid blocking the main analysis pipeline.
 *
 * Part of SD-LEO-FEAT-MENTAL-MODELS-REPOSITORY-001
 */

/**
 * Log a mental model application (non-blocking).
 *
 * @param {Object} params
 * @param {string} params.modelId - Mental model UUID
 * @param {string} [params.ventureId] - Venture UUID
 * @param {number} params.stageNumber - Stage number (e.g., 0)
 * @param {string} params.layer - Application layer: 'path_injection' | 'synthesis' | 'stage_hook'
 * @param {string} [params.pathUsed] - Entry path name
 * @param {string} [params.strategyUsed] - Discovery strategy name
 * @param {Object} [params.exerciseOutput] - Exercise runner output
 * @param {number} [params.evaluationScore] - Score 0-10
 * @param {number} [params.durationMs] - Time taken in ms
 * @param {Object} deps - Dependencies
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} [deps.logger] - Logger
 */
export function logApplication(params, deps = {}) {
  const { supabase, logger = console } = deps;

  if (!supabase) return;

  setImmediate(async () => {
    try {
      const { error } = await supabase
        .from('mental_model_applications')
        .upsert(
          {
            model_id: params.modelId,
            venture_id: params.ventureId || null,
            stage_number: params.stageNumber,
            layer: params.layer,
            path_used: params.pathUsed || null,
            strategy_used: params.strategyUsed || null,
            exercise_output: params.exerciseOutput || null,
            evaluation_score: params.evaluationScore || null,
            duration_ms: params.durationMs || null,
          },
          { onConflict: 'venture_id,model_id,stage_number,layer' }
        );

      if (error) {
        logger.warn(`   Mental models: Application log failed: ${error.message}`);
      }
    } catch (err) {
      logger.warn(`   Mental models: Application log error: ${err.message}`);
    }
  });
}

/**
 * Log multiple model applications in batch (non-blocking).
 *
 * @param {Object[]} models - Array of selected models
 * @param {Object} context - Shared context for all applications
 * @param {string} context.layer - Application layer
 * @param {number} context.stageNumber - Stage number
 * @param {string} [context.ventureId] - Venture UUID
 * @param {string} [context.pathUsed] - Entry path
 * @param {string} [context.strategyUsed] - Strategy
 * @param {Object} deps - Dependencies
 */
export function logBatchApplications(models, context, deps = {}) {
  if (!models || models.length === 0) return;

  for (const model of models) {
    logApplication(
      {
        modelId: model.id,
        ventureId: context.ventureId,
        stageNumber: context.stageNumber,
        layer: context.layer,
        pathUsed: context.pathUsed,
        strategyUsed: context.strategyUsed,
      },
      deps
    );
  }
}
