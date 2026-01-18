/**
 * Quality Lifecycle System - Triage & Prioritization Engine
 *
 * This module provides tools for managing feedback item triage,
 * priority calculation, burst detection, snoozing, and filtering.
 *
 * Part of SD-QUALITY-TRIAGE-001: Triage & Prioritization Engine
 *
 * @module lib/quality
 */

// Priority Calculator
export {
  calculatePriority,
  calculateEnhancementPriority,
  updateFeedbackPriority,
  recalculateAllPriorities,
  priorityToNumber,
  normalizePriority,
  SEVERITY_PRIORITY_MAP,
  TYPE_ADJUSTMENT,
  SOURCE_ADJUSTMENT,
  VALUE_EFFORT_MATRIX
} from './priority-calculator.js';

// Burst Detector
export {
  detectBursts,
  createBurstGroup,
  runBurstDetection,
  findExistingBurstGroup,
  addToBurstGroup,
  generateFingerprint,
  BURST_CONFIG
} from './burst-detector.js';

// Re-export from other modules (keeping compatibility)
// Note: These modules still use CommonJS and need to be converted if they are used
// import * as snoozeManager from './snooze-manager.js';
// import * as focusFilter from './focus-filter.js';
// import * as ignorePatterns from './ignore-patterns.js';

// Temporary: Dynamic import for CommonJS modules
// These will work but with a different pattern
export async function getSnoozeManager() {
  const module = await import('./snooze-manager.js');
  return module;
}

export async function getFocusFilter() {
  const module = await import('./focus-filter.js');
  return module;
}

export async function getIgnorePatterns() {
  const module = await import('./ignore-patterns.js');
  return module;
}
