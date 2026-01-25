/**
 * Summary Generator
 *
 * Transforms collected session events into a versioned JSON summary
 * and a human-readable digest.
 *
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-08 (FR-4, TR-1, TR-3)
 *
 * @see docs/discovery/auto-proceed-enhancement-discovery.md
 */

import { redactObject, redactSecrets } from './secret-redactor.js';

// Schema version for the session summary
const SCHEMA_VERSION = '1.0';

// Compilation timeout (500ms per TR-3)
const COMPILATION_TIMEOUT_MS = 500;

// Maximum lines for human-readable digest
const MAX_DIGEST_LINES = 60;

// Maximum issues to show in digest
const MAX_DIGEST_ISSUES = 10;

/**
 * Summary Generator
 * Generates versioned JSON summary and human-readable digest
 */
export class SummaryGenerator {
  /**
   * Create a new Summary Generator
   * @param {object} options - Configuration options
   * @param {number} options.timeout - Compilation timeout in ms (default: 500)
   * @param {number} options.maxDigestLines - Max digest lines (default: 60)
   */
  constructor(options = {}) {
    this.timeout = options.timeout || COMPILATION_TIMEOUT_MS;
    this.maxDigestLines = options.maxDigestLines || MAX_DIGEST_LINES;
  }

  /**
   * Generate session summary from collector snapshot
   * @param {object} snapshot - Snapshot from SessionEventCollector
   * @returns {Promise<{ json: object, digest: string, generation_time_ms: number, degraded: boolean }>}
   */
  async generate(snapshot) {
    const startTime = Date.now();
    let degraded = false;
    let json = null;
    let digest = null;

    try {
      // Wrap compilation in timeout
      const result = await this._withTimeout(
        this._compile(snapshot),
        this.timeout
      );

      json = result.json;
      digest = result.digest;
    } catch (err) {
      if (err.message === 'SUMMARY_TIMEOUT') {
        degraded = true;
        // Generate degraded summary
        const degradedResult = this._generateDegradedSummary(snapshot, startTime);
        json = degradedResult.json;
        digest = degradedResult.digest;
      } else {
        // Schema validation or other error
        const errorResult = this._generateErrorSummary(snapshot, err, startTime);
        json = errorResult.json;
        digest = errorResult.digest;
      }
    }

    const generationTimeMs = Date.now() - startTime;
    json.report_generation_time_ms = generationTimeMs;

    return {
      json,
      digest,
      generation_time_ms: generationTimeMs,
      degraded
    };
  }

