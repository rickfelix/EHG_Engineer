/**
 * Audit Logger
 * SD-LEO-SELF-IMPROVE-001C - Phase 1: Feedback Quality Layer
 *
 * Provides comprehensive audit logging for feedback quality processing.
 * Tracks all operations: sanitization, scoring, quarantine, enhancement.
 *
 * @module lib/quality/audit-logger
 */

import { loadConfig } from './sanitizer.js';

/**
 * Audit event types
 */
export const AUDIT_EVENTS = {
  // Sanitization events
  SANITIZATION_START: 'sanitization_start',
  SANITIZATION_COMPLETE: 'sanitization_complete',
  SANITIZATION_FAILED: 'sanitization_failed',
  PII_DETECTED: 'pii_detected',
  PII_REDACTED: 'pii_redacted',

  // Injection events
  INJECTION_DETECTED: 'injection_detected',
  INJECTION_BLOCKED: 'injection_blocked',

  // Quality events
  QUALITY_SCORED: 'quality_scored',
  QUALITY_LOW: 'quality_low',
  QUALITY_ENHANCED: 'quality_enhanced',

  // Quarantine events
  QUARANTINE_EVALUATED: 'quarantine_evaluated',
  QUARANTINE_CREATED: 'quarantine_created',
  QUARANTINE_RELEASED: 'quarantine_released',
  QUARANTINE_APPROVED: 'quarantine_approved',
  QUARANTINE_REJECTED: 'quarantine_rejected',

  // Processing events
  PROCESSING_START: 'processing_start',
  PROCESSING_COMPLETE: 'processing_complete',
  PROCESSING_FAILED: 'processing_failed',
  PROCESSING_SKIPPED: 'processing_skipped'
};

/**
 * Audit log storage mode
 */
export const STORAGE_MODE = {
  DATABASE: 'database',
  CONSOLE: 'console',
  BOTH: 'both'
};

// Default storage mode
let currentStorageMode = STORAGE_MODE.CONSOLE;

// In-memory buffer for batch logging
const logBuffer = [];
const BUFFER_FLUSH_SIZE = 10;
const BUFFER_FLUSH_INTERVAL_MS = 5000;

// Flush timer
let flushTimer = null;

/**
 * Set storage mode
 * @param {string} mode - Storage mode (database, console, both)
 */
export function setStorageMode(mode) {
  if (Object.values(STORAGE_MODE).includes(mode)) {
    currentStorageMode = mode;
  }
}

/**
 * Create an audit log entry
 * @param {Object} entry - Log entry details
 * @param {string} entry.event - Event type from AUDIT_EVENTS
 * @param {string} entry.feedbackId - Related feedback ID
 * @param {Object} entry.data - Event-specific data
 * @param {Object} entry.metadata - Additional metadata
 * @returns {Object} Created log entry
 */
function createLogEntry(entry) {
  return {
    id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    event: entry.event,
    feedback_id: entry.feedbackId,
    data: entry.data || {},
    metadata: {
      ...entry.metadata,
      source: 'feedback_quality_layer',
      sd: 'SD-LEO-SELF-IMPROVE-001C'
    }
  };
}

/**
 * Log to console
 * @param {Object} entry - Log entry
 */
function logToConsole(entry) {
  const prefix = `[FeedbackQuality:${entry.event}]`;
  const feedbackRef = entry.feedback_id ? ` [${entry.feedback_id}]` : '';

  // Determine log level based on event type
  if (entry.event.includes('FAILED') || entry.event.includes('BLOCKED')) {
    console.error(`${prefix}${feedbackRef}`, entry.data);
  } else if (entry.event.includes('DETECTED') || entry.event.includes('LOW')) {
    console.warn(`${prefix}${feedbackRef}`, entry.data);
  } else {
    console.log(`${prefix}${feedbackRef}`, entry.data);
  }
}

/**
 * Log to database
 * @param {Object} entry - Log entry
 * @param {Object} supabase - Supabase client
 */
async function logToDatabase(entry, supabase) {
  if (!supabase) {
    console.warn('[AuditLogger] No Supabase client for database logging');
    return;
  }

  try {
    // Store in feedback metadata audit trail
    // This approach avoids creating a new table
    const { data: feedback, error: fetchError } = await supabase
      .from('feedback')
      .select('metadata')
      .eq('id', entry.feedback_id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 = not found, which is OK for new items
      throw fetchError;
    }

    const existingAudit = feedback?.metadata?.audit_trail || [];
    const updatedAudit = [...existingAudit, entry].slice(-50); // Keep last 50 entries

    await supabase
      .from('feedback')
      .update({
        metadata: {
          ...feedback?.metadata,
          audit_trail: updatedAudit,
          last_audit_event: entry.event,
          last_audit_at: entry.timestamp
        }
      })
      .eq('id', entry.feedback_id);

  } catch (error) {
    console.error('[AuditLogger] Failed to log to database:', error.message);
  }
}

/**
 * Flush log buffer to database
 * @param {Object} supabase - Supabase client
 */
async function flushBuffer(supabase) {
  if (logBuffer.length === 0) return;

  const entries = logBuffer.splice(0, logBuffer.length);

  for (const entry of entries) {
    await logToDatabase(entry, supabase);
  }
}

