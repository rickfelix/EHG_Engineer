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
import { DiversityValidator } from './diversity-validator.js';
import { DeadLetterQueue } from './dead-letter-queue.js';
import { DemandEstimator } from './demand-estimator.js';

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

  const diversityValidator = new DiversityValidator({
    minNormalizedEntropy: config.minEntropy,
    correlationThreshold: config.correlationThreshold,
  });

  const deadLetterQueue = new DeadLetterQueue({
    maxRetries: config.maxRetries,
    baseDelayMs: config.baseDelayMs,
  }, { logger });

  const demandEstimator = new DemandEstimator({
    pollIntervalMs: config.demandPollIntervalMs,
    minSamplesPerExperiment: config.minSamplesPerExperiment,
    burstBatchSize: config.burstBatchSize,
  }, { supabase: deps.supabase, logger });

  const scheduler = new PipelineScheduler(
    {
      intervalMs: config.intervalMs,
      batchSize: config.batchSize,
      maxDailyVentures: config.maxDailyVentures,
      burstBatchSize: config.burstBatchSize,
    },
    {
      factory,
      executor,
      circuitBreaker,
      diversityValidator,
      deadLetterQueue,
      demandEstimator,
      logger,
    }
  );

  return {
    scheduler,
    circuitBreaker,
    factory,
    executor,
    diversityValidator,
    deadLetterQueue,
    demandEstimator,

    /** Start scheduled batch execution. */
    start() {
      scheduler.start();
      demandEstimator.start();
    },

    /** Stop scheduled execution. */
    stop() {
      scheduler.stop();
      demandEstimator.stop();
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
export { DiversityValidator } from './diversity-validator.js';
export { DeadLetterQueue } from './dead-letter-queue.js';
export { DemandEstimator } from './demand-estimator.js';
