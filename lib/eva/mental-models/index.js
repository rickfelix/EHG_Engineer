/**
 * Mental Models — Public API
 *
 * Three entry points for the 3-layer integration:
 * 1. getMentalModelContextBlock() — Layer 1: Prompt injection into LLM calls
 * 2. analyzeMentalModels() — Layer 2: Component 14 synthesis wrapper
 * 3. getStageModelContext() — Convenience: select + build block in one call
 *
 * Part of SD-LEO-FEAT-MENTAL-MODELS-REPOSITORY-001
 */

import { selectModels } from './model-selector.js';
import { buildContextBlock } from './context-block-builder.js';
import { runExercise } from './exercise-runner.js';
import { logBatchApplications } from './effectiveness-tracker.js';

/**
 * Layer 1: Get a formatted context block for prompt injection.
 *
 * Used by competitor-teardown.js and discovery-mode.js to inject
 * mental model frameworks into LLM prompts.
 *
 * @param {Object} params
 * @param {number} params.stage - Stage number
 * @param {string} [params.path] - Entry path
 * @param {string} [params.strategy] - Discovery strategy
 * @param {string} [params.archetype] - Venture archetype
 * @param {string[]} [params.excludeIds] - Already-applied model IDs
 * @param {Object} deps - { supabase, logger }
 * @returns {Promise<string>} Formatted prompt block (empty string if none)
 */
export async function getMentalModelContextBlock(params, deps = {}) {
  try {
    const models = await selectModels(params, deps);
    if (!models || models.length === 0) return '';

    // Non-blocking usage logging
    logBatchApplications(
      models,
      {
        stageNumber: params.stage,
        layer: 'path_injection',
        ventureId: params.ventureId,
        pathUsed: params.path,
        strategyUsed: params.strategy,
      },
      deps
    );

    return buildContextBlock(models);
  } catch {
    return '';
  }
}

/**
 * Layer 2: Full mental model analysis for synthesis Component 14.
 *
 * Selects models, optionally runs exercises, and returns structured
 * analysis output for the synthesis engine.
 *
 * @param {Object} params
 * @param {number} params.stage - Stage number
 * @param {string} [params.path] - Entry path
 * @param {string} [params.strategy] - Discovery strategy
 * @param {string} [params.archetype] - Venture archetype
 * @param {Object} [params.ventureContext] - Venture data for exercise interpolation
 * @param {string[]} [params.excludeIds] - Already-applied model IDs
 * @param {Object} deps - { supabase, llmClient, logger }
 * @returns {Promise<Object|null>} Analysis result or null
 */
export async function analyzeMentalModels(params, deps = {}) {
  const { logger = console } = deps;

  try {
    const models = await selectModels(params, deps);
    if (!models || models.length === 0) return null;

    // Run exercises for top 3 models (if LLM client available)
    let exercises = [];
    if (deps.llmClient && params.ventureContext) {
      const exercisePromises = models.slice(0, 3).map((model) =>
        runExercise({ model, ventureContext: params.ventureContext }, deps).catch(() => null)
      );
      exercises = (await Promise.all(exercisePromises)).filter(Boolean);
    }

    // Non-blocking usage logging
    logBatchApplications(
      models,
      {
        stageNumber: params.stage,
        layer: 'synthesis',
        ventureId: params.ventureId,
        pathUsed: params.path,
        strategyUsed: params.strategy,
      },
      deps
    );

    return {
      models_selected: models.map((m) => ({
        id: m.id,
        name: m.name,
        category: m.category,
        score: m._score,
      })),
      context_block: buildContextBlock(models),
      exercises: exercises.length > 0 ? exercises : null,
      model_count: models.length,
      exercise_count: exercises.length,
    };
  } catch (err) {
    logger.warn(`   Mental models: Analysis error: ${err.message}`);
    return null;
  }
}

/**
 * Convenience: Select models + build context block in one call.
 *
 * @param {Object} params - Same as selectModels params
 * @param {Object} deps - { supabase, logger }
 * @returns {Promise<{models: Object[], block: string}>}
 */
export async function getStageModelContext(params, deps = {}) {
  try {
    const models = await selectModels(params, deps);
    return {
      models: models || [],
      block: buildContextBlock(models),
    };
  } catch {
    return { models: [], block: '' };
  }
}