/**
 * Start buffer flush timer
 * @param {Object} supabase - Supabase client
 */
export function startFlushTimer(supabase) {
  if (flushTimer) return;

  flushTimer = setInterval(() => {
    flushBuffer(supabase).catch(console.error);
  }, BUFFER_FLUSH_INTERVAL_MS);

  // Don't keep process alive
  if (flushTimer.unref) {
    flushTimer.unref();
  }
}

/**
 * Stop buffer flush timer
 */
export function stopFlushTimer() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

/**
 * Log an audit event
 * @param {string} event - Event type from AUDIT_EVENTS
 * @param {string} feedbackId - Related feedback ID
 * @param {Object} data - Event-specific data
 * @param {Object} options - Logging options
 * @param {Object} options.supabase - Supabase client (for database mode)
 * @param {Object} options.metadata - Additional metadata
 * @returns {Object} Created log entry
 */
export async function log(event, feedbackId, data = {}, options = {}) {
  // Check if audit logging is enabled
  try {
    const config = await loadConfig();
    if (!config.enable_audit_logging) {
      return null;
    }
  } catch {
    // Config unavailable, continue with logging
  }

  const entry = createLogEntry({
    event,
    feedbackId,
    data,
    metadata: options.metadata
  });

  // Console logging
  if (currentStorageMode === STORAGE_MODE.CONSOLE || currentStorageMode === STORAGE_MODE.BOTH) {
    logToConsole(entry);
  }

  // Database logging
  if ((currentStorageMode === STORAGE_MODE.DATABASE || currentStorageMode === STORAGE_MODE.BOTH) &&
      options.supabase) {
    // Buffer for batch insert
    logBuffer.push(entry);

    if (logBuffer.length >= BUFFER_FLUSH_SIZE) {
      await flushBuffer(options.supabase);
    }
  }

  return entry;
}

/**
 * Log sanitization start
 */
export async function logSanitizationStart(feedbackId, options = {}) {
  return log(AUDIT_EVENTS.SANITIZATION_START, feedbackId, {
    started_at: new Date().toISOString()
  }, options);
}

/**
 * Log sanitization complete
 */
export async function logSanitizationComplete(feedbackId, result, options = {}) {
  return log(AUDIT_EVENTS.SANITIZATION_COMPLETE, feedbackId, {
    redaction_count: result.redactions?.length || 0,
    injection_detected: result.injection?.detected || false,
    processing_time_ms: result.processing_time_ms
  }, options);
}

/**
 * Log PII detection
 */
export async function logPIIDetected(feedbackId, redactions, options = {}) {
  return log(AUDIT_EVENTS.PII_DETECTED, feedbackId, {
    count: redactions.length,
    types: [...new Set(redactions.map(r => r.type))],
    severities: [...new Set(redactions.map(r => r.severity))]
  }, options);
}

/**
 * Log injection detection
 */
export async function logInjectionDetected(feedbackId, injectionResult, options = {}) {
  return log(AUDIT_EVENTS.INJECTION_DETECTED, feedbackId, {
    risk_score: injectionResult.risk_score,
    pattern_count: injectionResult.patterns?.length || 0,
    pattern_types: injectionResult.patterns?.map(p => p.type) || []
  }, options);
}

/**
 * Log quality score
 */
export async function logQualityScored(feedbackId, scoreResult, options = {}) {
  return log(AUDIT_EVENTS.QUALITY_SCORED, feedbackId, {
    score: scoreResult.score,
    dimensions: scoreResult.dimensions,
    processing_time_ms: scoreResult.processing_time_ms
  }, options);
}

/**
 * Log quarantine decision
 */
export async function logQuarantineEvaluated(feedbackId, decision, options = {}) {
  return log(AUDIT_EVENTS.QUARANTINE_EVALUATED, feedbackId, {
    should_quarantine: decision.shouldQuarantine,
    risk_score: decision.riskScore,
    reasons: decision.reasons?.map(r => r.type) || []
  }, options);
}

/**
 * Log quarantine creation
 */
export async function logQuarantineCreated(feedbackId, record, options = {}) {
  return log(AUDIT_EVENTS.QUARANTINE_CREATED, feedbackId, {
    status: record.status,
    risk_score: record.risk_score
  }, options);
}

/**
 * Log processing complete
 */
export async function logProcessingComplete(feedbackId, summary, options = {}) {
  return log(AUDIT_EVENTS.PROCESSING_COMPLETE, feedbackId, {
    sanitized: summary.sanitized || false,
    quarantined: summary.quarantined || false,
    quality_score: summary.qualityScore,
    total_processing_time_ms: summary.totalProcessingTime
  }, options);
}

/**
 * Get audit trail for a feedback item
 * @param {string} feedbackId - Feedback ID
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Array>} Audit trail entries
 */
export async function getAuditTrail(feedbackId, supabase) {
  const { data, error } = await supabase
    .from('feedback')
    .select('metadata')
    .eq('id', feedbackId)
    .single();

  if (error) throw error;

  return data?.metadata?.audit_trail || [];
}

// Export default for CommonJS compatibility
export default {
  AUDIT_EVENTS,
  STORAGE_MODE,
  setStorageMode,
  log,
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
};
