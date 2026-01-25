/**
 * Session Event Collector
 *
 * Collects SD lifecycle events and issue events during an orchestrator session.
 * Provides data for session summary generation.
 *
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-08 (FR-5, TR-2)
 *
 * @see docs/discovery/auto-proceed-enhancement-discovery.md
 */

import { redactSecrets } from './secret-redactor.js';

// Valid SD final statuses
const VALID_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'SUCCESS', 'FAILED', 'SKIPPED', 'CANCELLED'];

// Issue severity levels
const VALID_SEVERITIES = ['ERROR', 'WARN'];

/**
 * Session Event Collector
 * In-memory data structure for collecting SD lifecycle and issue events
 */
export class SessionEventCollector {
  /**
   * Create a new Session Event Collector
   * @param {string} sessionId - Unique session identifier
   * @param {object} options - Configuration options
   * @param {string} options.orchestratorVersion - Version of the orchestrator
   * @param {boolean} options.durableFlush - Whether to enable durable flush (default: false)
   * @param {string} options.artifactPath - Path for durable flush artifacts
   */
  constructor(sessionId, options = {}) {
    this.sessionId = sessionId;
    this.orchestratorVersion = options.orchestratorVersion || '1.0.0';
    this.durableFlush = options.durableFlush || false;
    this.artifactPath = options.artifactPath || null;

    // Session timestamps
    this.startTimestamp = new Date().toISOString();
    this.endTimestamp = null;

    // SD tracking
    this.sds = new Map(); // sd_id -> SD entry

    // Issues tracking
    this.issues = []; // Issue entries

    // Store write failure tracking
    this.storeWriteFailures = 0;

    // Lock for concurrent access (simple mutex)
    this._locked = false;
  }

