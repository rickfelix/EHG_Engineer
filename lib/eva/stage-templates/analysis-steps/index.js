/**
 * Analysis Steps Registry - Stages 1-22
 * Part of SD-EVA-FEAT-TEMPLATES-TRUTH-001 (1-5), ENGINE-001 (6-9), IDENTITY-001 (10-12), BLUEPRINT-001 (13-16), BUILDLOOP-001 (17-22)
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

// THE IDENTITY (Stages 10-12)
export { analyzeStage10 } from './stage-10-naming-brand.js';
export { analyzeStage11 } from './stage-11-gtm.js';
export { analyzeStage12 } from './stage-12-sales-logic.js';

// THE BLUEPRINT (Stages 13-16)
export { analyzeStage13 } from './stage-13-product-roadmap.js';
export { analyzeStage14 } from './stage-14-technical-architecture.js';
export { analyzeStage15 } from './stage-15-resource-planning.js';
export { analyzeStage16 } from './stage-16-financial-projections.js';

// THE BUILD LOOP (Stages 17-22)
export { analyzeStage17 } from './stage-17-build-readiness.js';
export { analyzeStage18 } from './stage-18-sprint-planning.js';
export { analyzeStage19 } from './stage-19-build-execution.js';
export { analyzeStage20 } from './stage-20-quality-assurance.js';
export { analyzeStage21 } from './stage-21-build-review.js';
export { analyzeStage22 } from './stage-22-release-readiness.js';

/**
 * Get the analysis step function for a given stage number (1-22).
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
    10: () => import('./stage-10-naming-brand.js').then(m => m.analyzeStage10),
    11: () => import('./stage-11-gtm.js').then(m => m.analyzeStage11),
    12: () => import('./stage-12-sales-logic.js').then(m => m.analyzeStage12),
    13: () => import('./stage-13-product-roadmap.js').then(m => m.analyzeStage13),
    14: () => import('./stage-14-technical-architecture.js').then(m => m.analyzeStage14),
    15: () => import('./stage-15-resource-planning.js').then(m => m.analyzeStage15),
    16: () => import('./stage-16-financial-projections.js').then(m => m.analyzeStage16),
    17: () => import('./stage-17-build-readiness.js').then(m => m.analyzeStage17),
    18: () => import('./stage-18-sprint-planning.js').then(m => m.analyzeStage18),
    19: () => import('./stage-19-build-execution.js').then(m => m.analyzeStage19),
    20: () => import('./stage-20-quality-assurance.js').then(m => m.analyzeStage20),
    21: () => import('./stage-21-build-review.js').then(m => m.analyzeStage21),
    22: () => import('./stage-22-release-readiness.js').then(m => m.analyzeStage22),
  };
  const loader = loaders[stageNumber];
  return loader ? loader() : null;
}
