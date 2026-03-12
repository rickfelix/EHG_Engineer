/**
 * Pipeline Scheduler
 *
 * Cron-driven batch orchestration for synthetic venture generation.
 * Coordinates SyntheticVentureFactory, PipelineExecutor, CircuitBreaker,
 * DiversityValidator, DeadLetterQueue, and DemandEstimator.
 *
 * Supports hybrid scheduling: baseline mode (48/day) with burst mode (up to 144/day)
 * triggered by DemandEstimator demand signals.
 *
 * Part of SD-AUTOMATED-PIPELINE-RUNNER-FOR-ORCH-001-A/B/C
 */

const DEFAULT_CONFIG = {
  intervalMs: 30 * 60 * 1000, // 30 minutes
  batchSize: 4,
  maxDailyVentures: 144,
  burstBatchSize: 12,         // Batch size during burst mode
  baselineDailyTarget: 48,    // Baseline target (12 batches × 4)
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
    this.demandEstimator = deps.demandEstimator || null;
    this.logger = deps.logger || console;

    this._timer = null;
    this._running = false;
    this._burstMode = false;
    this._burstExperimentId = null;
    this._dailyCount = 0;
    this._dailyResetAt = this._nextMidnight();
    this._metrics = {
      totalBatches: 0,
      totalVentures: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      lastBatchAt: null,
      avgBatchDurationMs: 0,
      burstBatches: 0,
      baselineBatches: 0,
    };

    // Wire up DemandEstimator events
    if (this.demandEstimator) {
      this.demandEstimator.on('burst-needed', (event) => this._onBurstNeeded(event));
      this.demandEstimator.on('burst-satisfied', (event) => this._onBurstSatisfied(event));
      this.demandEstimator.on('all-satisfied', () => this._onAllSatisfied());
    }
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
  /**
   * Activate burst mode for a specific experiment.
   * @param {string} experimentId
   * @param {number} [batchSize] - Override burst batch size
   */
  activateBurst(experimentId, batchSize) {
    this._burstMode = true;
    this._burstExperimentId = experimentId;
    if (batchSize) this.config.burstBatchSize = batchSize;
    this.logger.log(
      `[PipelineScheduler] BURST MODE activated for experiment ${experimentId} ` +
      `(batchSize=${this.config.burstBatchSize})`
    );
  }

  /**
   * Deactivate burst mode, return to baseline scheduling.
   */
  deactivateBurst() {
    const wasActive = this._burstMode;
    this._burstMode = false;
    this._burstExperimentId = null;
    if (wasActive) {
      this.logger.log('[PipelineScheduler] BURST MODE deactivated — returning to baseline');
    }
  }

  status() {
    this._maybeResetDaily();
    return {
      running: this._running,
      burstMode: this._burstMode,
      burstExperimentId: this._burstExperimentId,
      config: this.config,
      dailyCount: this._dailyCount,
      dailyRemaining: Math.max(0, this.config.maxDailyVentures - this._dailyCount),
      circuitBreaker: this.circuitBreaker?.status() || null,
      deadLetterQueue: this.deadLetterQueue?.summary() || null,
      demandEstimator: this.demandEstimator?.status() || null,
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

    // Use burst batch size if burst mode is active
    const batchSize = this._burstMode
      ? this.config.burstBatchSize
      : this.config.batchSize;

    await this._executeBatch(batchSize, {
      experimentId: this._burstExperimentId,
    });
  }

  async _executeBatch(batchSize, options = {}) {
    const batchStart = Date.now();
    const mode = this._burstMode ? 'BURST' : 'BASELINE';
    this.logger.log(`[PipelineScheduler] Starting ${mode} batch of ${batchSize} ventures...`);

    // Generate ventures, passing experimentId for tagging
    const { ventures, metadata } = this.factory.createBatch(batchSize, {
      experimentId: options.experimentId,
    });

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
    if (this._burstMode) {
      this._metrics.burstBatches++;
    } else {
      this._metrics.baselineBatches++;
    }

    this.logger.log(`[PipelineScheduler] ${mode} batch complete: ${successes}/${results.length} succeeded in ${batchDuration}ms`);

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
      mode,
      experimentId: options.experimentId || null,
    };
  }

  // --- DemandEstimator Event Handlers ---

  _onBurstNeeded(event) {
    this.activateBurst(event.experimentId, event.burstBatchSize);
  }

  _onBurstSatisfied(event) {
    if (this._burstExperimentId === event.experimentId) {
      this.deactivateBurst();
    }
  }

  _onAllSatisfied() {
    this.deactivateBurst();
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
