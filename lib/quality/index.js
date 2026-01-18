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

// Ignore Patterns
export {
  createIgnorePattern,
  getActivePatterns,
  matchesIgnorePattern,
  deactivatePattern,
  deletePattern,
  autoIgnoreFeedback,
  processFeedbackForIgnore,
  checkMatch,
  globMatch,
  PATTERN_TYPES,
  MATCHABLE_FIELDS
} from './ignore-patterns.js';

// Triage Engine
export {
  triageFeedback,
  batchTriage,
  triageUntriaged,
  getTriageStats
} from './triage-engine.js';

// Snooze Manager
export {
  snoozeFeedback,
  unsnoozeFeedback,
  resnooze,
  wakeExpiredSnoozes,
  getSnoozedItems,
  parseDuration,
  formatDuration,
  SNOOZE_PRESETS
} from './snooze-manager.js';

// Focus Filter
export {
  getMyFocusContext,
  getCriticalItems,
  getUrgentItems,
  getActionRequired,
  getMyAssignedItems,
  getApplicationFocus,
  formatFocusSummary,
  getItemAge,
  DEFAULT_FOCUS_CONFIG
} from './focus-filter.js';
