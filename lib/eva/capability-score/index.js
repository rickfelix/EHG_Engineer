/**
 * Capability Contribution Score — Public API
 * SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-E
 *
 * Barrel export for the CCS module.
 */

export { computeCapabilityScore } from './score-stage.js';
export { getCumulativeProfile, getGateContext } from './cumulative-profile.js';
export { compareVentures } from './compare-ventures.js';
export {
  DIMENSIONS,
  STAGE_DIMENSION_WEIGHTS,
  DIMENSION_RUBRICS,
  DIMENSION_OVERALL_WEIGHTS,
} from './stage-capability-weights.js';
