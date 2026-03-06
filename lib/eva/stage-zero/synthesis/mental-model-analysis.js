/**
 * Mental Model Analysis — Synthesis Component 14
 *
 * Fail-safe wrapper for mental model analysis within the synthesis engine.
 * Follows the same pattern as other synthesis components:
 * - Returns null on failure (caught by Promise.all wrapper)
 * - Uses Promise.race with timeout
 * - Result stored in metadata.synthesis.advisory namespace
 *
 * Part of SD-LEO-FEAT-MENTAL-MODELS-REPOSITORY-001
 */

import { analyzeMentalModels } from '../../mental-models/index.js';

const ANALYSIS_TIMEOUT_MS = 8000;

/**
 * Run mental model analysis as Component 14.
 *
 * @param {Object} params
 * @param {Object} params.venture - Venture object
 * @param {number} params.stage - Stage number (e.g., 0)
 * @param {string} [params.path] - Entry path
 * @param {string} [params.strategy] - Discovery strategy
 * @param {string} [params.archetype] - Venture archetype
 * @param {Object} deps - { supabase, llmClient, logger }
 * @returns {Promise<Object|null>} Analysis result or null
 */
export async function runMentalModelAnalysis(params, deps = {}) {
  const { venture, stage, path, strategy, archetype } = params;

  const ventureContext = venture
    ? {
        name: venture.name || venture.venture_name,
        description: venture.description || venture.venture_description,
        industry: venture.industry,
        stage: stage,
        archetype: archetype,
      }
    : undefined;

  return Promise.race([
    analyzeMentalModels(
      {
        stage,
        path,
        strategy,
        archetype,
        ventureContext,
        ventureId: venture?.id,
      },
      deps
    ),
    new Promise((resolve) => setTimeout(() => resolve(null), ANALYSIS_TIMEOUT_MS)),
  ]);
}
