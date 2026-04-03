/**
 * Drain Error Handler - SD-LEO-INFRA-PARALLEL-AGENT-QUEUE-001
 *
 * Circuit breaker for the drain orchestrator.
 * Tracks failures per SD and globally. Trips when:
 * - Same SD fails 2+ times
 * - 3+ total failures in 5-minute window
 */

const CIRCUIT_BREAKER_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_FAILURES_PER_SD = 2;
const MAX_TOTAL_FAILURES = 3;

export class DrainErrorHandler {
  constructor() {
    /** @type {Map<string, number>} sdKey → failure count */
    this.sdFailures = new Map();
    /** @type {Array<{ts: number, sdKey: string, reason: string}>} */
    this.recentFailures = [];
    this.tripped = false;
    this.tripReason = null;
  }

  /**
   * Record a failure for a specific SD.
   * @param {string} sdKey
   * @param {string} reason
   * @returns {{tripped: boolean, reason?: string}}
   */
  recordFailure(sdKey, reason) {
    const now = Date.now();

    // Track per-SD
    const count = (this.sdFailures.get(sdKey) || 0) + 1;
    this.sdFailures.set(sdKey, count);

    // Track in window
    this.recentFailures.push({ ts: now, sdKey, reason });
    this._pruneWindow(now);

    // Check per-SD threshold
    if (count >= MAX_FAILURES_PER_SD) {
      this.tripped = true;
      this.tripReason = `SD ${sdKey} failed ${count} times: ${reason}`;
      return { tripped: true, reason: this.tripReason };
    }

    // Check global threshold
    if (this.recentFailures.length >= MAX_TOTAL_FAILURES) {
      this.tripped = true;
      this.tripReason = `${this.recentFailures.length} failures in ${CIRCUIT_BREAKER_WINDOW_MS / 60000}min window`;
      return { tripped: true, reason: this.tripReason };
    }

    return { tripped: false };
  }

  /**
   * Check if an SD should be skipped (already failed too many times).
   */
  shouldSkipSD(sdKey) {
    return (this.sdFailures.get(sdKey) || 0) >= MAX_FAILURES_PER_SD;
  }

  /**
   * Check if the circuit breaker is tripped.
   */
  isTripped() {
    return this.tripped;
  }

  /**
   * Get the trip reason.
   */
  getTripReason() {
    return this.tripReason;
  }

  /**
   * Reset the circuit breaker (manual recovery).
   */
  reset() {
    this.sdFailures.clear();
    this.recentFailures = [];
    this.tripped = false;
    this.tripReason = null;
  }

  /**
   * Get summary of all failures.
   */
  getSummary() {
    return {
      tripped: this.tripped,
      tripReason: this.tripReason,
      sdFailureCounts: Object.fromEntries(this.sdFailures),
      recentFailureCount: this.recentFailures.length,
      failedSDs: [...this.sdFailures.entries()]
        .filter(([, count]) => count >= MAX_FAILURES_PER_SD)
        .map(([key]) => key)
    };
  }

  /** Remove failures outside the window */
  _pruneWindow(now) {
    const cutoff = now - CIRCUIT_BREAKER_WINDOW_MS;
    this.recentFailures = this.recentFailures.filter(f => f.ts >= cutoff);
  }
}
