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

// Sanitizer (SD-LEO-SELF-IMPROVE-001C)
export {
  sanitize,
  quickRiskCheck,
  loadConfig,
  clearConfigCache,
  getThresholds
} from './sanitizer.js';

// Quality Scorer (SD-LEO-SELF-IMPROVE-001C)
export {
  calculateQualityScore,
  getQualityTier,
  generateImprovementSuggestions,
  quickQualityCheck
} from './quality-scorer.js';

// Quarantine Engine (SD-LEO-SELF-IMPROVE-001C)
export {
  QUARANTINE_STATUS,
  QUARANTINE_REASONS,
  evaluateQuarantine,
  createQuarantineRecord,
  releaseFromQuarantine,
  getPendingQuarantineItems,
  getQuarantineStats
} from './quarantine-engine.js';

// Audit Logger (SD-LEO-SELF-IMPROVE-001C)
export {
  AUDIT_EVENTS,
  STORAGE_MODE,
  setStorageMode,
  log as auditLog,
  logSanitizationStart,
  logSanitizationComplete,
  logPIIDetected,
  logInjectionDetected,
  logQualityScored,
  logQuarantineEvaluated,
  logQuarantineCreated,
  logProcessingComplete,
  getAuditTrail,
  startFlushTimer,
  stopFlushTimer
} from './audit-logger.js';

// Feedback Quality Processor (SD-LEO-SELF-IMPROVE-001C, 001D)
// Now integrated with Feature Flags (SD-LEO-SELF-IMPROVE-001D)
export {
  PROCESSING_STATUS,
  processQuality,
  processQualityAsync,
  batchProcessQuality,
  getProcessingStats
} from './feedback-quality-processor.js';

// Re-export Feature Flags for convenience
export {
  evaluateFlag,
  isEnabled,
  isKillSwitchActive
} from '../feature-flags/index.js';
