/**
 * Tests for StageExecutionWorker Resilience Features
 * SD-LEO-INFRA-STAGE-EXECUTION-WORKER-001
 *
 * FR-001: Stale Lock Auto-Release
 * FR-002: Health Heartbeat
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StageExecutionWorker, CHAIRMAN_GATES, getOperatingMode } from '../../../lib/eva/stage-execution-worker.js';

// Mock dependencies
vi.mock('../../../lib/eva/eva-orchestrator.js', () => ({
  processStage: vi.fn(),
}));

vi.mock('../../../lib/eva/orchestrator-state-machine.js', () => ({
  acquireProcessingLock: vi.fn().mockResolvedValue({ acquired: false }),
  releaseProcessingLock: vi.fn().mockResolvedValue({}),
  markCompleted: vi.fn().mockResolvedValue({}),
  ORCHESTRATOR_STATES: {
    IDLE: 'idle',
    PROCESSING: 'processing',
    BLOCKED: 'blocked',
    FAILED: 'failed',
    COMPLETED: 'completed',
    KILLED_AT_REALITY_GATE: 'killed_at_reality_gate',
  },
}));

vi.mock('../../../lib/eva/chairman-decision-watcher.js', () => ({
  createOrReusePendingDecision: vi.fn(),
  waitForDecision: vi.fn(),
}));

vi.mock('../../../lib/eva/shared-services.js', () => ({
  emit: vi.fn().mockResolvedValue(undefined),
}));

function createMockSupabase() {
  const results = { data: null, error: null };
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(results),
    upsert: vi.fn().mockResolvedValue(results),
    update: vi.fn().mockReturnThis(),
  };

  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
    _results: results,
  };
}

function createMockLogger() {
  return {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

describe('StageExecutionWorker Resilience (FR-001/FR-002)', () => {
  let supabase;
  let logger;
  let worker;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    supabase = createMockSupabase();
    logger = createMockLogger();
  });

  afterEach(() => {
    if (worker) worker.stop();
    vi.useRealTimers();
  });

  describe('constructor - new fields', () => {
    it('generates a unique workerId', () => {
      worker = new StageExecutionWorker({ supabase, logger });
      expect(worker._workerId).toMatch(/^sew-/);
      expect(worker._workerId).toContain(String(process.pid));
    });

    it('sets default stale lock threshold', () => {
      worker = new StageExecutionWorker({ supabase, logger });
      expect(worker._staleLockThresholdMs).toBe(300_000);
    });

    it('accepts custom stale lock threshold', () => {
      worker = new StageExecutionWorker({ supabase, logger, staleLockThresholdMs: 60_000 });
      expect(worker._staleLockThresholdMs).toBe(60_000);
    });
  });

  describe('FR-001: Stale Lock Auto-Release', () => {
    it('releases locks older than threshold', async () => {
      worker = new StageExecutionWorker({ supabase, logger, staleLockThresholdMs: 300_000 });

      const staleLockTime = new Date(Date.now() - 400_000).toISOString(); // 400s ago
      const staleVentures = [
        { id: 'v1', name: 'Stale Venture', orchestrator_lock_acquired_at: staleLockTime },
      ];

      // First call to from('ventures').select().eq().lt() returns stale ventures
      const selectChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockResolvedValue({ data: staleVentures, error: null }),
      };

      // Second call for update
      const updateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };
      // Make the final .eq() resolve
      updateChain.eq.mockReturnValueOnce(updateChain).mockResolvedValueOnce({ error: null });

      let callCount = 0;
      supabase.from.mockImplementation((table) => {
        if (table === 'ventures') {
          callCount++;
          if (callCount === 1) return selectChain;
          return updateChain;
        }
        // heartbeat or events table
        return supabase._chain;
      });

      await worker._releaseStaleLocks();

      expect(supabase.from).toHaveBeenCalledWith('ventures');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Releasing stale lock on Stale Venture')
      );
    });

    it('does nothing when no stale locks found', async () => {
      worker = new StageExecutionWorker({ supabase, logger });

      const selectChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockResolvedValue({ data: [], error: null }),
      };

      supabase.from.mockReturnValue(selectChain);

      await worker._releaseStaleLocks();

      // Should only query, not update
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('handles query errors gracefully', async () => {
      worker = new StageExecutionWorker({ supabase, logger });

      const selectChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB down' } }),
      };

      supabase.from.mockReturnValue(selectChain);

      await worker._releaseStaleLocks(); // Should not throw

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Stale lock query failed')
      );
    });
  });

  describe('FR-002: Health Heartbeat', () => {
    it('upserts heartbeat with correct fields', async () => {
      worker = new StageExecutionWorker({ supabase, logger });

      await worker._upsertHeartbeat('online');

      expect(supabase.from).toHaveBeenCalledWith('worker_heartbeats');
      expect(supabase._chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          worker_id: worker._workerId,
          worker_type: 'stage-execution-worker',
          status: 'online',
          pid: process.pid,
        }),
        { onConflict: 'worker_id' }
      );
    });

    it('throws on upsert error', async () => {
      worker = new StageExecutionWorker({ supabase, logger });

      supabase._chain.upsert.mockResolvedValueOnce({ error: { message: 'Constraint violation' } });

      await expect(worker._upsertHeartbeat('online')).rejects.toThrow('Constraint violation');
    });

    it('sends online heartbeat on start()', () => {
      worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 60000 });
      worker.start();

      expect(supabase.from).toHaveBeenCalledWith('worker_heartbeats');
    });

    it('sends stopped heartbeat on stop()', () => {
      worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 60000 });
      worker._running = true;
      worker.stop();

      // Check that upsert was called with status 'stopped'
      const upsertCalls = supabase._chain.upsert.mock.calls;
      const stoppedCall = upsertCalls.find(
        ([payload]) => payload.status === 'stopped'
      );
      expect(stoppedCall).toBeTruthy();
    });
  });

  describe('getStatus()', () => {
    it('returns worker status including workerId', () => {
      worker = new StageExecutionWorker({ supabase, logger });
      const status = worker.getStatus();

      expect(status.running).toBe(false);
      expect(status.processing).toBe(false);
      expect(status.activeVentures).toBe(0);
      expect(status.ventureIds).toEqual([]);
    });
  });

  describe('getOperatingMode()', () => {
    it('maps stages to correct modes', () => {
      expect(getOperatingMode(1)).toBe('EVALUATION');
      expect(getOperatingMode(5)).toBe('EVALUATION');
      expect(getOperatingMode(6)).toBe('STRATEGY');
      expect(getOperatingMode(12)).toBe('STRATEGY');
      expect(getOperatingMode(13)).toBe('PLANNING');
      expect(getOperatingMode(16)).toBe('PLANNING');
      expect(getOperatingMode(17)).toBe('BUILD');
      expect(getOperatingMode(21)).toBe('BUILD');
      expect(getOperatingMode(22)).toBe('LAUNCH');
      expect(getOperatingMode(25)).toBe('LAUNCH');
    });
  });
});