  /**
   * Acquire lock for concurrent access
   * @returns {Promise<void>}
   */
  async _acquireLock() {
    while (this._locked) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }
    this._locked = true;
  }

  /**
   * Release lock
   */
  _releaseLock() {
    this._locked = false;
  }

  /**
   * Record an SD being queued
   * @param {string} sdId - SD identifier
   * @param {object} metadata - SD metadata
   * @param {string} metadata.title - SD title
   * @param {string} metadata.category - SD category
   * @param {string} metadata.priority - SD priority
   * @returns {boolean} Success status
   */
  recordSdQueued(sdId, metadata = {}) {
    try {
      const now = new Date().toISOString();

      if (!sdId) {
        this._recordStoreWriteFailure('recordSdQueued: missing sd_id');
        return false;
      }

      const entry = {
        sd_id: sdId,
        title: metadata.title || null,
        category: metadata.category || null,
        priority: metadata.priority || null,
        queued_at: now,
        start_timestamp: null,
        end_timestamp: null,
        duration_ms: null,
        final_status: 'NOT_STARTED',
        attempt_count: 0
      };

      this.sds.set(sdId, entry);
      return true;
    } catch (err) {
      this._recordStoreWriteFailure(`recordSdQueued error: ${err.message}`);
      return false;
    }
  }

  /**
   * Record an SD starting execution
   * @param {string} sdId - SD identifier
   * @returns {boolean} Success status
   */
  recordSdStarted(sdId) {
    try {
      const now = new Date().toISOString();

      if (!sdId) {
        this._recordStoreWriteFailure('recordSdStarted: missing sd_id');
        return false;
      }

      const entry = this.sds.get(sdId);
      if (!entry) {
        // Auto-queue if not already queued
        this.recordSdQueued(sdId);
        return this.recordSdStarted(sdId);
      }

      entry.start_timestamp = now;
      entry.final_status = 'IN_PROGRESS';
      entry.attempt_count += 1;

      return true;
    } catch (err) {
      this._recordStoreWriteFailure(`recordSdStarted error: ${err.message}`);
      return false;
    }
  }

  /**
   * Record an SD reaching a terminal state
   * @param {string} sdId - SD identifier
   * @param {string} status - Terminal status (SUCCESS, FAILED, SKIPPED, CANCELLED)
   * @param {object} options - Additional options
   * @param {string} options.errorClass - Exception class name (for FAILED status)
   * @param {string} options.errorMessage - Exception message (for FAILED status)
   * @returns {boolean} Success status
   */
  recordSdTerminal(sdId, status, options = {}) {
    try {
      const now = new Date().toISOString();

      if (!sdId) {
        this._recordStoreWriteFailure('recordSdTerminal: missing sd_id');
        return false;
      }

      if (!VALID_STATUSES.includes(status)) {
        this._recordStoreWriteFailure(`recordSdTerminal: invalid status '${status}'`);
        return false;
      }

      const entry = this.sds.get(sdId);
      if (!entry) {
        // Auto-queue if not already queued
        this.recordSdQueued(sdId);
        return this.recordSdTerminal(sdId, status, options);
      }

      // Prevent multiple terminal state assignments
      if (['SUCCESS', 'FAILED', 'SKIPPED', 'CANCELLED'].includes(entry.final_status)) {
        // Already terminal, ignore duplicate
        return true;
      }

      entry.end_timestamp = now;
      entry.final_status = status;

      // Calculate duration if we have a start timestamp
      if (entry.start_timestamp) {
        const startTime = new Date(entry.start_timestamp).getTime();
        const endTime = new Date(entry.end_timestamp).getTime();
        entry.duration_ms = Math.max(0, endTime - startTime);
      } else {
        entry.duration_ms = 0;
      }

      // If failed with exception, record as an issue
      if (status === 'FAILED' && options.errorClass) {
        this.recordIssue('ERROR', `SD_${status}`, redactSecrets(options.errorMessage || 'SD failed'), {
          sd_id: sdId,
          error_class: options.errorClass
        });
      }

      return true;
    } catch (err) {
      this._recordStoreWriteFailure(`recordSdTerminal error: ${err.message}`);
      return false;
    }
  }

  /**
   * Record an issue event
   * @param {string} severity - Issue severity (ERROR or WARN)
   * @param {string} code - Stable issue code
   * @param {string} message - Human-readable message
   * @param {object} options - Additional options
   * @param {string} options.sd_id - Associated SD ID (nullable)
   * @param {string[]} options.correlation_ids - Correlation IDs
   * @returns {boolean} Success status
   */
  recordIssue(severity, code, message, options = {}) {
    try {
      const now = new Date().toISOString();

      if (!VALID_SEVERITIES.includes(severity)) {
        severity = 'ERROR'; // Default to ERROR
      }

      if (!code) {
        code = 'UNKNOWN_ISSUE';
      }

      // Check for existing issue with same code and sd_id
      const existingIssue = this.issues.find(
        i => i.issue_code === code && i.sd_id === (options.sd_id || null)
      );

      if (existingIssue) {
        // Update existing issue
        existingIssue.last_seen_timestamp = now;
        existingIssue.occurrences_count += 1;
        if (options.correlation_ids) {
          existingIssue.correlation_ids.push(...options.correlation_ids);
        }
        return true;
      }

      // Create new issue entry
      const issue = {
        severity,
        sd_id: options.sd_id || null,
        issue_code: code,
        message: redactSecrets(message || 'No message provided'),
        first_seen_timestamp: now,
        last_seen_timestamp: now,
        occurrences_count: 1,
        correlation_ids: options.correlation_ids || []
      };

      this.issues.push(issue);
      return true;
    } catch (err) {
      this._recordStoreWriteFailure(`recordIssue error: ${err.message}`);
      return false;
    }
  }

  /**
   * Record a store write failure (internal use)
   * @param {string} details - Failure details
   */
  _recordStoreWriteFailure(details) {
    this.storeWriteFailures += 1;
    console.warn(`   ⚠️  Session store write failed: ${details}`);
  }

  /**
   * Get snapshot of all collected data
   * @returns {object} Snapshot of session data
   */
  getSnapshot() {
    const now = new Date().toISOString();

    // Convert SD map to array
    const sdsArray = Array.from(this.sds.values());

    // Add store write failure issue if any occurred
    const issues = [...this.issues];
    if (this.storeWriteFailures > 0) {
      issues.push({
        severity: 'WARN',
        sd_id: null,
        issue_code: 'SESSION_STORE_WRITE_FAILED',
        message: `Session store experienced ${this.storeWriteFailures} write failure(s)`,
        first_seen_timestamp: this.startTimestamp,
        last_seen_timestamp: now,
        occurrences_count: this.storeWriteFailures,
        correlation_ids: []
      });
    }

    return {
      session_id: this.sessionId,
      orchestrator_version: this.orchestratorVersion,
      start_timestamp: this.startTimestamp,
      end_timestamp: this.endTimestamp || now,
      sds: sdsArray,
      issues,
      store_write_failures: this.storeWriteFailures
    };
  }

  /**
   * Mark session as complete
   */
  complete() {
    this.endTimestamp = new Date().toISOString();
  }

  /**
   * Get count of SDs by status
   * @returns {object} Map of status -> count
   */
  getSdCountsByStatus() {
    const counts = {};
    for (const sd of this.sds.values()) {
      const status = sd.final_status || 'NOT_STARTED';
      counts[status] = (counts[status] || 0) + 1;
    }
    return counts;
  }

  /**
   * Get total number of SDs
   * @returns {number} Total SD count
   */
  getTotalSds() {
    return this.sds.size;
  }

  /**
   * Get overall session status
   * @returns {string} Overall status (SUCCESS, FAILED, CANCELLED)
   */
  getOverallStatus() {
    const counts = this.getSdCountsByStatus();

    // CANCELLED if any SD was cancelled
    if (counts['CANCELLED'] > 0) {
      return 'CANCELLED';
    }

    // FAILED if any SD failed
    if (counts['FAILED'] > 0) {
      return 'FAILED';
    }

    // SUCCESS if all SDs are SUCCESS or SKIPPED
    const terminalSuccess = (counts['SUCCESS'] || 0) + (counts['SKIPPED'] || 0);
    if (terminalSuccess === this.sds.size && this.sds.size > 0) {
      return 'SUCCESS';
    }

    // FAILED if session-level issues exist
    const sessionIssues = this.issues.filter(i => i.sd_id === null && i.severity === 'ERROR');
    if (sessionIssues.length > 0) {
      return 'FAILED';
    }

    // Default to FAILED if nothing succeeded
    if (this.sds.size === 0) {
      return 'SUCCESS'; // Empty session is success
    }

    return 'FAILED';
  }

  /**
   * Validate collector data integrity
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate() {
    const errors = [];

    // Check for SDs missing sd_id
    for (const sd of this.sds.values()) {
      if (!sd.sd_id) {
        errors.push('SD entry missing sd_id');
      }

      // Check for negative durations
      if (sd.duration_ms !== null && sd.duration_ms < 0) {
        errors.push(`SD ${sd.sd_id} has negative duration: ${sd.duration_ms}ms`);
      }

      // Check for invalid status
      if (!VALID_STATUSES.includes(sd.final_status)) {
        errors.push(`SD ${sd.sd_id} has invalid status: ${sd.final_status}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

/**
 * Create a new Session Event Collector
 * @param {string} sessionId - Unique session identifier
 * @param {object} options - Configuration options
 * @returns {SessionEventCollector}
 */
export function createCollector(sessionId, options = {}) {
  return new SessionEventCollector(sessionId, options);
}

export default {
  SessionEventCollector,
  createCollector,
  VALID_STATUSES,
  VALID_SEVERITIES
};
