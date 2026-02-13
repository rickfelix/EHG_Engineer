/**
 * Analysis Steps Registry - Stages 1-5 (THE TRUTH)
 * Part of SD-EVA-FEAT-TEMPLATES-TRUTH-001
 *
 * Provides the active analysis layer for stage templates.
 * Each analysisStep consumes upstream artifacts and generates
 * structured output via LLM calls.
 *
 * @module lib/eva/stage-templates/analysis-steps
 */

export { analyzeStage01 } from './stage-01-hydration.js';
export { analyzeStage02 } from './stage-02-multi-persona.js';
export { analyzeStage03 } from './stage-03-hybrid-scoring.js';
export { analyzeStage04 } from './stage-04-competitive-landscape.js';
export { analyzeStage05 } from './stage-05-financial-model.js';

/**
 * Get the analysis step function for a given stage number (1-5).
 * @param {number} stageNumber
 * @returns {Promise<Function|null>}
 */
export async function getAnalysisStep(stageNumber) {
  const loaders = {
    1: () => import('./stage-01-hydration.js').then(m => m.analyzeStage01),
    2: () => import('./stage-02-multi-persona.js').then(m => m.analyzeStage02),
    3: () => import('./stage-03-hybrid-scoring.js').then(m => m.analyzeStage03),
    4: () => import('./stage-04-competitive-landscape.js').then(m => m.analyzeStage04),
    5: () => import('./stage-05-financial-model.js').then(m => m.analyzeStage05),
  };
  const loader = loaders[stageNumber];
  return loader ? loader() : null;
}
