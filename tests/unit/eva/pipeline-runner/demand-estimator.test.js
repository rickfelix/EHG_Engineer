import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DemandEstimator } from '../../../../lib/eva/pipeline-runner/demand-estimator.js';

describe('DemandEstimator', () => {
  let estimator;
  let mockSupabase;
  let mockLogger;

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    if (estimator) estimator.stop();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should use default config values', () => {
      estimator = new DemandEstimator({}, { logger: mockLogger });
      expect(estimator.config.pollIntervalMs).toBe(60_000);
      expect(estimator.config.minSamplesPerExperiment).toBe(20);
      expect(estimator.config.burstBatchSize).toBe(12);
    });

    it('should accept custom config', () => {
      estimator = new DemandEstimator({
        pollIntervalMs: 5000,
        minSamplesPerExperiment: 10,
      }, { logger: mockLogger });
      expect(estimator.config.pollIntervalMs).toBe(5000);
      expect(estimator.config.minSamplesPerExperiment).toBe(10);
    });
  });

  describe('checkExperiment', () => {
    it('should detect when experiment needs burst', async () => {
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 5, error: null }),
          }),
        }),
      };
      estimator = new DemandEstimator(
        { minSamplesPerExperiment: 20 },
        { supabase, logger: mockLogger }
      );

      const result = await estimator.checkExperiment('exp-1');
      expect(result.needsBurst).toBe(true);
      expect(result.deficit).toBe(15);
      expect(result.sampleCount).toBe(5);
    });

    it('should not need burst when samples are sufficient', async () => {
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 25, error: null }),
          }),
        }),
      };
      estimator = new DemandEstimator(
        { minSamplesPerExperiment: 20 },
        { supabase, logger: mockLogger }
      );

      const result = await estimator.checkExperiment('exp-1');
      expect(result.needsBurst).toBe(false);
      expect(result.deficit).toBe(0);
    });
  });

  describe('polling', () => {
    it('should emit burst-needed when experiment has insufficient samples', async () => {
      // Mock getActiveExperiments
      const fromMock = vi.fn();
      mockSupabase.from = fromMock;

      // First call: experiments query
      fromMock.mockImplementation((table) => {
        if (table === 'experiments') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: 'exp-1', name: 'Test Exp', status: 'active' }],
                error: null,
              }),
            }),
          };
        }
        // experiment_assignments count query
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ count: 3, error: null }),
          }),
        };
      });

      estimator = new DemandEstimator(
        { minSamplesPerExperiment: 20, pollIntervalMs: 1000 },
        { supabase: mockSupabase, logger: mockLogger }
      );

      const burstPromise = new Promise(resolve => {
        estimator.on('burst-needed', resolve);
      });

      estimator.start();
      await vi.advanceTimersByTimeAsync(100);

      const event = await burstPromise;
      expect(event.experimentId).toBe('exp-1');
      expect(event.deficit).toBe(17);
    });

    it('should not emit when no active experiments', async () => {
      mockSupabase.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });

      estimator = new DemandEstimator(
        { pollIntervalMs: 1000 },
        { supabase: mockSupabase, logger: mockLogger }
      );

      const burstFn = vi.fn();
      estimator.on('burst-needed', burstFn);

      estimator.start();
      await vi.advanceTimersByTimeAsync(100);

      expect(burstFn).not.toHaveBeenCalled();
    });

    it('should not poll without supabase', async () => {
      estimator = new DemandEstimator(
        { pollIntervalMs: 1000 },
        { logger: mockLogger }
      );

      const burstFn = vi.fn();
      estimator.on('burst-needed', burstFn);

      estimator.start();
      await vi.advanceTimersByTimeAsync(2000);

      expect(burstFn).not.toHaveBeenCalled();
    });
  });

  describe('status', () => {
    it('should return current status', () => {
      estimator = new DemandEstimator({}, { logger: mockLogger });
      const status = estimator.status();
      expect(status.running).toBe(false);
      expect(status.activeBursts).toBe(0);
    });
  });

  describe('start/stop', () => {
    it('should set running state', () => {
      estimator = new DemandEstimator({}, { logger: mockLogger });
      expect(estimator.status().running).toBe(false);
      estimator.start();
      expect(estimator.status().running).toBe(true);
      estimator.stop();
      expect(estimator.status().running).toBe(false);
    });
  });
});
