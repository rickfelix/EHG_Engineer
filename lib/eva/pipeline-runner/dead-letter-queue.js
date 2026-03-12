/**
 * Dead Letter Queue
 *
 * Captures failed pipeline runs with structured error categorization
 * and retries them with exponential backoff.
 *
 * Part of SD-AUTOMATED-PIPELINE-RUNNER-FOR-ORCH-001-B
 */

const ERROR_CATEGORIES = ['LLM_ERROR', 'DB_ERROR', 'GATE_ERROR', 'TIMEOUT', 'UNKNOWN'];

const DEFAULT_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxConcurrentRetries: 5,
};

export class DeadLetterQueue {
  /**
   * @param {Object} [config]
   * @param {number} [config.maxRetries=3] - Maximum retry attempts
   * @param {number} [config.baseDelayMs=1000] - Base delay for exponential backoff
   * @param {number} [config.maxConcurrentRetries=5] - Max parallel retries
   * @param {Object} [deps]
   * @param {Object} [deps.logger] - Logger instance
   */
  constructor(config = {}, deps = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = deps.logger || console;
    this._entries = [];
    this._retryInProgress = 0;
  }

  /**
   * Add a failed run to the dead-letter queue.
   *
   * @param {Object} entry
   * @param {Object} entry.ventureData - The venture that failed
   * @param {Error|string} entry.error - The error that occurred
   * @param {string} [entry.category] - Error category (auto-detected if not provided)
   * @returns {Object} The queued entry with metadata
   */
  enqueue(entry) {
    const category = entry.category || this._categorizeError(entry.error);
    const queueEntry = {
      id: `DLQ-${Date.now()}-${this._entries.length}`,
      ventureData: entry.ventureData,
      error: entry.error instanceof Error ? entry.error.message : String(entry.error),
      category,
      attemptCount: 0,
      maxRetries: this.config.maxRetries,
      status: 'pending',
      enqueuedAt: new Date().toISOString(),
      lastAttemptAt: null,
      nextRetryAt: new Date(Date.now() + this.config.baseDelayMs).toISOString(),
    };

    this._entries.push(queueEntry);
    this.logger.log(`[DeadLetterQueue] Enqueued ${queueEntry.id} (category=${category})`);
    return queueEntry;
  }

  /**
   * Process pending retries with exponential backoff.
   *
   * @param {Function} executeFn - Async function to retry: (ventureData) => result
   * @returns {Promise<Object>} Retry results
   */
  async processRetries(executeFn) {
    const now = Date.now();
    const ready = this._entries.filter(
      e => e.status === 'pending' && new Date(e.nextRetryAt).getTime() <= now
    );

    if (ready.length === 0) return { processed: 0, succeeded: 0, permanentlyFailed: 0 };

    let succeeded = 0;
    let permanentlyFailed = 0;

    for (const entry of ready) {
      if (this._retryInProgress >= this.config.maxConcurrentRetries) break;

      this._retryInProgress++;
      entry.attemptCount++;
      entry.lastAttemptAt = new Date().toISOString();

      try {
        const result = await executeFn(entry.ventureData);
        if (result.success) {
          entry.status = 'resolved';
          succeeded++;
          this.logger.log(`[DeadLetterQueue] ${entry.id} resolved on attempt ${entry.attemptCount}`);
        } else {
          this._handleRetryFailure(entry, result.error || 'Unknown error');
          if (entry.status === 'permanently_failed') permanentlyFailed++;
        }
      } catch (err) {
        this._handleRetryFailure(entry, err.message || 'Retry exception');
        if (entry.status === 'permanently_failed') permanentlyFailed++;
      } finally {
        this._retryInProgress--;
      }
    }

    return { processed: ready.length, succeeded, permanentlyFailed };
  }

  /**
   * Get all entries, optionally filtered by status.
   * @param {string} [status] - Filter by status
   * @returns {Object[]}
   */
  entries(status) {
    if (status) return this._entries.filter(e => e.status === status);
    return [...this._entries];
  }

  /**
   * Get queue depth (pending entries).
   * @returns {number}
   */
  depth() {
    return this._entries.filter(e => e.status === 'pending').length;
  }

  /**
   * Get queue summary.
   */
  summary() {
    const byStatus = {};
    const byCategory = {};
    for (const entry of this._entries) {
      byStatus[entry.status] = (byStatus[entry.status] || 0) + 1;
      byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;
    }
    return {
      total: this._entries.length,
      pending: byStatus.pending || 0,
      resolved: byStatus.resolved || 0,
      permanently_failed: byStatus.permanently_failed || 0,
      byCategory,
    };
  }

  /**
   * Clear resolved and permanently failed entries.
   * @returns {number} Number of entries cleared
   */
  clear() {
    const before = this._entries.length;
    this._entries = this._entries.filter(e => e.status === 'pending');
    return before - this._entries.length;
  }

  // --- Internal ---

  _handleRetryFailure(entry, errorMsg) {
    if (entry.attemptCount >= entry.maxRetries) {
      entry.status = 'permanently_failed';
      this.logger.warn(`[DeadLetterQueue] ${entry.id} permanently failed after ${entry.attemptCount} attempts`);
    } else {
      const delay = this.config.baseDelayMs * Math.pow(2, entry.attemptCount - 1);
      entry.nextRetryAt = new Date(Date.now() + delay).toISOString();
      entry.error = errorMsg;
      this.logger.log(`[DeadLetterQueue] ${entry.id} retry ${entry.attemptCount}/${entry.maxRetries} — next in ${delay}ms`);
    }
  }

  _categorizeError(error) {
    const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();

    if (msg.includes('llm') || msg.includes('model') || msg.includes('token') || msg.includes('rate limit') || msg.includes('api key')) {
      return 'LLM_ERROR';
    }
    if (msg.includes('database') || msg.includes('supabase') || msg.includes('postgres') || msg.includes('constraint') || msg.includes('insert') || msg.includes('query')) {
      return 'DB_ERROR';
    }
    if (msg.includes('gate') || msg.includes('stage') || msg.includes('evaluation') || msg.includes('review')) {
      return 'GATE_ERROR';
    }
    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('ETIMEDOUT') || msg.includes('ECONNRESET')) {
      return 'TIMEOUT';
    }
    return 'UNKNOWN';
  }
}
