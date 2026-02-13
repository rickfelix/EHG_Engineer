/**
 * Analysis Steps Registry - Stages 1-9 (THE TRUTH + THE ENGINE)
 * Part of SD-EVA-FEAT-TEMPLATES-TRUTH-001 (1-5) and SD-EVA-FEAT-TEMPLATES-ENGINE-001 (6-9)
 *
 * Provides the active analysis layer for stage templates.
 * Each analysisStep consumes upstream artifacts and generates
 * structured output via LLM calls.
 *
 * @module lib/eva/stage-templates/analysis-steps
 */

// THE TRUTH (Stages 1-5)
export { analyzeStage01 } from './stage-01-hydration.js';
export { analyzeStage02 } from './stage-02-multi-persona.js';
export { analyzeStage03 } from './stage-03-hybrid-scoring.js';
export { analyzeStage04 } from './stage-04-competitive-landscape.js';
export { analyzeStage05 } from './stage-05-financial-model.js';

// THE ENGINE (Stages 6-9)
export { analyzeStage06 } from './stage-06-risk-matrix.js';
export { analyzeStage07 } from './stage-07-pricing-strategy.js';
export { analyzeStage08 } from './stage-08-bmc-generation.js';
export { analyzeStage09 } from './stage-09-exit-strategy.js';

/**
 * Get the analysis step function for a given stage number (1-9).
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
    6: () => import('./stage-06-risk-matrix.js').then(m => m.analyzeStage06),
    7: () => import('./stage-07-pricing-strategy.js').then(m => m.analyzeStage07),
    8: () => import('./stage-08-bmc-generation.js').then(m => m.analyzeStage08),
    9: () => import('./stage-09-exit-strategy.js').then(m => m.analyzeStage09),
  };
  const loader = loaders[stageNumber];
  return loader ? loader() : null;
}
