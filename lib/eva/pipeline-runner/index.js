/**
 * Pipeline Runner — Public API
 *
 * Provides start/stop/runBatch/status interface for the synthetic venture pipeline.
 *
 * Part of SD-AUTOMATED-PIPELINE-RUNNER-FOR-ORCH-001-A
 */

import { SyntheticVentureFactory } from './synthetic-venture-factory.js';
import { PipelineExecutor } from './pipeline-executor.js';
import { PipelineScheduler } from './pipeline-scheduler.js';
import { CircuitBreaker } from './circuit-breaker.js';

/**
 * Create and configure a pipeline runner instance.
 *
 * @param {Object} config - Configuration
 * @param {number} [config.intervalMs=1800000] - Batch interval in ms
 * @param {number} [config.batchSize=4] - Ventures per batch
 * @param {number} [config.maxDailyVentures=144] - Daily cap
 * @param {number} [config.dailyCostCap=500] - Circuit breaker API call cap
 * @param {number} [config.failureThreshold=0.20] - Circuit breaker failure rate threshold
 * @param {Object} deps - Dependencies
 * @param {Object} deps.supabase - Supabase client
 * @param {Function} [deps.executeStageZero] - Stage 0 executor
 * @param {Function} [deps.recordGateSignal] - Gate signal recorder
 * @param {Object} [deps.logger] - Logger
 * @returns {{ scheduler: PipelineScheduler, start: Function, stop: Function, runBatch: Function, status: Function }}
 */
export function createPipelineRunner(config = {}, deps = {}) {
  const logger = deps.logger || console;

  const circuitBreaker = new CircuitBreaker({
    dailyCostCap: config.dailyCostCap,
    failureThreshold: config.failureThreshold,
  });

  const factory = new SyntheticVentureFactory({
    minEntropy: config.minEntropy,
  });

  const executor = new PipelineExecutor({
    supabase: deps.supabase,
    logger,
    executeStageZero: deps.executeStageZero,
    recordGateSignal: deps.recordGateSignal,
  });

  const scheduler = new PipelineScheduler(
    {
      intervalMs: config.intervalMs,
      batchSize: config.batchSize,
      maxDailyVentures: config.maxDailyVentures,
    },
    {
      factory,
      executor,
      circuitBreaker,
      logger,
    }
  );

  return {
    scheduler,
    circuitBreaker,
    factory,
    executor,

    /** Start scheduled batch execution. */
    start() {
      scheduler.start();
    },

    /** Stop scheduled execution. */
    stop() {
      scheduler.stop();
    },

    /**
     * Run a single batch manually.
     * @param {Object} [options] - Override options
     */
    async runBatch(options) {
      return scheduler.runBatch(options);
    },

    /** Get pipeline status and metrics. */
    status() {
      return scheduler.status();
    },
  };
}

export { SyntheticVentureFactory } from './synthetic-venture-factory.js';
export { PipelineExecutor } from './pipeline-executor.js';
export { PipelineScheduler } from './pipeline-scheduler.js';
export { CircuitBreaker } from './circuit-breaker.js';
