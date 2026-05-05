/**
 * Analysis Steps Registry - Stages 1-26
 * Part of SD-EVA-FEAT-TEMPLATES-TRUTH-001 (1-5), ENGINE-001 (6-9), IDENTITY-001 (10-12),
 *   BLUEPRINT-001 (13-17), BUILDLOOP-001 (18-23), LAUNCH-001 (24-26)
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
export { analyzeStage10 } from './stage-10-customer-brand.js';
export { analyzeStage11 } from './stage-11-visual-identity.js';
export { analyzeStage12 } from './stage-12-gtm-sales.js';

// THE BLUEPRINT (Stages 13-17)
export { analyzeStage13 } from './stage-13-product-roadmap.js';
export { analyzeStage14 } from './stage-14-technical-architecture.js';
export { analyzeStage15DesignStudio as analyzeStage15 } from './stage-15-design-studio.js';
export { analyzeStage16 } from './stage-16-financial-projections.js';
export { analyzeStage17 } from './stage-17-blueprint-review.js';

// THE BUILD LOOP (Stages 18-23)
// SD-LEO-INFRA-BUILD-LOOP-DATA-001: function names now match stage numbers (no aliasing)
export { analyzeStage18 } from './stage-18-build-readiness.js';
export { analyzeStage19 } from './stage-19-sprint-planning.js';
// SD-LEO-FEAT-STAGE-CODE-QUALITY-001 FR-1 (path-a replace, 2026-05-03): stage 20 now
// dispatches to the canonical Code Quality Gate analyzer (stage-20-code-quality.js)
// — the FR-B/D/E analyzer that writes venture_quality_findings + code_quality_report.
// Previously stage 20 dispatched to stage-20-build-execution.js, which never produced
// venture_quality_findings rows (zero rows globally as of 2026-05-03 per PrivacyPatrol AI
// run). Stage 21 is Visual Assets. Stage 22 is Distribution Setup.
export { analyzeStage20CodeQuality as analyzeStage20 } from './stage-20-code-quality.js';
export { analyzeStage20 as analyzeStage20BuildExecution } from './stage-20-build-execution.js';
export { analyzeStage21 } from './stage-21-quality-assurance.js';
export { analyzeStage22 } from './stage-22-build-review.js';
// SD-LEO-FEAT-STAGE-LAUNCH-READINESS-001 FR-2: stage-23-release-readiness.js was misfiled S22 logic with no production caller (production S23 dispatches via stage-23.js TEMPLATE.analysisStep -> stage-23-launch-readiness.js). Archived to docs/archived/orphan-stage-23-modules/.
export { analyzeStage23LaunchReadiness as analyzeStage23 } from './stage-23-launch-readiness.js';

// LAUNCH & LEARN (Stages 24-26)
export { analyzeStage23 as analyzeStage24 } from './stage-24-marketing-prep.js';
// SD-LEO-FEAT-STAGE-POST-LAUNCH-001 FR-1: stage 25 now dispatches to canonical
// post-launch review analyzer (was incorrectly aliased to stage-25-launch-readiness.js,
// which produced launch-readiness output for what should be a post-launch review).
export { analyzeStage25PostLaunchReview as analyzeStage25 } from './stage-25-post-launch-review.js';
export { analyzeStage25 as analyzeStage26 } from './stage-26-launch-execution.js';

// ACQUIRABILITY ANALYSIS (Soft-Gate Advisory Steps)
// SD: SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-C
export { analyzeStage00Acquirability } from './stage-00-acquirability.js';
export { analyzeStage18Acquirability as analyzeStage19Acquirability } from './stage-19-acquirability.js';
export { analyzeStage19Acquirability as analyzeStage20Acquirability } from './stage-20-acquirability.js';
export { analyzeStage20Acquirability as analyzeStage21Acquirability } from './stage-21-acquirability.js';
export { analyzeStage21Acquirability as analyzeStage22Acquirability } from './stage-22-acquirability.js';
// SD-LEO-FEAT-STAGE-LAUNCH-READINESS-001 FR-2: stage-23-acquirability.js was a stub that threw on invocation, with no production callers. Archived to docs/archived/orphan-stage-23-modules/. S23 acquirability is not currently scoped; if needed in future, re-implement under canonical stage-23-launch-readiness.js or a dedicated soft-gate path.
// SD-LEO-FEAT-STAGE-POST-LAUNCH-001 FR-5: function renamed to match stage assignment
export { analyzeStage25AcquirabilityReview } from './stage-25-acquirability-review.js';

// SUPPLEMENTARY ANALYSIS STEPS (run inside stage multiplexers)
export { analyzeStage15WireframeGenerator } from './stage-15-wireframe-generator.js';
export { analyzeStage19VisualConvergence } from './stage-19-visual-convergence.js';
export { generateDocs as generateStage17Docs } from './stage-17-doc-generation.js';

/**
 * Get the acquirability analysis step for a given stage number.
 * Returns null for stages without acquirability analysis.
 * @param {number} stageNumber
 * @returns {Promise<Function|null>}
 */
