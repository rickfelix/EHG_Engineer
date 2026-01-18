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

const priorityCalculator = require('./priority-calculator');
const burstDetector = require('./burst-detector');
const snoozeManager = require('./snooze-manager');
const focusFilter = require('./focus-filter');
const ignorePatterns = require('./ignore-patterns');

module.exports = {
  // Priority Calculator
  calculatePriority: priorityCalculator.calculatePriority,
  updateFeedbackPriority: priorityCalculator.updateFeedbackPriority,
  recalculateAllPriorities: priorityCalculator.recalculateAllPriorities,
  priorityToNumber: priorityCalculator.priorityToNumber,
  SEVERITY_PRIORITY_MAP: priorityCalculator.SEVERITY_PRIORITY_MAP,

  // Burst Detector
  detectBursts: burstDetector.detectBursts,
  createBurstGroup: burstDetector.createBurstGroup,
  runBurstDetection: burstDetector.runBurstDetection,
  findExistingBurstGroup: burstDetector.findExistingBurstGroup,
  addToBurstGroup: burstDetector.addToBurstGroup,
  BURST_CONFIG: burstDetector.BURST_CONFIG,

  // Snooze Manager
  snoozeFeedback: snoozeManager.snoozeFeedback,
  unsnoozeFeedback: snoozeManager.unsnoozeFeedback,
  resnooze: snoozeManager.resnooze,
  wakeExpiredSnoozes: snoozeManager.wakeExpiredSnoozes,
  getSnoozedItems: snoozeManager.getSnoozedItems,
  SNOOZE_PRESETS: snoozeManager.SNOOZE_PRESETS,

  // Focus Filter
  getMyFocusContext: focusFilter.getMyFocusContext,
  getCriticalItems: focusFilter.getCriticalItems,
  getUrgentItems: focusFilter.getUrgentItems,
  getActionRequired: focusFilter.getActionRequired,
  getMyAssignedItems: focusFilter.getMyAssignedItems,
  getApplicationFocus: focusFilter.getApplicationFocus,
  formatFocusSummary: focusFilter.formatFocusSummary,

  // Ignore Patterns
  createIgnorePattern: ignorePatterns.createIgnorePattern,
  getActivePatterns: ignorePatterns.getActivePatterns,
  matchesIgnorePattern: ignorePatterns.matchesIgnorePattern,
  deactivatePattern: ignorePatterns.deactivatePattern,
  processFeedbackForIgnore: ignorePatterns.processFeedbackForIgnore,
  PATTERN_TYPES: ignorePatterns.PATTERN_TYPES,
  MATCHABLE_FIELDS: ignorePatterns.MATCHABLE_FIELDS
};
