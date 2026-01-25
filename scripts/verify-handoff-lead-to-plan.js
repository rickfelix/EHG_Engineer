#!/usr/bin/env node

/**
 * LEAD → PLAN Handoff Verification Script
 * LEO Protocol v4.1.2 - Strategic Quality Gate
 *
 * ENFORCES: Strategic Directive must be complete before PLAN phase begins
 * PREVENTS: Incomplete or unclear strategic direction reaching technical planning
 * RETURNS: To LEAD with specific improvement requirements if validation fails
 *
 * REFACTORED: SD-LEO-REFACTOR-VERIFY-L2P-001
 * This file now re-exports from the modular structure in ./verify-l2p/ for backward compatibility.
 * Original file was 1512 LOC, now split into 7 modules under 500 LOC each.
 *
 * Modules:
 * - verify-l2p/constants.js - SD requirements, type patterns
 * - verify-l2p/sd-validation.js - SD completeness validation
 * - verify-l2p/prd-readiness.js - PRD readiness validations
 * - verify-l2p/type-detection.js - Auto-detect SD type
 * - verify-l2p/environment.js - Environment readiness checks
 * - verify-l2p/handoff-execution.js - Create handoff, reject handoff, guidance
 * - verify-l2p/index.js - LeadToPlanVerifier class + CLI
 */

// Re-export main class and functions from modular structure
export {
  default,
  LeadToPlanVerifier,
  validateStrategicDirective,
  validateFeasibility,
  validatePRDReadiness,
  autoDetectSdType,
  checkEnvironmentReadiness,
  createHandoffExecution,
  rejectHandoff,
  generateImprovementGuidance
} from './verify-l2p/index.js';

// Re-export constants for direct access
export {
  SD_REQUIREMENTS,
  PRD_READINESS_CHECKS,
  TYPE_PATTERNS,
  VALID_SD_STATUSES,
  RISK_KEYWORDS,
  TARGET_APP_PATTERNS,
  SMART_KEYWORDS
} from './verify-l2p/constants.js';

// Re-export SD validation functions
export {
  validateFeasibility as validateSdFeasibility
} from './verify-l2p/sd-validation.js';

// Re-export PRD readiness validation functions
export {
  validateVisionDocumentReferences,
  validateDependencyStructure,
  validateScopeStructure,
  validateSuccessCriteriaActionability,
  validateImplementationContext,
  validateDependenciesExist
} from './verify-l2p/prd-readiness.js';

// Re-export type detection functions
export {
  getTypeRecommendation,
  getEffectiveHandoffs,
  getWorstCaseHandoffs
} from './verify-l2p/type-detection.js';

// Re-export environment functions
export {
  validateHandoffDocument
} from './verify-l2p/environment.js';

// Re-export handoff execution functions
export {
  updateSdStatusAfterHandoff
} from './verify-l2p/handoff-execution.js';

// CLI entry point - delegate to index.js
import('./verify-l2p/index.js').then(_module => {
  // Module loaded, CLI handled by index.js
}).catch(_err => {
  // Ignore import errors during static analysis
});
