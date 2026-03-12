import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PipelineScheduler } from '../../../../lib/eva/pipeline-runner/pipeline-scheduler.js';

describe('PipelineScheduler Burst Mode', () => {
  let scheduler;
  let mockFactory;
  let mockExecutor;
  let mockCircuitBreaker;
  let mockLogger;

  beforeEach(() => {
    mockLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    mockFactory = {
      createBatch: vi.fn().mockReturnValue({
        ventures: [
          { name: 'V1', archetype: 'democratizer' },
          { name: 'V2', archetype: 'automator' },
        ],
        metadata: {
          batchId: 'BATCH-1',
          normalizedEntropy: 1.0,
          diversityPass: true,
          experimentId: null,
        },
      }),
    };
    mockExecutor = {
      execute: vi.fn().mockResolvedValue({ success: true }),
      supabase: {},
    };
    mockCircuitBreaker = {
      isOpen: vi.fn().mockReturnValue(false),
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
      status: vi.fn().mockReturnValue({ state: 'closed' }),
      checkOrganicPriority: vi.fn().mockResolvedValue(false),
    };
  });

  describe('activateBurst / deactivateBurst', () => {
    it('should track burst mode state', () => {
      scheduler = new PipelineScheduler(
        { batchSize: 4, burstBatchSize: 12 },
        { factory: mockFactory, executor: mockExecutor, circuitBreaker: mockCircuitBreaker, logger: mockLogger }
      );

      expect(scheduler.status().burstMode).toBe(false);

      scheduler.activateBurst('exp-1');
      expect(scheduler.status().burstMode).toBe(true);
      expect(scheduler.status().burstExperimentId).toBe('exp-1');

      scheduler.deactivateBurst();
      expect(scheduler.status().burstMode).toBe(false);
      expect(scheduler.status().burstExperimentId).toBeNull();
    });
  });

  describe('burst batch size', () => {
    it('should use burst batch size during burst mode', async () => {
      scheduler = new PipelineScheduler(
        { batchSize: 4, burstBatchSize: 12 },
        { factory: mockFactory, executor: mockExecutor, circuitBreaker: mockCircuitBreaker, logger: mockLogger }
      );

      scheduler.activateBurst('exp-1', 12);
      await scheduler.runBatch({ batchSize: 12 });

      expect(mockFactory.createBatch).toHaveBeenCalledWith(12, expect.objectContaining({}));
    });
  });

  describe('experimentId pass-through', () => {
    it('should pass experimentId to createBatch during burst', async () => {
      scheduler = new PipelineScheduler(
        { batchSize: 4 },
        { factory: mockFactory, executor: mockExecutor, circuitBreaker: mockCircuitBreaker, logger: mockLogger }
      );

      await scheduler.runBatch({ experimentId: 'exp-1' });

      expect(mockFactory.createBatch).toHaveBeenCalledWith(
        4,
        expect.objectContaining({ experimentId: 'exp-1' })
      );
    });
  });

  describe('metrics tracking', () => {
    it('should track burst vs baseline batches', async () => {
      scheduler = new PipelineScheduler(
        { batchSize: 4, burstBatchSize: 12 },
        { factory: mockFactory, executor: mockExecutor, circuitBreaker: mockCircuitBreaker, logger: mockLogger }
      );

      // Baseline batch
      await scheduler.runBatch();
      expect(scheduler.status().metrics.baselineBatches).toBe(1);
      expect(scheduler.status().metrics.burstBatches).toBe(0);

      // Burst batch
      scheduler.activateBurst('exp-1');
      await scheduler.runBatch({ batchSize: 12 });
      expect(scheduler.status().metrics.burstBatches).toBe(1);
      expect(scheduler.status().metrics.baselineBatches).toBe(1);
    });
  });

  describe('DemandEstimator integration', () => {
    it('should activate burst on burst-needed event', () => {
      const { DemandEstimator } = require('../../../../lib/eva/pipeline-runner/demand-estimator.js');
      const demandEstimator = new DemandEstimator({}, { logger: mockLogger });

      scheduler = new PipelineScheduler(
        { batchSize: 4, burstBatchSize: 12 },
        {
          factory: mockFactory,
          executor: mockExecutor,
          circuitBreaker: mockCircuitBreaker,
          demandEstimator,
          logger: mockLogger,
        }
      );

      expect(scheduler.status().burstMode).toBe(false);

      demandEstimator.emit('burst-needed', {
        experimentId: 'exp-1',
        burstBatchSize: 12,
      });

      expect(scheduler.status().burstMode).toBe(true);
      expect(scheduler.status().burstExperimentId).toBe('exp-1');
    });

    it('should deactivate burst on burst-satisfied event', () => {
      const { DemandEstimator } = require('../../../../lib/eva/pipeline-runner/demand-estimator.js');
      const demandEstimator = new DemandEstimator({}, { logger: mockLogger });

      scheduler = new PipelineScheduler(
        { batchSize: 4 },
        {
          factory: mockFactory,
          executor: mockExecutor,
          circuitBreaker: mockCircuitBreaker,
          demandEstimator,
          logger: mockLogger,
        }
      );

      demandEstimator.emit('burst-needed', { experimentId: 'exp-1', burstBatchSize: 12 });
      expect(scheduler.status().burstMode).toBe(true);

      demandEstimator.emit('burst-satisfied', { experimentId: 'exp-1' });
      expect(scheduler.status().burstMode).toBe(false);
    });
  });

  describe('organic priority during burst', () => {
    it('should skip batch when organic queue is busy during burst', async () => {
      mockCircuitBreaker.checkOrganicPriority.mockResolvedValue(true);

      scheduler = new PipelineScheduler(
        { batchSize: 4 },
        { factory: mockFactory, executor: mockExecutor, circuitBreaker: mockCircuitBreaker, logger: mockLogger }
      );

      scheduler.activateBurst('exp-1');
      // _tick checks organic priority
      await scheduler._tick();

      expect(mockFactory.createBatch).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Organic queue depth exceeded')
      );
    });
  });
});
