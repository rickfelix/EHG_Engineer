/**
 * BaseWorker — Abstract base class for background workers.
 * Provides lifecycle management, error handling, health checks, and logging.
 *
 * SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-I
 */

export class BaseWorker {
  /**
   * @param {string} name - Human-readable worker name
   * @param {object} opts
   * @param {number} [opts.intervalMs=60000] - Run interval in milliseconds
   * @param {number} [opts.maxRetries=3] - Max consecutive failures before circuit-break
   * @param {import('@supabase/supabase-js').SupabaseClient} [opts.supabase] - Supabase client
   */
  constructor(name, opts = {}) {
    this.name = name;
    this.intervalMs = opts.intervalMs ?? 60_000;
    this.maxRetries = opts.maxRetries ?? 3;
    this.supabase = opts.supabase ?? null;

    this._timer = null;
    this._running = false;
    this._consecutiveFailures = 0;
    this._lastRun = null;
    this._lastError = null;
    this._totalRuns = 0;
    this._totalErrors = 0;
  }

  /** Override in subclass: the actual work to perform each tick */
  async execute() {
    throw new Error(`${this.name}: execute() not implemented`);
  }

  /** Start the worker on its interval */
  start() {
    if (this._running) return;
    this._running = true;
    this._log('started', { intervalMs: this.intervalMs });

    // Run immediately, then on interval
    this._tick();
    this._timer = setInterval(() => this._tick(), this.intervalMs);
  }

  /** Stop the worker */
  stop() {
    if (!this._running) return;
    this._running = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._log('stopped');
  }

  /** Health check — returns worker status */
  health() {
    return {
      name: this.name,
      running: this._running,
      lastRun: this._lastRun,
      lastError: this._lastError?.message ?? null,
      consecutiveFailures: this._consecutiveFailures,
      totalRuns: this._totalRuns,
      totalErrors: this._totalErrors,
      circuitBroken: this._consecutiveFailures >= this.maxRetries,
    };
  }

  /** Internal: run one tick with error handling and circuit breaking */
  async _tick() {
    if (this._consecutiveFailures >= this.maxRetries) {
      this._log('circuit-broken', {
        failures: this._consecutiveFailures,
        lastError: this._lastError?.message,
      });
      return;
    }

    try {
      this._totalRuns++;
      await this.execute();
      this._lastRun = new Date();
      this._consecutiveFailures = 0;
    } catch (err) {
      this._totalErrors++;
      this._consecutiveFailures++;
      this._lastError = err;
      this._log('error', {
        message: err.message,
        consecutiveFailures: this._consecutiveFailures,
      });
    }
  }

  /** Reset circuit breaker to allow retries */
  resetCircuitBreaker() {
    this._consecutiveFailures = 0;
    this._lastError = null;
    this._log('circuit-reset');
  }

  _log(event, data = {}) {
    const entry = {
      worker: this.name,
      event,
      timestamp: new Date().toISOString(),
      ...data,
    };
    // eslint-disable-next-line no-console
    console.log(`[worker:${this.name}]`, JSON.stringify(entry));
  }
}
