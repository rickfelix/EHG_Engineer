/**
 * Pipeline Scheduler
 *
 * Cron-driven batch orchestration for synthetic venture generation.
 * Coordinates SyntheticVentureFactory, PipelineExecutor, CircuitBreaker,
 * DiversityValidator, and DeadLetterQueue.
 *
 * Part of SD-AUTOMATED-PIPELINE-RUNNER-FOR-ORCH-001-A/B
 */

const DEFAULT_CONFIG = {
  intervalMs: 30 * 60 * 1000, // 30 minutes
  batchSize: 4,
  maxDailyVentures: 144,
};

export class PipelineScheduler {
  /**
   * @param {Object} config - Scheduler configuration
   * @param {number} [config.intervalMs=1800000] - Interval between batches (ms)
   * @param {number} [config.batchSize=4] - Ventures per batch
   * @param {number} [config.maxDailyVentures=144] - Daily venture cap
   * @param {Object} deps - Injected dependencies
   * @param {Object} deps.factory - SyntheticVentureFactory instance
   * @param {Object} deps.executor - PipelineExecutor instance
   * @param {Object} deps.circuitBreaker - CircuitBreaker instance
   * @param {Object} [deps.logger] - Logger instance
   */
  constructor(config = {}, deps = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.factory = deps.factory;
    this.executor = deps.executor;
    this.circuitBreaker = deps.circuitBreaker;
    this.diversityValidator = deps.diversityValidator || null;
    this.deadLetterQueue = deps.deadLetterQueue || null;
    this.logger = deps.logger || console;

    this._timer = null;
    this._running = false;
    this._dailyCount = 0;
    this._dailyResetAt = this._nextMidnight();
    this._metrics = {
      totalBatches: 0,
      totalVentures: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      lastBatchAt: null,
      avgBatchDurationMs: 0,
    };
  }

  /**
   * Start the scheduler. Runs first batch immediately, then at interval.
   */
  start() {
    if (this._running) {
      this.logger.warn('[PipelineScheduler] Already running');
      return;
    }

    this._running = true;
    this.logger.log(`[PipelineScheduler] Started — interval=${this.config.intervalMs}ms, batchSize=${this.config.batchSize}`);

    // Run first batch immediately
    this._tick();

    // Schedule subsequent batches
    this._timer = setInterval(() => this._tick(), this.config.intervalMs);
  }

