/**
 * VentureStateMachine - Index Module
 *
 * Re-exports all functionality from sub-modules for a clean public API.
 *
 * @module lib/agents/modules/venture-state-machine
 */

// Error Classes
export {
  StateStalenessError,
  GoldenNuggetValidationError,
  StageGateValidationError
} from './errors.js';

// Stage Gates
export { validateStageGate } from './stage-gates.js';

// Truth Layer
export {
  logPrediction,
  logOutcome,
  computeCalibrationDelta
} from './truth-layer.js';

// Handoff Operations
export {
  REQUIRED_HANDOFF_FIELDS,
  validateHandoffPackage,
  verifyCeoAuthority,
  approveHandoff,
  rejectHandoff,
  requestChanges,
  getStageRequirements
} from './handoff-operations.js';
