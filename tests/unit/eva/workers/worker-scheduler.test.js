/**
 * Unit Tests for WorkerScheduler and BaseWorker
 * SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-I
 *
 * Tests lifecycle management, interval firing, health reporting,
 * and circuit breaker logic for background workers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkerScheduler } from '../../../../lib/eva/workers/worker-scheduler.js';
import { BaseWorker } from '../../../../lib/eva/workers/base-worker.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Concrete test worker that records each execute() call.
 */
class TestWorker extends BaseWorker {
  constructor(name, opts = {}) {
    super(name, opts);
    this.executeCalls = 0;
    this.executeImpl = opts.executeImpl ?? (() => Promise.resolve());
  }

  async execute() {
    this.executeCalls++;
    return this.executeImpl();
  }
}

// ─── BaseWorker Tests ─────────────────────────────────────────────────────────

describe('BaseWorker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('sets default options correctly', () => {
      const worker = new TestWorker('my-worker');

      expect(worker.name).toBe('my-worker');
      expect(worker.intervalMs).toBe(60_000);
      expect(worker.maxRetries).toBe(3);
      expect(worker.supabase).toBeNull();
    });

    it('accepts custom options', () => {
      const mockSupabase = {};
      const worker = new TestWorker('custom', {
        intervalMs: 5000,
        maxRetries: 5,
        supabase: mockSupabase,
      });

      expect(worker.intervalMs).toBe(5000);
      expect(worker.maxRetries).toBe(5);
      expect(worker.supabase).toBe(mockSupabase);
    });

    it('initialises internal counters to zero', () => {
      const worker = new TestWorker('init-worker');
      const h = worker.health();

      expect(h.running).toBe(false);
      expect(h.totalRuns).toBe(0);
      expect(h.totalErrors).toBe(0);
      expect(h.consecutiveFailures).toBe(0);
      expect(h.circuitBroken).toBe(false);
      expect(h.lastRun).toBeNull();
      expect(h.lastError).toBeNull();
    });
  });

  describe('start / stop lifecycle', () => {
    it('start() sets running to true', () => {
      const worker = new TestWorker('lifecycle', { intervalMs: 1000 });
      worker.start();
      expect(worker.health().running).toBe(true);
      worker.stop();
    });

    it('stop() sets running to false and clears timer', () => {
      const worker = new TestWorker('stop-test', { intervalMs: 1000 });
      worker.start();
      worker.stop();
      expect(worker.health().running).toBe(false);
      expect(worker._timer).toBeNull();
    });

    it('start() is idempotent — calling twice does not double-start', () => {
      const worker = new TestWorker('idempotent', { intervalMs: 10000 });
      worker.start();
      const firstTimer = worker._timer;
      worker.start(); // second call — should be a no-op
      expect(worker._timer).toBe(firstTimer);
      worker.stop();
    });

    it('stop() is idempotent — calling twice does not throw', () => {
      const worker = new TestWorker('stop-twice', { intervalMs: 10000 });
      worker.start();
      worker.stop();
      expect(() => worker.stop()).not.toThrow();
    });
  });

  describe('execute() fires on interval', () => {
    it('fires execute() immediately on start', async () => {
      const worker = new TestWorker('fire-on-start', { intervalMs: 10000 });
      worker.start();

      // Flush the immediate _tick() (it's async — advance by 0ms to drain microtasks)
      await vi.advanceTimersByTimeAsync(0);

      expect(worker.executeCalls).toBeGreaterThanOrEqual(1);
      worker.stop();
    });

    it('fires execute() again after one interval elapses', async () => {
      const worker = new TestWorker('interval-fire', { intervalMs: 5000 });
      worker.start();
      await vi.advanceTimersByTimeAsync(0); // initial tick

      await vi.advanceTimersByTimeAsync(5000); // interval tick

      expect(worker.executeCalls).toBeGreaterThanOrEqual(2);
      worker.stop();
    });

    it('tracks totalRuns correctly after multiple intervals', async () => {
      const worker = new TestWorker('run-count', { intervalMs: 1000 });
      worker.start();
      await vi.advanceTimersByTimeAsync(0); // immediate tick

      await vi.advanceTimersByTimeAsync(3000);

      // 1 immediate + 3 intervals = 4 runs
      expect(worker.health().totalRuns).toBe(4);
      worker.stop();
    });

    it('stops firing after stop() is called', async () => {
      const worker = new TestWorker('stop-fire', { intervalMs: 1000 });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      worker.stop();

      const callsAfterStop = worker.executeCalls;
      await vi.advanceTimersByTimeAsync(5000);

      expect(worker.executeCalls).toBe(callsAfterStop);
    });
  });

  describe('health() reporting', () => {
    it('returns correct shape after a successful run', async () => {
      const worker = new TestWorker('health-ok', { intervalMs: 10000 });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      worker.stop();

      const h = worker.health();
      expect(h.name).toBe('health-ok');
      expect(h.running).toBe(false);
      expect(h.totalRuns).toBeGreaterThanOrEqual(1);
      expect(h.totalErrors).toBe(0);
      expect(h.consecutiveFailures).toBe(0);
      expect(h.circuitBroken).toBe(false);
      expect(h.lastRun).toBeInstanceOf(Date);
    });

    it('records lastError on failure', async () => {
      const worker = new TestWorker('health-fail', {
        intervalMs: 10000,
        executeImpl: () => Promise.reject(new Error('boom')),
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);
      worker.stop();

      expect(worker.health().lastError).toBe('boom');
    });
  });

  describe('circuit breaker', () => {
    it('trips after maxRetries consecutive failures', async () => {
      let calls = 0;
      const worker = new TestWorker('circuit-trip', {
        intervalMs: 1000,
        maxRetries: 3,
        executeImpl: () => {
          calls++;
          return Promise.reject(new Error('fail'));
        },
      });
      worker.start();

      // Tick 3 times to trip the breaker (1 immediate + 2 intervals)
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);

      expect(worker.health().circuitBroken).toBe(true);
      expect(worker.health().consecutiveFailures).toBe(3);

      // Advance more intervals — execute() should NOT be called again
      const callsWhenBroken = calls;
      await vi.advanceTimersByTimeAsync(5000);
      expect(calls).toBe(callsWhenBroken);

      worker.stop();
    });

    it('resetCircuitBreaker() clears consecutive failures', async () => {
      const worker = new TestWorker('circuit-reset', {
        intervalMs: 10000,
        maxRetries: 1,
        executeImpl: () => Promise.reject(new Error('err')),
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(worker.health().circuitBroken).toBe(true);

      worker.resetCircuitBreaker();
      expect(worker.health().circuitBroken).toBe(false);
      expect(worker.health().consecutiveFailures).toBe(0);
      expect(worker.health().lastError).toBeNull();

      worker.stop();
    });

    it('resets consecutive failures after a success', async () => {
      let callCount = 0;
      const worker = new TestWorker('circuit-recover', {
        intervalMs: 1000,
        maxRetries: 5,
        executeImpl: () => {
          callCount++;
          if (callCount <= 2) return Promise.reject(new Error('transient'));
          return Promise.resolve();
        },
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0); // fail 1

      await vi.advanceTimersByTimeAsync(1000); // fail 2

      expect(worker.health().consecutiveFailures).toBe(2);

      await vi.advanceTimersByTimeAsync(1000); // success

      expect(worker.health().consecutiveFailures).toBe(0);
      expect(worker.health().circuitBroken).toBe(false);

      worker.stop();
    });

    it('increments totalErrors without tripping when below maxRetries', async () => {
      let fail = true;
      const worker = new TestWorker('partial-fail', {
        intervalMs: 1000,
        maxRetries: 5,
        executeImpl: () => {
          if (fail) {
            fail = false;
            return Promise.reject(new Error('once'));
          }
          return Promise.resolve();
        },
      });
      worker.start();
      await vi.advanceTimersByTimeAsync(0); // fail
      await vi.advanceTimersByTimeAsync(1000); // success

      const h = worker.health();
      expect(h.totalErrors).toBe(1);
      expect(h.circuitBroken).toBe(false);

      worker.stop();
    });
  });

  describe('execute() not implemented in base class', () => {
    it('throws when execute() not overridden', async () => {
      // Use the raw BaseWorker directly — do NOT call start() so we control timing
      const base = new BaseWorker('raw');
      await expect(base.execute()).rejects.toThrow('raw: execute() not implemented');
    });
  });
});

// ─── WorkerScheduler Tests ────────────────────────────────────────────────────

describe('WorkerScheduler', () => {
  let scheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    scheduler = new WorkerScheduler();
  });

  afterEach(() => {
    // Clean up any running workers
    scheduler.stopAll();
    vi.useRealTimers();
  });

  describe('register()', () => {
    it('registers a worker and makes it retrievable', () => {
      const worker = new TestWorker('reg-worker', { intervalMs: 60000 });
      scheduler.register(worker);

      expect(scheduler.get('reg-worker')).toBe(worker);
    });

    it('throws when registering a worker with a duplicate name', () => {
      const w1 = new TestWorker('dup', { intervalMs: 60000 });
      const w2 = new TestWorker('dup', { intervalMs: 60000 });
      scheduler.register(w1);

      expect(() => scheduler.register(w2)).toThrow('Worker "dup" already registered');
    });
  });

  describe('get()', () => {
    it('returns null for an unknown worker name', () => {
      expect(scheduler.get('nonexistent')).toBeNull();
    });

    it('returns the correct worker instance', () => {
      const w = new TestWorker('get-me', { intervalMs: 60000 });
      scheduler.register(w);
      expect(scheduler.get('get-me')).toBe(w);
    });
  });

  describe('list()', () => {
    it('returns empty array when no workers registered', () => {
      expect(scheduler.list()).toEqual([]);
    });

    it('returns names of all registered workers', () => {
      scheduler.register(new TestWorker('alpha', { intervalMs: 60000 }));
      scheduler.register(new TestWorker('beta', { intervalMs: 60000 }));

      const names = scheduler.list();
      expect(names).toContain('alpha');
      expect(names).toContain('beta');
      expect(names).toHaveLength(2);
    });
  });

  describe('startAll()', () => {
    it('starts all registered workers', () => {
      const w1 = new TestWorker('start-a', { intervalMs: 60000 });
      const w2 = new TestWorker('start-b', { intervalMs: 60000 });
      scheduler.register(w1);
      scheduler.register(w2);

      scheduler.startAll();

      expect(w1.health().running).toBe(true);
      expect(w2.health().running).toBe(true);
    });

    it('is safe to call when no workers are registered', () => {
      expect(() => scheduler.startAll()).not.toThrow();
    });
  });

  describe('stopAll()', () => {
    it('stops all running workers', () => {
      const w1 = new TestWorker('stop-a', { intervalMs: 60000 });
      const w2 = new TestWorker('stop-b', { intervalMs: 60000 });
      scheduler.register(w1);
      scheduler.register(w2);

      scheduler.startAll();
      scheduler.stopAll();

      expect(w1.health().running).toBe(false);
      expect(w2.health().running).toBe(false);
    });

    it('is safe to call when no workers are registered', () => {
      expect(() => scheduler.stopAll()).not.toThrow();
    });
  });

  describe('healthCheck()', () => {
    it('returns an object keyed by worker name', () => {
      scheduler.register(new TestWorker('hc-a', { intervalMs: 60000 }));
      scheduler.register(new TestWorker('hc-b', { intervalMs: 60000 }));

      const report = scheduler.healthCheck();

      expect(report).toHaveProperty('hc-a');
      expect(report).toHaveProperty('hc-b');
    });

    it('includes running status for each worker', () => {
      const w = new TestWorker('hc-running', { intervalMs: 60000 });
      scheduler.register(w);
      scheduler.startAll();

      const report = scheduler.healthCheck();
      expect(report['hc-running'].running).toBe(true);
    });

    it('returns empty object when no workers registered', () => {
      expect(scheduler.healthCheck()).toEqual({});
    });
  });

  describe('onShutdown()', () => {
    it('registers a cleanup callback', () => {
      const cleanup = vi.fn();
      scheduler.onShutdown(cleanup);
      expect(scheduler._shutdownHandlers).toContain(cleanup);
    });
  });
});
