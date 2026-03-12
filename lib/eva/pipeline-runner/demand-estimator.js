/**
 * Demand Estimator
 *
 * Monitors experiment sample counts in experiment_assignments and emits
 * burst signals when samples fall below a configurable threshold.
 * Enables demand-driven venture generation for the pipeline.
 *
 * Part of SD-AUTOMATED-PIPELINE-RUNNER-FOR-ORCH-001-C
 */

import { EventEmitter } from 'events';

const DEFAULT_CONFIG = {
  pollIntervalMs: 60_000,         // Check every 60 seconds
  minSamplesPerExperiment: 20,    // Trigger burst when below this
  burstBatchSize: 12,             // Batch size during burst
  maxConcurrentBursts: 3,         // Max experiments triggering bursts simultaneously
};

export class DemandEstimator extends EventEmitter {
  /**
   * @param {Object} [config]
   * @param {number} [config.pollIntervalMs=60000] - Polling interval
   * @param {number} [config.minSamplesPerExperiment=20] - Sample threshold for burst
   * @param {number} [config.burstBatchSize=12] - Batch size during burst
   * @param {number} [config.maxConcurrentBursts=3] - Max concurrent burst experiments
   * @param {Object} [deps]
   * @param {Object} [deps.supabase] - Supabase client
   * @param {Object} [deps.logger] - Logger instance
   */
  constructor(config = {}, deps = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.supabase = deps.supabase;
    this.logger = deps.logger || console;
    this._timer = null;
    this._running = false;
    this._activeBursts = new Map(); // experimentId -> { target, current }
  }

  /**
   * Start polling for experiment demand.
   */
  start() {
    if (this._running) return;
    this._running = true;
    this.logger.log(`[DemandEstimator] Started — poll every ${this.config.pollIntervalMs}ms`);
    this._poll();
    this._timer = setInterval(() => this._poll(), this.config.pollIntervalMs);
  }

  /**
   * Stop polling.
   */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._running = false;
    this.logger.log('[DemandEstimator] Stopped');
  }

  /**
   * Check demand for a single experiment (useful for manual triggering).
   * @param {string} experimentId
   * @returns {Promise<Object>} { experimentId, sampleCount, target, needsBurst }
   */
  async checkExperiment(experimentId) {
    const sampleCount = await this._countSamples(experimentId);
    const target = this.config.minSamplesPerExperiment;
    return {
      experimentId,
      sampleCount,
      target,
      needsBurst: sampleCount < target,
      deficit: Math.max(0, target - sampleCount),
    };
  }

  /**
   * Get current burst status.
   * @returns {Object}
   */
  status() {
    return {
      running: this._running,
      activeBursts: this._activeBursts.size,
      burstDetails: Object.fromEntries(this._activeBursts),
      config: this.config,
    };
  }

  // --- Internal ---

  async _poll() {
    if (!this.supabase) return;

    try {
      const activeExperiments = await this._getActiveExperiments();

      if (activeExperiments.length === 0) {
        // Clear any stale bursts
        if (this._activeBursts.size > 0) {
          this._activeBursts.clear();
          this.emit('burst-end', { reason: 'no_active_experiments' });
        }
        return;
      }

      for (const exp of activeExperiments) {
        if (this._activeBursts.size >= this.config.maxConcurrentBursts) break;

        const sampleCount = await this._countSamples(exp.id);
        const target = this.config.minSamplesPerExperiment;

        if (sampleCount < target) {
          const deficit = target - sampleCount;

          if (!this._activeBursts.has(exp.id)) {
            this._activeBursts.set(exp.id, { target, current: sampleCount, deficit });
            this.logger.log(
              `[DemandEstimator] Burst triggered for experiment ${exp.id}: ` +
              `${sampleCount}/${target} samples (deficit: ${deficit})`
            );
            this.emit('burst-needed', {
              experimentId: exp.id,
              experimentName: exp.name,
              sampleCount,
              target,
              deficit,
              burstBatchSize: this.config.burstBatchSize,
            });
          }
        } else {
          // Demand satisfied — end burst for this experiment
          if (this._activeBursts.has(exp.id)) {
            this._activeBursts.delete(exp.id);
            this.logger.log(
              `[DemandEstimator] Demand satisfied for experiment ${exp.id}: ${sampleCount}/${target}`
            );
            this.emit('burst-satisfied', { experimentId: exp.id, sampleCount });
          }
        }
      }

      // Check if all bursts are satisfied
      if (this._activeBursts.size === 0) {
        this.emit('all-satisfied');
      }
    } catch (err) {
      this.logger.warn(`[DemandEstimator] Poll error: ${err.message}`);
    }
  }

  async _getActiveExperiments() {
    const { data, error } = await this.supabase
      .from('experiments')
      .select('id, name, status')
      .eq('status', 'active');

    if (error) {
      this.logger.warn(`[DemandEstimator] Failed to query experiments: ${error.message}`);
      return [];
    }

    return data || [];
  }

  async _countSamples(experimentId) {
    const { count, error } = await this.supabase
      .from('experiment_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('experiment_id', experimentId);

    if (error) {
      this.logger.warn(`[DemandEstimator] Failed to count samples: ${error.message}`);
      return 0;
    }

    return count || 0;
  }
}
