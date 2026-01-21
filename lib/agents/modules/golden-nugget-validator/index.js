/**
 * Golden Nugget Validator - Index Module
 *
 * Re-exports all functionality from sub-modules for a clean public API.
 *
 * @module lib/agents/modules/golden-nugget-validator
 */

// Error Classes
export { GoldenNuggetValidationException } from './errors.js';

// Semantic Validation
export {
  checkSemanticEntropy,
  validateSemanticKeywords,
  checkEpistemicClassification
} from './semantic-validation.js';

// Design Fidelity
export { checkDesignFidelity } from './design-fidelity.js';

// Stage Configuration
export {
  loadStagesConfig,
  getStageRequirements,
  reloadStagesConfig,
  getStagesConfig,
  getStagesById
} from './stage-config.js';

// Artifact Validation
export { validateArtifactQuality } from './artifact-validation.js';

// Exit Gate Validation
export { validateExitGate } from './exit-gate-validation.js';
