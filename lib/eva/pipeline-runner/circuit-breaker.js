/**
 * Circuit Breaker for Synthetic Pipeline
 *
 * Enforces safety limits:
 * - Daily LLM cost cap (API call count proxy)
 * - Failure rate threshold (>20% → pause)
 * - Organic venture priority guard
 *
 * Part of SD-AUTOMATED-PIPELINE-RUNNER-FOR-ORCH-001-A
 */

const DEFAULT_CONFIG = {
  dailyCostCap: 500,        // max API calls per day
  failureThreshold: 0.20,   // 20% failure rate triggers pause
  windowSize: 20,            // rolling window for failure rate
  organicQueueDepthMax: 10,  // pause synthetic if organic queue > this
};

export class CircuitBreaker {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = 'closed'; // closed = healthy, open = tripped
    this.dailyCalls = 0;
    this.dailyResetAt = this._nextMidnight();
    this.results = []; // rolling window of { success: boolean, timestamp }
  }

  /** Record a successful pipeline execution. */
  recordSuccess() {
    this._maybeResetDaily();
    this.dailyCalls++;
    this.results.push({ success: true, timestamp: Date.now() });
    this._trimWindow();
    this._evaluate();
  }

  /** Record a failed pipeline execution. */
  recordFailure(error) {
    this._maybeResetDaily();
    this.dailyCalls++;
    this.results.push({ success: false, timestamp: Date.now(), error: error?.message });
    this._trimWindow();
    this._evaluate();
  }

  /** Check if circuit is open (should stop processing). */
  isOpen() {
    this._maybeResetDaily();
    return this.state === 'open';
  }

  /** Get current status for monitoring. */
  status() {
    this._maybeResetDaily();
    const failures = this.results.filter(r => !r.success).length;
    const total = this.results.length;
    return {
      state: this.state,
      dailyCalls: this.dailyCalls,
      dailyCostCap: this.config.dailyCostCap,
      failureRate: total > 0 ? failures / total : 0,
      failureThreshold: this.config.failureThreshold,
      windowSize: this.results.length,
      reason: this._tripReason(),
    };
  }

  /** Manually reset the circuit breaker. */
  reset() {
    this.state = 'closed';
    this.results = [];
  }

  /** Check organic venture queue depth against threshold. */
  async checkOrganicPriority(deps) {
    if (!deps?.supabase) return false;
    try {
      const { count } = await deps.supabase
        .from('eva_scheduler_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .is('is_synthetic', null); // organic ventures don't have is_synthetic
      return (count || 0) > this.config.organicQueueDepthMax;
    } catch {
      return false; // fail-open: don't block on check failure
    }
  }

  // --- Internal ---

  _evaluate() {
    // Check daily cost cap
    if (this.dailyCalls >= this.config.dailyCostCap) {
      this.state = 'open';
      return;
    }
    // Check failure rate (only after minimum window)
    if (this.results.length >= 5) {
      const failures = this.results.filter(r => !r.success).length;
      if (failures / this.results.length > this.config.failureThreshold) {
        this.state = 'open';
        return;
      }
    }
    this.state = 'closed';
  }

  _tripReason() {
    if (this.state !== 'open') return null;
    if (this.dailyCalls >= this.config.dailyCostCap) return 'daily_cost_cap_exceeded';
    const failures = this.results.filter(r => !r.success).length;
    if (this.results.length >= 5 && failures / this.results.length > this.config.failureThreshold) {
      return 'failure_rate_exceeded';
    }
    return 'unknown';
  }

  _trimWindow() {
    while (this.results.length > this.config.windowSize) {
      this.results.shift();
    }
  }

  _maybeResetDaily() {
    if (Date.now() >= this.dailyResetAt) {
      this.dailyCalls = 0;
      this.dailyResetAt = this._nextMidnight();
    }
  }

  _nextMidnight() {
    const d = new Date();
    d.setHours(24, 0, 0, 0);
    return d.getTime();
  }
}
