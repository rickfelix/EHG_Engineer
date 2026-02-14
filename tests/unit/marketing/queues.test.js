/**
 * BullMQ Queue System Tests
 * SD-EVA-FEAT-MARKETING-FOUNDATION-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock bullmq - use function() not arrow for constructor compatibility
vi.mock('bullmq', () => {
  function MockQueue() {
    this.add = vi.fn().mockResolvedValue({ id: 'job-1', name: 'test-job' });
    this.getWaitingCount = vi.fn().mockResolvedValue(5);
    this.getActiveCount = vi.fn().mockResolvedValue(2);
    this.getCompletedCount = vi.fn().mockResolvedValue(100);
    this.getFailedCount = vi.fn().mockResolvedValue(3);
    this.getDelayedCount = vi.fn().mockResolvedValue(1);
    this.close = vi.fn().mockResolvedValue();
  }

  function MockWorker() {
    this.on = vi.fn();
    this.close = vi.fn().mockResolvedValue();
  }

  return {
    Queue: MockQueue,
    Worker: MockWorker
  };
});

describe('Marketing Queue System', () => {
  let createQueues, createWorkers, addJob, getQueueHealth, shutdown, getQueueConfigs;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../../lib/marketing/queues/index.js');
    createQueues = mod.createQueues;
    createWorkers = mod.createWorkers;
    addJob = mod.addJob;
    getQueueHealth = mod.getQueueHealth;
    shutdown = mod.shutdown;
    getQueueConfigs = mod.getQueueConfigs;
  });

  describe('createQueues', () => {
    it('should create all 6 marketing queues', () => {
      const queues = createQueues();

      expect(queues).toBeInstanceOf(Map);
      expect(queues.size).toBe(6);
      expect(queues.has('content-generation')).toBe(true);
      expect(queues.has('content-review')).toBe(true);
      expect(queues.has('publish-x')).toBe(true);
      expect(queues.has('publish-bluesky')).toBe(true);
      expect(queues.has('attribution-sync')).toBe(true);
      expect(queues.has('daily-rollup')).toBe(true);
    });
  });

  describe('createWorkers', () => {
    it('should create workers for provided handlers', () => {
      const handlers = {
        'content-generation': vi.fn(),
        'publish-x': vi.fn()
      };

      const workers = createWorkers(handlers);

      expect(workers).toBeInstanceOf(Map);
      expect(workers.has('content-generation')).toBe(true);
      expect(workers.has('publish-x')).toBe(true);
      // Should not create worker for unhandled queues
      expect(workers.has('content-review')).toBe(false);
    });

    it('should skip queues without handlers', () => {
      const workers = createWorkers({});

      expect(workers.size).toBe(0);
    });
  });

  describe('addJob', () => {
    it('should add a job to the specified queue', async () => {
      const queues = createQueues();
      const job = await addJob(queues, 'content-generation', { contentId: 'c-1' });

      expect(job).toBeDefined();
      expect(job.id).toBe('job-1');
    });

    it('should throw for unknown queue', async () => {
      const queues = createQueues();

      await expect(
        addJob(queues, 'nonexistent-queue', {})
      ).rejects.toThrow('Queue not found: nonexistent-queue');
    });

    it('should use idempotency key for publish queues', async () => {
      const queues = createQueues();
      const data = { idempotencyKey: 'v1:c1:x:12345' };

      await addJob(queues, 'publish-x', data);

      const queue = queues.get('publish-x');
      expect(queue.add).toHaveBeenCalledWith(
        'publish-x-job',
        data,
        expect.objectContaining({ jobId: 'v1:c1:x:12345' })
      );
    });
  });

  describe('getQueueHealth', () => {
    it('should return health status for all queues', async () => {
      const queues = createQueues();
      const health = await getQueueHealth(queues);

      expect(Object.keys(health)).toHaveLength(6);
      expect(health['content-generation']).toEqual({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
        delayed: 1,
        healthy: true
      });
    });
  });

  describe('getQueueConfigs', () => {
    it('should return config for all 6 queues', () => {
      const configs = getQueueConfigs();

      expect(Object.keys(configs)).toHaveLength(6);
      expect(configs['content-generation'].concurrency).toBe(2);
      expect(configs['publish-x'].concurrency).toBe(1);
      expect(configs['daily-rollup'].concurrency).toBe(1);
    });
  });

  describe('shutdown', () => {
    it('should close all workers and queues', async () => {
      const queues = createQueues();
      const workers = createWorkers({
        'content-generation': vi.fn()
      });

      await shutdown(queues, workers);

      // Workers closed first, then queues
      for (const [, worker] of workers) {
        expect(worker.close).toHaveBeenCalled();
      }
      for (const [, queue] of queues) {
        expect(queue.close).toHaveBeenCalled();
      }
    });
  });
});
