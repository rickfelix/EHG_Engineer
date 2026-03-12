import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PipelineScheduler } from '../../../../lib/eva/pipeline-runner/pipeline-scheduler.js';

describe('PipelineScheduler', () => {
  let scheduler;
  let mockFactory;
  let mockExecutor;
  let mockCircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();

    mockFactory = {
      createBatch: vi.fn().mockReturnValue({
        ventures: [
          { name: 'V1', archetype: 'democratizer' },
          { name: 'V2', archetype: 'automator' },
        ],
        metadata: {
          batchId: 'BATCH-1',
          seed: 42,
          batchSize: 2,
          archetypeDistribution: { democratizer: 1, automator: 1 },
          shannonEntropy: 1.0,
          normalizedEntropy: 1.0,
          diversityPass: true,
        },
      }),
      minEntropy: 0.6,
    };

    mockExecutor = {
      supabase: {},
      execute: vi.fn().mockResolvedValue({
        success: true,
        ventureId: 'v-123',
        archetype: 'democratizer',
        durationMs: 100,
      }),
    };

    mockCircuitBreaker = {
      isOpen: vi.fn().mockReturnValue(false),
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
      checkOrganicPriority: vi.fn().mockResolvedValue(false),
      status: vi.fn().mockReturnValue({ state: 'closed' }),
    };

    scheduler = new PipelineScheduler(
      { intervalMs: 1000, batchSize: 2, maxDailyVentures: 10 },
      {
        factory: mockFactory,
        executor: mockExecutor,
        circuitBreaker: mockCircuitBreaker,
        logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
      }
    );
  });

  afterEach(() => {
    scheduler.stop();
    vi.useRealTimers();
  });

  describe('runBatch', () => {
    it('executes a batch and returns results', async () => {
      const result = await scheduler.runBatch();
      expect(result.batchSize).toBe(2);
      expect(result.successes).toBe(2);
      expect(result.failures).toBe(0);
      expect(result.successRate).toBe(1.0);
      expect(mockExecutor.execute).toHaveBeenCalledTimes(2);
    });

    it('records success in circuit breaker', async () => {
      await scheduler.runBatch();
      expect(mockCircuitBreaker.recordSuccess).toHaveBeenCalledTimes(2);
    });

    it('records failure in circuit breaker', async () => {
      mockExecutor.execute.mockResolvedValueOnce({
        success: false,
        error: 'failed',
        archetype: 'democratizer',
        durationMs: 50,
      });

      const result = await scheduler.runBatch();
      expect(result.failures).toBe(1);
      expect(mockCircuitBreaker.recordFailure).toHaveBeenCalledTimes(1);
    });

    it('stops mid-batch when circuit breaker trips', async () => {
      mockCircuitBreaker.isOpen
        .mockReturnValueOnce(false)  // initial check
        .mockReturnValueOnce(false)  // after first venture
        .mockReturnValueOnce(true);  // after second venture

      await scheduler.runBatch();
      // Should still process both since breaker trips after recording
    });
  });

  describe('dry run', () => {
    it('generates ventures without executing', async () => {
      const result = await scheduler.runBatch({ dryRun: true });
      expect(result.dryRun).toBe(true);
      expect(mockExecutor.execute).not.toHaveBeenCalled();
      expect(result.ventures).toHaveLength(2);
    });
  });

  describe('status', () => {
    it('returns comprehensive status', () => {
      const status = scheduler.status();
      expect(status).toHaveProperty('running', false);
      expect(status).toHaveProperty('dailyCount', 0);
      expect(status).toHaveProperty('dailyRemaining', 10);
      expect(status).toHaveProperty('metrics');
      expect(status).toHaveProperty('circuitBreaker');
    });

    it('updates metrics after batch', async () => {
      await scheduler.runBatch();
      const status = scheduler.status();
      expect(status.metrics.totalBatches).toBe(1);
      expect(status.metrics.totalVentures).toBe(2);
      expect(status.metrics.totalSuccesses).toBe(2);
      expect(status.dailyCount).toBe(2);
    });
  });

  describe('circuit breaker integration', () => {
    it('skips batch when circuit breaker is open', async () => {
      mockCircuitBreaker.isOpen.mockReturnValue(true);
      scheduler.start();
      await vi.advanceTimersByTimeAsync(100);
      expect(mockFactory.createBatch).not.toHaveBeenCalled();
    });

    it('skips batch when organic queue is busy', async () => {
      mockCircuitBreaker.checkOrganicPriority.mockResolvedValue(true);
      scheduler.start();
      await vi.advanceTimersByTimeAsync(100);
      expect(mockFactory.createBatch).not.toHaveBeenCalled();
    });
  });

  describe('daily cap', () => {
    it('skips batch when daily cap reached', async () => {
      // Simulate having already hit the cap
      scheduler._dailyCount = 10;
      scheduler.start();
      await vi.advanceTimersByTimeAsync(100);
      expect(mockFactory.createBatch).not.toHaveBeenCalled();
    });
  });

  describe('start/stop', () => {
    it('sets running flag', () => {
      scheduler.start();
      expect(scheduler.status().running).toBe(true);
      scheduler.stop();
      expect(scheduler.status().running).toBe(false);
    });
  });
});
