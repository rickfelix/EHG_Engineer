/**
 * Flywheel Module — EVA Interaction Capture and Analytics
 *
 * SD: SD-LEO-FEAT-DATA-FLYWHEEL-001
 *
 * Entry point re-exporting capture and analytics functions.
 *
 * Usage:
 *   import { captureInteraction, captureHandoffGate } from '../lib/flywheel/index.js';
 *   import { getFlywheelVelocity, getEvaAccuracy } from '../lib/flywheel/index.js';
 */

export { captureInteraction, captureHandoffGate } from './capture.js';
export {
  getFlywheelVelocity,
  getCrossVenturePatterns,
  getEvaAccuracy,
  getFlywheelSummary
} from './analytics.js';