  /**
   * Stop the scheduler gracefully.
   */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._running = false;
    this.logger.log('[PipelineScheduler] Stopped');
  }

  /**
   * Run a single batch manually (useful for CLI and testing).
   * @param {Object} [options] - Override options
   * @param {number} [options.batchSize] - Override batch size
   * @param {boolean} [options.dryRun] - Generate but don't execute
   * @returns {Promise<Object>} Batch result
   */
  async runBatch(options = {}) {
    const batchSize = options.batchSize || this.config.batchSize;
    return this._executeBatch(batchSize, options);
  }

  /**
   * Get current scheduler status and metrics.
   */
  status() {
    this._maybeResetDaily();
    return {
      running: this._running,
      config: this.config,
      dailyCount: this._dailyCount,
      dailyRemaining: Math.max(0, this.config.maxDailyVentures - this._dailyCount),
      circuitBreaker: this.circuitBreaker?.status() || null,
      deadLetterQueue: this.deadLetterQueue?.summary() || null,
      metrics: { ...this._metrics },
    };
  }

  // --- Internal ---

  async _tick() {
    this._maybeResetDaily();

    // Check circuit breaker
    if (this.circuitBreaker?.isOpen()) {
      this.logger.warn('[PipelineScheduler] Circuit breaker OPEN — skipping batch');
      return;
    }

    // Check daily cap
    if (this._dailyCount >= this.config.maxDailyVentures) {
      this.logger.warn('[PipelineScheduler] Daily venture cap reached — skipping batch');
      return;
    }

    // Check organic venture priority
    if (this.circuitBreaker) {
      const organicBusy = await this.circuitBreaker.checkOrganicPriority({
        supabase: this.executor?.supabase,
      });
      if (organicBusy) {
        this.logger.warn('[PipelineScheduler] Organic queue depth exceeded — pausing synthetic');
        return;
      }
    }

    await this._executeBatch(this.config.batchSize);
  }

  async _executeBatch(batchSize, options = {}) {
    const batchStart = Date.now();
    this.logger.log(`[PipelineScheduler] Starting batch of ${batchSize} ventures...`);

    // Generate ventures
    const { ventures, metadata } = this.factory.createBatch(batchSize);

    // Run DiversityValidator if available (enhanced validation beyond factory's built-in check)
    let diversityResult = null;
    if (this.diversityValidator) {
      diversityResult = this.diversityValidator.validate(ventures);
      if (!diversityResult.valid) {
        this.logger.warn(`[PipelineScheduler] DiversityValidator failed: entropy=${diversityResult.normalizedEntropy.toFixed(3)}`);
        if (diversityResult.correlationAlerts.length > 0) {
          this.logger.warn(`[PipelineScheduler] Correlation alerts: ${diversityResult.correlationAlerts.map(a => a.archetype).join(', ')}`);
        }
      }
    } else if (!metadata.diversityPass) {
      this.logger.warn(`[PipelineScheduler] Diversity check failed: entropy=${metadata.normalizedEntropy.toFixed(3)} (min=${this.factory?.minEntropy || 0.6})`);
    }

    if (options.dryRun) {
      this.logger.log('[PipelineScheduler] DRY RUN — skipping execution');
      return {
        dryRun: true,
        ventures: ventures.map(v => ({ name: v.name, archetype: v.archetype })),
        metadata,
        diversityValidation: diversityResult,
      };
    }

    // Execute each venture through the pipeline
    const results = [];
    for (const venture of ventures) {
      const result = await this.executor.execute(venture);
      results.push(result);

      // Update circuit breaker
      if (this.circuitBreaker) {
        if (result.success) {
          this.circuitBreaker.recordSuccess();
        } else {
          this.circuitBreaker.recordFailure(new Error(result.error));

          // Enqueue failed ventures in the dead-letter queue
          if (this.deadLetterQueue) {
            this.deadLetterQueue.enqueue({
              ventureData: venture,
              error: result.error,
              batchId: batchStart,
            });
          }
        }
      }

      // Check if circuit breaker tripped mid-batch
      if (this.circuitBreaker?.isOpen()) {
        this.logger.warn('[PipelineScheduler] Circuit breaker tripped mid-batch — stopping');
        break;
      }
    }

    // Process dead-letter queue retries
    if (this.deadLetterQueue && this.deadLetterQueue.depth() > 0) {
      this.logger.log(`[PipelineScheduler] Processing ${this.deadLetterQueue.depth()} dead-letter retries...`);
      const retryResults = await this.deadLetterQueue.processRetries(async (entry) => {
        return this.executor.execute(entry.ventureData);
      });
      if (retryResults.resolved > 0) {
        this.logger.log(`[PipelineScheduler] Dead-letter retries: ${retryResults.resolved} resolved`);
      }
    }

    const successes = results.filter(r => r.success).length;
    const failures = results.length - successes;
    const batchDuration = Date.now() - batchStart;

    // Update metrics
    this._dailyCount += results.length;
    this._metrics.totalBatches++;
    this._metrics.totalVentures += results.length;
    this._metrics.totalSuccesses += successes;
    this._metrics.totalFailures += failures;
    this._metrics.lastBatchAt = new Date().toISOString();
    this._metrics.avgBatchDurationMs = Math.round(
      ((this._metrics.avgBatchDurationMs * (this._metrics.totalBatches - 1)) + batchDuration) / this._metrics.totalBatches
    );

    this.logger.log(`[PipelineScheduler] Batch complete: ${successes}/${results.length} succeeded in ${batchDuration}ms`);

    return {
      batchSize: results.length,
      successes,
      failures,
      durationMs: batchDuration,
      successRate: results.length > 0 ? successes / results.length : 0,
      results,
      diversity: metadata,
      diversityValidation: diversityResult,
      deadLetterDepth: this.deadLetterQueue?.depth() || 0,
    };
  }

  _maybeResetDaily() {
    if (Date.now() >= this._dailyResetAt) {
      this._dailyCount = 0;
      this._dailyResetAt = this._nextMidnight();
    }
  }

  _nextMidnight() {
    const d = new Date();
    d.setHours(24, 0, 0, 0);
    return d.getTime();
  }
}
