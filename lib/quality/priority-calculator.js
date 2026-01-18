/**
 * Priority Calculator for Quality Lifecycle System
 *
 * Maps severity levels to priority values (P0-P3) based on configurable rules.
 * Part of SD-QUALITY-TRIAGE-001: Triage & Prioritization Engine
 *
 * @module lib/quality/priority-calculator
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Severity to Priority mapping
 * P0 = Critical (immediate action required)
 * P1 = High (should be addressed soon)
 * P2 = Medium (normal priority)
 * P3 = Low (nice to have)
 */
const SEVERITY_PRIORITY_MAP = {
  critical: 'P0',
  high: 'P1',
  medium: 'P2',
  low: 'P3',
  none: 'P3'
};

/**
 * Type-based priority adjustment
 * Issues get priority boost over enhancements
 */
const TYPE_ADJUSTMENT = {
  issue: -1,      // Boost priority (P2 -> P1)
  enhancement: 0  // Keep as-is
};

/**
 * Source-based priority adjustment
 * Production errors are more urgent than manual feedback
 */
const SOURCE_ADJUSTMENT = {
  error_capture: -1,    // Boost priority
  uat_failure: -1,      // Boost priority
  manual_feedback: 0,   // Keep as-is
  imported: 0           // Keep as-is
};

/**
 * Normalize priority to valid range (P0-P3)
 * @param {number} numericPriority - Numeric priority (0-3)
 * @returns {string} Normalized priority string
 */
function normalizePriority(numericPriority) {
  const clamped = Math.max(0, Math.min(3, numericPriority));
  return `P${clamped}`;
}

/**
 * Convert priority string to numeric value
 * @param {string} priority - Priority string (P0-P3)
 * @returns {number} Numeric priority value
 */
function priorityToNumber(priority) {
  if (!priority) return 2; // Default to P2
  const match = priority.match(/P(\d)/);
  return match ? parseInt(match[1], 10) : 2;
}

/**
 * Calculate priority for a feedback item
 *
 * @param {Object} feedback - Feedback item from database
 * @param {string} feedback.severity - Severity level (critical, high, medium, low)
 * @param {string} feedback.type - Feedback type (issue, enhancement)
 * @param {string} feedback.source_type - Source type (error_capture, manual_feedback, etc.)
 * @param {Object} [options] - Optional configuration
 * @param {boolean} [options.applyTypeAdjustment=true] - Apply type-based adjustment
 * @param {boolean} [options.applySourceAdjustment=true] - Apply source-based adjustment
 * @returns {Object} Priority result with calculated priority and reasoning
 */
function calculatePriority(feedback, options = {}) {
  const {
    applyTypeAdjustment = true,
    applySourceAdjustment = true
  } = options;

  const severity = (feedback.severity || 'medium').toLowerCase();
  const type = (feedback.type || 'issue').toLowerCase();
  const sourceType = (feedback.source_type || 'manual_feedback').toLowerCase();

  // Start with base priority from severity
  const basePriority = SEVERITY_PRIORITY_MAP[severity] || 'P2';
  let numericPriority = priorityToNumber(basePriority);
  const adjustments = [];

  // Apply type adjustment
  if (applyTypeAdjustment && TYPE_ADJUSTMENT[type]) {
    const adj = TYPE_ADJUSTMENT[type];
    numericPriority += adj;
    adjustments.push(`type=${type} (${adj > 0 ? '+' : ''}${adj})`);
  }

  // Apply source adjustment
  if (applySourceAdjustment && SOURCE_ADJUSTMENT[sourceType]) {
    const adj = SOURCE_ADJUSTMENT[sourceType];
    numericPriority += adj;
    adjustments.push(`source=${sourceType} (${adj > 0 ? '+' : ''}${adj})`);
  }

  const finalPriority = normalizePriority(numericPriority);

  return {
    priority: finalPriority,
    basePriority,
    adjustments,
    reasoning: adjustments.length > 0
      ? `Base ${basePriority} adjusted by: ${adjustments.join(', ')}`
      : `Direct mapping from severity=${severity}`
  };
}

/**
 * Update priority for a feedback item in the database
 *
 * @param {string} feedbackId - Feedback item ID
 * @returns {Object} Updated feedback item with new priority
 */
async function updateFeedbackPriority(feedbackId) {
  // Fetch the feedback item
  const { data: feedback, error: fetchError } = await supabase
    .from('feedback')
    .select('*')
    .eq('id', feedbackId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch feedback: ${fetchError.message}`);
  }

  // Calculate new priority
  const result = calculatePriority(feedback);

  // Update the database
  const { data: updated, error: updateError } = await supabase
    .from('feedback')
    .update({
      priority: result.priority,
      priority_reasoning: result.reasoning,
      updated_at: new Date().toISOString()
    })
    .eq('id', feedbackId)
    .select()
    .single();

  if (updateError) {
    throw new Error(`Failed to update priority: ${updateError.message}`);
  }

  return {
    ...updated,
    priorityResult: result
  };
}

/**
 * Recalculate priorities for all open feedback items
 * Useful for applying new priority rules retroactively
 *
 * @returns {Object} Summary of updates
 */
async function recalculateAllPriorities() {
  const { data: items, error } = await supabase
    .from('feedback')
    .select('id')
    .not('status', 'in', '(closed,resolved,rejected)');

  if (error) {
    throw new Error(`Failed to fetch feedback: ${error.message}`);
  }

  const results = {
    total: items.length,
    updated: 0,
    errors: []
  };

  for (const item of items) {
    try {
      await updateFeedbackPriority(item.id);
      results.updated++;
    } catch (err) {
      results.errors.push({ id: item.id, error: err.message });
    }
  }

  return results;
}

module.exports = {
  calculatePriority,
  updateFeedbackPriority,
  recalculateAllPriorities,
  priorityToNumber,
  normalizePriority,
  SEVERITY_PRIORITY_MAP,
  TYPE_ADJUSTMENT,
  SOURCE_ADJUSTMENT
};
