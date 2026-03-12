import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeadLetterQueue } from '../../../../lib/eva/pipeline-runner/dead-letter-queue.js';

describe('DeadLetterQueue', () => {
  let dlq;
  let mockLogger;

  beforeEach(() => {
    vi.useFakeTimers();
    mockLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    dlq = new DeadLetterQueue({ baseDelayMs: 100 }, { logger: mockLogger });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('enqueue', () => {
    it('should add a failed entry with auto-categorized error', () => {
      const entry = dlq.enqueue({
        ventureData: { name: 'V1', archetype: 'democratizer' },
        error: 'Connection timeout',
        batchId: 123,
      });

      expect(entry.id).toBeDefined();
      expect(entry.status).toBe('pending');
      expect(entry.attemptCount).toBe(0);
      expect(entry.category).toBe('TIMEOUT');
    });

    it('should categorize LLM errors', () => {
      const entry = dlq.enqueue({
        ventureData: { name: 'V1' },
        error: 'LLM rate limit exceeded',
      });
      expect(entry.category).toBe('LLM_ERROR');
    });

    it('should categorize DB errors', () => {
      const entry = dlq.enqueue({
        ventureData: { name: 'V1' },
        error: 'duplicate key value violates unique constraint',
      });
      expect(entry.category).toBe('DB_ERROR');
    });

    it('should categorize gate errors', () => {
      const entry = dlq.enqueue({
        ventureData: { name: 'V1' },
        error: 'Gate validation failed: score below threshold',
      });
      expect(entry.category).toBe('GATE_ERROR');
    });

    it('should default to UNKNOWN for unrecognized errors', () => {
      const entry = dlq.enqueue({
        ventureData: { name: 'V1' },
        error: 'Something weird happened',
      });
      expect(entry.category).toBe('UNKNOWN');
    });
  });

  describe('processRetries', () => {
    it('should retry pending entries after delay expires', async () => {
      dlq.enqueue({
        ventureData: { name: 'V1' },
        error: 'Temporary failure',
      });

      // Advance past the nextRetryAt delay
      vi.advanceTimersByTime(200);

      const executeFn = vi.fn().mockResolvedValue({ success: true });
      const result = await dlq.processRetries(executeFn);

      expect(executeFn).toHaveBeenCalledTimes(1);
      expect(result.succeeded).toBe(1);
    });

    it('should mark permanently_failed after maxRetries', async () => {
      const dlq1 = new DeadLetterQueue({ maxRetries: 1, baseDelayMs: 100 }, { logger: mockLogger });
      dlq1.enqueue({
        ventureData: { name: 'V1' },
        error: 'Persistent failure',
      });

      vi.advanceTimersByTime(200);

      const executeFn = vi.fn().mockResolvedValue({ success: false, error: 'Still broken' });
      await dlq1.processRetries(executeFn);

      const failed = dlq1.entries('permanently_failed');
      expect(failed.length).toBe(1);
    });

    it('should handle empty queue gracefully', async () => {
      const executeFn = vi.fn();
      const result = await dlq.processRetries(executeFn);
      expect(executeFn).not.toHaveBeenCalled();
      expect(result.processed).toBe(0);
      expect(result.succeeded).toBe(0);
    });

    it('should not retry entries before nextRetryAt', async () => {
      dlq.enqueue({
        ventureData: { name: 'V1' },
        error: 'Temporary failure',
      });

      // Don't advance time — entry is not yet ready
      const executeFn = vi.fn().mockResolvedValue({ success: true });
      const result = await dlq.processRetries(executeFn);

      expect(executeFn).not.toHaveBeenCalled();
      expect(result.processed).toBe(0);
    });
  });

  describe('depth', () => {
    it('should return count of pending entries', () => {
      expect(dlq.depth()).toBe(0);
      dlq.enqueue({ ventureData: { name: 'V1' }, error: 'err' });
      dlq.enqueue({ ventureData: { name: 'V2' }, error: 'err' });
      expect(dlq.depth()).toBe(2);
    });
  });

  describe('summary', () => {
    it('should return breakdown by status and category', () => {
      dlq.enqueue({ ventureData: { name: 'V1' }, error: 'timeout error' });
      dlq.enqueue({ ventureData: { name: 'V2' }, error: 'database constraint error' });

      const summary = dlq.summary();
      expect(summary.total).toBe(2);
      expect(summary.pending).toBe(2);
      expect(summary.byCategory.TIMEOUT).toBe(1);
      expect(summary.byCategory.DB_ERROR).toBe(1);
    });
  });

  describe('clear', () => {
    it('should remove resolved and permanently_failed entries', async () => {
      dlq.enqueue({ ventureData: { name: 'V1' }, error: 'err' });

      vi.advanceTimersByTime(200);

      const executeFn = vi.fn().mockResolvedValue({ success: true });
      await dlq.processRetries(executeFn);

      expect(dlq.entries('resolved').length).toBe(1);
      dlq.clear();
      expect(dlq.entries('resolved').length).toBe(0);
      expect(dlq.summary().total).toBe(0);
    });
  });
});