  /**
   * Wrap a promise with timeout
   * @param {Promise} promise - Promise to wrap
   * @param {number} timeoutMs - Timeout in ms
   * @returns {Promise}
   */
  async _withTimeout(promise, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('SUMMARY_TIMEOUT'));
      }, timeoutMs);

      promise
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(err => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /**
   * Compile snapshot into JSON summary and digest
   * @param {object} snapshot - Collector snapshot
   * @returns {Promise<{ json: object, digest: string }>}
   */
  async _compile(snapshot) {
    // Validate snapshot
    const validation = this._validateSnapshot(snapshot);
    if (!validation.valid) {
      throw new Error(`SUMMARY_SCHEMA_VALIDATION_FAILED: ${validation.errors.join(', ')}`);
    }

    // Calculate aggregates
    const sdCountsByStatus = this._calculateStatusCounts(snapshot.sds);
    const overallStatus = this._calculateOverallStatus(snapshot.sds, snapshot.issues);
    const duration = this._calculateDuration(snapshot.start_timestamp, snapshot.end_timestamp);

    // Build JSON summary
    const json = {
      report_type: 'session_summary',
      schema_version: SCHEMA_VERSION,
      session_id: snapshot.session_id,
      orchestrator_version: snapshot.orchestrator_version,
      start_timestamp: snapshot.start_timestamp,
      end_timestamp: snapshot.end_timestamp,
      duration_ms: duration,
      overall_status: overallStatus,
      sd_counts_by_status: sdCountsByStatus,
      total_sds: snapshot.sds.length,
      sds: snapshot.sds.map(sd => this._formatSdEntry(sd)),
      issues: snapshot.issues.map(issue => this._formatIssueEntry(issue)),
      report_generation_time_ms: 0 // Will be set after generation
    };

    // Apply redaction to the entire JSON
    const redactedJson = redactObject(json);

    // Generate human-readable digest
    const digest = this._generateDigest(redactedJson);

    return { json: redactedJson, digest };
  }

  /**
   * Validate snapshot for required fields
   * @param {object} snapshot - Collector snapshot
   * @returns {{ valid: boolean, errors: string[] }}
   */
  _validateSnapshot(snapshot) {
    const errors = [];

    if (!snapshot.session_id) {
      errors.push('Missing session_id');
    }

    if (!snapshot.start_timestamp) {
      errors.push('Missing start_timestamp');
    }

    if (!Array.isArray(snapshot.sds)) {
      errors.push('sds must be an array');
    } else {
      snapshot.sds.forEach((sd, index) => {
        if (!sd.sd_id) {
          errors.push(`SD entry at index ${index} missing sd_id`);
        }
      });
    }

    if (!Array.isArray(snapshot.issues)) {
      errors.push('issues must be an array');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Calculate SD counts by status
   * @param {Array} sds - Array of SD entries
   * @returns {object} Map of status -> count
   */
  _calculateStatusCounts(sds) {
    const counts = {};
    for (const sd of sds) {
      const status = sd.final_status || 'NOT_STARTED';
      counts[status] = (counts[status] || 0) + 1;
    }
    return counts;
  }

  /**
   * Calculate overall session status
   * @param {Array} sds - Array of SD entries
   * @param {Array} issues - Array of issue entries
   * @returns {string} Overall status
   */
  _calculateOverallStatus(sds, issues) {
    // CANCELLED if any SD was cancelled
    if (sds.some(sd => sd.final_status === 'CANCELLED')) {
      return 'CANCELLED';
    }

    // FAILED if any SD failed
    if (sds.some(sd => sd.final_status === 'FAILED')) {
      return 'FAILED';
    }

    // FAILED if session-level error issues exist
    const sessionErrors = issues.filter(i => i.sd_id === null && i.severity === 'ERROR');
    if (sessionErrors.length > 0) {
      return 'FAILED';
    }

    // SUCCESS if all SDs are SUCCESS or SKIPPED
    const allSuccessOrSkipped = sds.every(
      sd => sd.final_status === 'SUCCESS' || sd.final_status === 'SKIPPED'
    );

    if (allSuccessOrSkipped && sds.length > 0) {
      return 'SUCCESS';
    }

    // Empty session is SUCCESS
    if (sds.length === 0) {
      return 'SUCCESS';
    }

    return 'FAILED';
  }

  /**
   * Calculate duration in milliseconds
   * @param {string} startTimestamp - ISO timestamp
   * @param {string} endTimestamp - ISO timestamp
   * @returns {number} Duration in ms
   */
  _calculateDuration(startTimestamp, endTimestamp) {
    if (!startTimestamp || !endTimestamp) {
      return 0;
    }

    const start = new Date(startTimestamp).getTime();
    const end = new Date(endTimestamp).getTime();

    return Math.max(0, end - start);
  }

  /**
   * Format SD entry for JSON output
   * @param {object} sd - SD entry from collector
   * @returns {object} Formatted SD entry
   */
  _formatSdEntry(sd) {
    return {
      sd_id: sd.sd_id,
      title: sd.title || null,
      category: sd.category || null,
      priority: sd.priority || null,
      start_timestamp: sd.start_timestamp || null,
      end_timestamp: sd.end_timestamp || null,
      duration_ms: sd.duration_ms !== null ? sd.duration_ms : null,
      final_status: sd.final_status || 'NOT_STARTED',
      attempt_count: sd.attempt_count || 0
    };
  }

  /**
   * Format issue entry for JSON output
   * @param {object} issue - Issue entry from collector
   * @returns {object} Formatted issue entry
   */
  _formatIssueEntry(issue) {
    return {
      severity: issue.severity,
      sd_id: issue.sd_id || null,
      issue_code: issue.issue_code,
      message: redactSecrets(issue.message),
      first_seen_timestamp: issue.first_seen_timestamp,
      last_seen_timestamp: issue.last_seen_timestamp,
      occurrences_count: issue.occurrences_count,
      correlation_ids: issue.correlation_ids || []
    };
  }

  /**
   * Generate human-readable digest
   * @param {object} json - Redacted JSON summary
   * @returns {string} Human-readable digest text
   */
  _generateDigest(json) {
    const lines = [];

    // Header
    lines.push('═'.repeat(60));
    lines.push('SESSION SUMMARY');
    lines.push('═'.repeat(60));
    lines.push('');

    // Session info
    lines.push(`Session ID: ${json.session_id}`);
    lines.push(`Status: ${json.overall_status}`);
    lines.push(`Duration: ${this._formatDuration(json.duration_ms)}`);
    lines.push('');

    // SD counts
    lines.push('SD PROCESSING');
    lines.push('─'.repeat(40));
    lines.push(`Total SDs: ${json.total_sds}`);

    const statusOrder = ['SUCCESS', 'FAILED', 'SKIPPED', 'CANCELLED', 'IN_PROGRESS', 'NOT_STARTED'];
    for (const status of statusOrder) {
      const count = json.sd_counts_by_status[status];
      if (count > 0) {
        const icon = this._getStatusIcon(status);
        lines.push(`  ${icon} ${status}: ${count}`);
      }
    }
    lines.push('');

    // Issues digest (max 10)
    if (json.issues.length > 0) {
      lines.push('ISSUES');
      lines.push('─'.repeat(40));

      const displayIssues = json.issues.slice(0, MAX_DIGEST_ISSUES);
      for (const issue of displayIssues) {
        const icon = issue.severity === 'ERROR' ? '❌' : '⚠️';
        const sdRef = issue.sd_id ? ` [${issue.sd_id}]` : '';
        lines.push(`  ${icon} ${issue.issue_code}${sdRef}`);
        lines.push(`     ${issue.message.slice(0, 80)}${issue.message.length > 80 ? '...' : ''}`);
      }

      if (json.issues.length > MAX_DIGEST_ISSUES) {
        lines.push(`  ... and ${json.issues.length - MAX_DIGEST_ISSUES} more issues`);
      }
      lines.push('');
    }

    // Footer
    lines.push('─'.repeat(40));
    lines.push(`Generated in ${json.report_generation_time_ms}ms`);
    lines.push(`Schema: v${json.schema_version}`);
    lines.push('═'.repeat(60));

    // Truncate to max lines
    return lines.slice(0, this.maxDigestLines).join('\n');
  }

  /**
   * Format duration for display
   * @param {number} ms - Duration in milliseconds
   * @returns {string} Formatted duration
   */
  _formatDuration(ms) {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    } else if (ms < 3600000) {
      const mins = Math.floor(ms / 60000);
      const secs = Math.floor((ms % 60000) / 1000);
      return `${mins}m ${secs}s`;
    } else {
      const hours = Math.floor(ms / 3600000);
      const mins = Math.floor((ms % 3600000) / 60000);
      return `${hours}h ${mins}m`;
    }
  }

  /**
   * Get status icon for digest
   * @param {string} status - SD status
   * @returns {string} Icon
   */
  _getStatusIcon(status) {
    const icons = {
      SUCCESS: '✅',
      FAILED: '❌',
      SKIPPED: '⏭️',
      CANCELLED: '🚫',
      IN_PROGRESS: '🔄',
      NOT_STARTED: '⏳'
    };
    return icons[status] || '•';
  }

  /**
   * Generate degraded summary when timeout occurs
   * @param {object} snapshot - Collector snapshot
   * @param {number} startTime - Generation start timestamp
   * @returns {{ json: object, digest: string }}
   */
  _generateDegradedSummary(snapshot, startTime) {
    const generationTimeMs = Date.now() - startTime;

    const json = {
      report_type: 'session_summary',
      schema_version: SCHEMA_VERSION,
      session_id: snapshot.session_id || 'unknown',
      orchestrator_version: snapshot.orchestrator_version || 'unknown',
      start_timestamp: snapshot.start_timestamp || new Date().toISOString(),
      end_timestamp: snapshot.end_timestamp || new Date().toISOString(),
      duration_ms: 0,
      overall_status: 'FAILED',
      sd_counts_by_status: { UNKNOWN: snapshot.sds?.length || 0 },
      total_sds: snapshot.sds?.length || 0,
      sds: [], // Omitted in degraded mode
      issues: [
        {
          severity: 'ERROR',
          sd_id: null,
          issue_code: 'SUMMARY_TIMEOUT',
          message: `Summary generation timed out after ${generationTimeMs}ms`,
          first_seen_timestamp: new Date().toISOString(),
          last_seen_timestamp: new Date().toISOString(),
          occurrences_count: 1,
          correlation_ids: []
        }
      ],
      report_generation_time_ms: generationTimeMs,
      degraded: true
    };

    const digest = [
      '═'.repeat(60),
      'SESSION SUMMARY (DEGRADED)',
      '═'.repeat(60),
      '',
      `Session ID: ${json.session_id}`,
      'Status: FAILED',
      '',
      '⚠️  Summary generation timed out',
      `    Partial data available: ${json.total_sds} SDs queued`,
      '',
      '═'.repeat(60)
    ].join('\n');

    return { json, digest };
  }

  /**
   * Generate error summary when validation fails
   * @param {object} snapshot - Collector snapshot
   * @param {Error} err - Error that occurred
   * @param {number} startTime - Generation start timestamp
   * @returns {{ json: object, digest: string }}
   */
  _generateErrorSummary(snapshot, err, startTime) {
    const generationTimeMs = Date.now() - startTime;

    const json = {
      report_type: 'session_summary',
      schema_version: SCHEMA_VERSION,
      session_id: snapshot?.session_id || 'unknown',
      orchestrator_version: snapshot?.orchestrator_version || 'unknown',
      start_timestamp: snapshot?.start_timestamp || new Date().toISOString(),
      end_timestamp: snapshot?.end_timestamp || new Date().toISOString(),
      duration_ms: 0,
      overall_status: 'FAILED',
      sd_counts_by_status: {},
      total_sds: 0,
      sds: [],
      issues: [
        {
          severity: 'ERROR',
          sd_id: null,
          issue_code: err.message.startsWith('SUMMARY_SCHEMA_VALIDATION_FAILED')
            ? 'SUMMARY_SCHEMA_VALIDATION_FAILED'
            : 'SUMMARY_GENERATION_ERROR',
          message: redactSecrets(err.message),
          first_seen_timestamp: new Date().toISOString(),
          last_seen_timestamp: new Date().toISOString(),
          occurrences_count: 1,
          correlation_ids: []
        }
      ],
      report_generation_time_ms: generationTimeMs
    };

    const digest = [
      '═'.repeat(60),
      'SESSION SUMMARY (ERROR)',
      '═'.repeat(60),
      '',
      `Session ID: ${json.session_id}`,
      'Status: FAILED',
      '',
      `❌ ${err.message.startsWith('SUMMARY_SCHEMA_VALIDATION_FAILED') ? 'Schema validation failed' : 'Generation error'}`,
      `   ${redactSecrets(err.message).slice(0, 80)}`,
      '',
      '═'.repeat(60)
    ].join('\n');

    return { json, digest };
  }
}

/**
 * Create a new Summary Generator
 * @param {object} options - Configuration options
 * @returns {SummaryGenerator}
 */
export function createGenerator(options = {}) {
  return new SummaryGenerator(options);
}

export default {
  SummaryGenerator,
  createGenerator,
  SCHEMA_VERSION,
  COMPILATION_TIMEOUT_MS,
  MAX_DIGEST_LINES
};