export async function getAcquirabilityStep(stageNumber) {
  const loaders = {
    0: () => import('./stage-00-acquirability.js').then(m => m.analyzeStage00Acquirability),
    19: () => import('./stage-19-acquirability.js').then(m => m.analyzeStage18Acquirability),
    20: () => import('./stage-20-acquirability.js').then(m => m.analyzeStage19Acquirability),
    21: () => import('./stage-21-acquirability.js').then(m => m.analyzeStage20Acquirability),
    22: () => import('./stage-22-acquirability.js').then(m => m.analyzeStage21Acquirability),
    // FR-2: stage 23 has no acquirability analyzer (archived stub). Loader returns null via missing key.
    25: () => import('./stage-25-acquirability-review.js').then(m => m.analyzeStage25AcquirabilityReview),
  };
  const loader = loaders[stageNumber];
  return loader ? loader() : null;
}

/**
 * Get the analysis step function for a given stage number (1-26).
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
    10: () => import('./stage-10-customer-brand.js').then(m => m.analyzeStage10),
    11: () => import('./stage-11-visual-identity.js').then(m => m.analyzeStage11),
    12: () => import('./stage-12-gtm-sales.js').then(m => m.analyzeStage12),
    13: () => import('./stage-13-product-roadmap.js').then(m => m.analyzeStage13),
    14: () => import('./stage-14-technical-architecture.js').then(m => m.analyzeStage14),
    15: () => import('./stage-15-design-studio.js').then(m => m.analyzeStage15DesignStudio),
    16: () => import('./stage-16-financial-projections.js').then(m => m.analyzeStage16),
    17: () => import('./stage-17-blueprint-review.js').then(m => m.analyzeStage17),
    18: () => import('./stage-18-build-readiness.js').then(m => m.analyzeStage18),
    19: () => import('./stage-19-sprint-planning.js').then(m => m.analyzeStage19),
    // SD-LEO-FEAT-STAGE-CODE-QUALITY-001 FR-1: dispatch the canonical analyzer
    20: () => import('./stage-20-code-quality.js').then(m => m.analyzeStage20CodeQuality),
    21: () => import('./stage-21-quality-assurance.js').then(m => m.analyzeStage21),
    22: () => import('./stage-22-build-review.js').then(m => m.analyzeStage22),
    // FR-2: stage 23 dispatches to canonical launch-readiness analyzer (production runtime path; previously misrouted to misfiled stage-23-release-readiness.js)
    23: () => import('./stage-23-launch-readiness.js').then(m => m.analyzeStage23LaunchReadiness),
    24: () => import('./stage-24-marketing-prep.js').then(m => m.analyzeStage23),
    // SD-LEO-FEAT-STAGE-POST-LAUNCH-001 FR-1: dispatch the canonical post-launch analyzer
    25: () => import('./stage-25-post-launch-review.js').then(m => m.analyzeStage25PostLaunchReview),
    26: () => import('./stage-26-launch-execution.js').then(m => m.analyzeStage25),
  };
  const loader = loaders[stageNumber];
  return loader ? loader() : null;
}
