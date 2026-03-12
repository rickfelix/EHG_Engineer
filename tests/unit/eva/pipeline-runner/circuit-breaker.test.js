import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker } from '../../../../lib/eva/pipeline-runner/circuit-breaker.js';

describe('CircuitBreaker', () => {
  let cb;

  beforeEach(() => {
    cb = new CircuitBreaker({
      dailyCostCap: 10,
      failureThreshold: 0.20,
      windowSize: 5,
      organicQueueDepthMax: 3,
    });
  });

  describe('initial state', () => {
    it('starts in closed (healthy) state', () => {
      expect(cb.isOpen()).toBe(false);
      expect(cb.status().state).toBe('closed');
    });

    it('has zero daily calls', () => {
      expect(cb.status().dailyCalls).toBe(0);
    });
  });

  describe('recordSuccess', () => {
    it('increments daily call count', () => {
      cb.recordSuccess();
      expect(cb.status().dailyCalls).toBe(1);
    });

    it('keeps circuit closed on success', () => {
      cb.recordSuccess();
      expect(cb.isOpen()).toBe(false);
    });
  });

  describe('recordFailure', () => {
    it('increments daily call count', () => {
      cb.recordFailure(new Error('test'));
      expect(cb.status().dailyCalls).toBe(1);
    });

    it('stores error message', () => {
      cb.recordFailure(new Error('boom'));
      expect(cb.results[0].error).toBe('boom');
    });
  });

  describe('daily cost cap', () => {
    it('trips when daily calls reach cap', () => {
      for (let i = 0; i < 10; i++) {
        cb.recordSuccess();
      }
      expect(cb.isOpen()).toBe(true);
      expect(cb.status().reason).toBe('daily_cost_cap_exceeded');
    });

    it('stays closed below cap', () => {
      for (let i = 0; i < 9; i++) {
        cb.recordSuccess();
      }
      expect(cb.isOpen()).toBe(false);
    });
  });

  describe('failure rate threshold', () => {
    it('trips when failure rate exceeds 20% with minimum window', () => {
      // 2 failures out of 5 = 40% > 20%
      cb.recordSuccess();
      cb.recordSuccess();
      cb.recordSuccess();
      cb.recordFailure(new Error('a'));
      cb.recordFailure(new Error('b'));
      expect(cb.isOpen()).toBe(true);
      expect(cb.status().reason).toBe('failure_rate_exceeded');
    });

    it('does not trip below minimum window of 5', () => {
      // 1 failure out of 2 = 50%, but window < 5
      cb.recordFailure(new Error('a'));
      cb.recordFailure(new Error('b'));
      expect(cb.isOpen()).toBe(false);
    });

    it('stays closed at exactly 20%', () => {
      // 1 failure out of 5 = 20% — threshold is >, not >=
      cb.recordSuccess();
      cb.recordSuccess();
      cb.recordSuccess();
      cb.recordSuccess();
      cb.recordFailure(new Error('a'));
      expect(cb.isOpen()).toBe(false);
    });
  });

  describe('window trimming', () => {
    it('trims results to windowSize', () => {
      for (let i = 0; i < 10; i++) {
        cb.recordSuccess();
      }
      // windowSize=5, but daily cap=10 tripped, reset to test window
      cb.reset();
      for (let i = 0; i < 7; i++) {
        cb.recordSuccess();
      }
      expect(cb.results.length).toBe(5);
    });
  });

  describe('reset', () => {
    it('returns to closed state', () => {
      for (let i = 0; i < 10; i++) {
        cb.recordSuccess();
      }
      expect(cb.isOpen()).toBe(true);
      cb.reset();
      expect(cb.isOpen()).toBe(false);
      expect(cb.results.length).toBe(0);
    });
  });

  describe('checkOrganicPriority', () => {
    it('returns false when no supabase provided', async () => {
      const result = await cb.checkOrganicPriority({});
      expect(result).toBe(false);
    });

    it('returns true when organic queue exceeds threshold', async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              is: () => Promise.resolve({ count: 5 }),
            }),
          }),
        }),
      };
      const result = await cb.checkOrganicPriority({ supabase: mockSupabase });
      expect(result).toBe(true); // 5 > 3 (organicQueueDepthMax)
    });

    it('returns false when organic queue is within threshold', async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              is: () => Promise.resolve({ count: 2 }),
            }),
          }),
        }),
      };
      const result = await cb.checkOrganicPriority({ supabase: mockSupabase });
      expect(result).toBe(false); // 2 <= 3
    });

    it('returns false on query error (fail-open)', async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              is: () => Promise.reject(new Error('network error')),
            }),
          }),
        }),
      };
      const result = await cb.checkOrganicPriority({ supabase: mockSupabase });
      expect(result).toBe(false);
    });
  });

  describe('status', () => {
    it('returns complete status object', () => {
      cb.recordSuccess();
      cb.recordFailure(new Error('test'));
      const s = cb.status();
      expect(s).toHaveProperty('state', 'closed');
      expect(s).toHaveProperty('dailyCalls', 2);
      expect(s).toHaveProperty('dailyCostCap', 10);
      expect(s).toHaveProperty('failureRate', 0.5);
      expect(s).toHaveProperty('failureThreshold', 0.20);
      expect(s).toHaveProperty('windowSize', 2);
      expect(s).toHaveProperty('reason', null);
    });
  });
});
