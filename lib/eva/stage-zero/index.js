/**
 * Stage 0 Module - CLI Venture Entry Process
 *
 * Central entry point for all Stage 0 functionality.
 * Transforms raw input into a structured venture brief ready for Stage 1.
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-B
 */

export {
  executeStageZero,
  ENTRY_PATHS,
  PATH_OPTIONS,
  listDiscoveryStrategies,
} from './stage-zero-orchestrator.js';

export {
  routePath,
} from './path-router.js';

export {
  conductChairmanReview,
  persistVentureBrief,
} from './chairman-review.js';

export {
  validatePathOutput,
  validateSynthesisInput,
  validateVentureBrief,
  createPathOutput,
} from './interfaces.js';

export { runSynthesis } from './synthesis/index.js';

export { generateForecast, calculateVentureScore } from './modeling.js';

export {
  generateCounterfactual,
  runBatchCounterfactual,
  generatePredictiveReport,
  persistCounterfactualResults,
} from './counterfactual-engine.js';

export {
  parkVenture,
  reactivateVenture,
  recordSynthesisFeedback,
  checkNurseryTriggers,
  getNurseryHealth,
} from './venture-nursery.js';
