/**
 * UAT Module Index
 *
 * Purpose: Export all UAT-related functions for /uat command
 * SD: SD-UAT-QA-001
 *
 * Usage:
 *   import { generateScenarios, startSession, routeDefect } from './lib/uat/index.js';
 */

// Scenario Generator
export {
  generateScenarios,
  checkUATReadiness,
  default as scenarioGenerator
} from './scenario-generator.js';

// Result Recorder
export {
  startSession,
  recordResult,
  completeSession,
  getSessionStatus,
  getLatestSession,
  default as resultRecorder
} from './result-recorder.js';

// Risk Router
export {
  assessRisk,
  routeDefect,
  getRoutingOptions,
  checkFileRisk,
  QUICK_FIX_MAX_LOC,
  default as riskRouter
} from './risk-router.js';

// SD Type Validation (re-export for convenience)
export { getUATRequirement } from '../utils/sd-type-validation.js';
