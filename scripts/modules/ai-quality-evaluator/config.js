/**
 * AI Quality Evaluator - Configuration
 * Band thresholds, SD-type thresholds, and blocking thresholds
 */

// Scoring band thresholds (v1.2.0)
// Bands stabilize pass/fail decisions even when exact scores vary
export const BAND_THRESHOLDS = {
  PASS: 80,        // 80+ = PASS
  NEEDS_REVIEW: 50 // 50-79 = NEEDS_REVIEW, <50 = FAIL
};

// SD-type-aware pass thresholds
// PHASE 1: Start lenient, tighten based on data
export const SD_TYPE_PASS_THRESHOLDS = {
  // Documentation-only SDs: Very lenient (focus on clarity)
  documentation: 50,

  // Infrastructure SDs: Lenient (internal tooling)
  infrastructure: 55,

  // Feature SDs: Moderate baseline
  feature: 60,

  // Database SDs: Slightly stricter (data integrity)
  database: 65,

  // Security SDs: Stricter (but not blocking)
  security: 65
};

// SD-type-aware blocking thresholds for feedback generation
// Aligns blocking behavior with pass thresholds by SD type
export const SD_TYPE_BLOCKING_THRESHOLDS = {
  // Documentation SDs: Very lenient - almost never block on criterion scores
  documentation: { severeThreshold: 1, majorThreshold: 2 },

  // Infrastructure SDs: Lenient - only block on truly severe failures
  infrastructure: { severeThreshold: 2, majorThreshold: 3 },

  // Feature SDs: Standard thresholds (default behavior)
  feature: { severeThreshold: 3, majorThreshold: 5 },

  // Database SDs: Moderate
  database: { severeThreshold: 3, majorThreshold: 4 },

  // Security SDs: Strict - maintain high standards
  security: { severeThreshold: 3, majorThreshold: 5 }
};

// Orchestrator SD threshold (very lenient - coordination, not direct work)
export const ORCHESTRATOR_THRESHOLD = 50;

// Default threshold when SD type is unknown
export const DEFAULT_THRESHOLD = 60;
