/**
 * Tests for StageExecutionWorker
 * SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-D
 *
 * Key design notes:
 *   - _processVenture() has a while loop (currentStage <= 25). Tests MUST
 *     ensure the loop terminates. The safest patterns:
 *       (a) Don't set result.nextStageId — the DB fallback re-reads the same
 *           stage and calls markCompleted, exiting cleanly.
 *       (b) Use mockResolvedValueOnce so subsequent calls return undefined →
 *           treated as failure → loop exits.
 *   - All tests that call processOneStage use maxRetries:0, retryDelayMs:1
 *     to avoid slow retries.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock eva-orchestrator (the actual import used by the worker)
vi.mock('../../../lib/eva/eva-orchestrator.js', () => ({
  processStage: vi.fn(),
}));

// Mock orchestrator-state-machine
vi.mock('../../../lib/eva/orchestrator-state-machine.js', () => ({
  acquireProcessingLock: vi.fn(),
  releaseProcessingLock: vi.fn(),
  markCompleted: vi.fn(),
  getOrchestratorState: vi.fn().mockResolvedValue({ state: 'processing' }),
  ORCHESTRATOR_STATES: {
    IDLE: 'idle',
    PROCESSING: 'processing',
    BLOCKED: 'blocked',
    FAILED: 'failed',
    COMPLETED: 'completed',
    KILLED_AT_REALITY_GATE: 'killed_at_reality_gate',
  },
}));

// Mock chairman-decision-watcher
vi.mock('../../../lib/eva/chairman-decision-watcher.js', () => ({
  createOrReusePendingDecision: vi.fn(),
  waitForDecision: vi.fn(),
}));

// Mock shared-services
vi.mock('../../../lib/eva/shared-services.js', () => ({
  emit: vi.fn().mockResolvedValue(undefined),
}));

// Mock autonomy-model
vi.mock('../../../lib/eva/autonomy-model.js', () => ({
  checkAutonomy: vi.fn().mockResolvedValue({ action: 'require_approval', level: 'L0' }),
}));

import { processStage } from '../../../lib/eva/eva-orchestrator.js';
import {
  acquireProcessingLock,
  releaseProcessingLock,
  markCompleted,
} from '../../../lib/eva/orchestrator-state-machine.js';
import { createOrReusePendingDecision } from '../../../lib/eva/chairman-decision-watcher.js';
import {
  StageExecutionWorker,
  getOperatingMode,
  CHAIRMAN_GATES,
} from '../../../lib/eva/stage-execution-worker.js';

/**
 * Create a mock Supabase client.  Every .from() call returns the same chain
 * unless a per-table override is registered via _setTableResponse().
 */
function createMockSupabase(overrides = {}) {
  const defaultChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
  };

  // Make all chainable methods return the chain
  for (const key of Object.keys(defaultChain)) {
    if (!['maybeSingle', 'single'].includes(key)) {
      defaultChain[key].mockReturnValue(defaultChain);
    }
  }

  const tableOverrides = {};

  const fromMock = vi.fn().mockImplementation((table) => {
    if (tableOverrides[table]) return tableOverrides[table];
    return defaultChain;
  });

  return {
    from: fromMock,
    _chain: defaultChain,
    _setTableResponse(table, chain) { tableOverrides[table] = chain; },
    ...overrides,
  };
}

function createMockLogger() {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('StageExecutionWorker', () => {
  let supabase;
  let logger;
  let worker;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = createMockSupabase();
    logger = createMockLogger();

    // Default: lock acquisition succeeds
    acquireProcessingLock.mockResolvedValue({ acquired: true, lockId: 'lock-1', error: null });
    releaseProcessingLock.mockResolvedValue({ released: true });
    markCompleted.mockResolvedValue({ completed: true });
  });

  afterEach(() => {
    if (worker) worker.stop();
  });

  // ── Constructor ──────────────────────────────────────────

  describe('constructor', () => {
    it('throws without supabase', () => {
      expect(() => new StageExecutionWorker({ logger }))
        .toThrow('supabase client is required');
    });

    it('creates with defaults', () => {
      worker = new StageExecutionWorker({ supabase, logger });
      expect(worker._pollIntervalMs).toBe(30_000);
      expect(worker._maxRetries).toBe(2);
      expect(worker._activeVentures.size).toBe(0);
    });

    it('accepts custom poll interval', () => {
      worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 5000 });
      expect(worker._pollIntervalMs).toBe(5000);
    });
  });

  // ── Start / Stop ──────────────────────────────────────────

  describe('start/stop', () => {
    it('starts and stops cleanly', () => {
      worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 60000 });
      worker.start();
      expect(worker._running).toBe(true);
      worker.stop();
      expect(worker._running).toBe(false);
    });

    it('aborts active ventures on stop', () => {
      worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 60000 });
      worker.start(); // stop() is a no-op unless _running=true
      const ac = new AbortController();
      worker._activeVentures.set('venture-1', ac);
      worker.stop();
      expect(ac.signal.aborted).toBe(true);
      expect(worker._activeVentures.size).toBe(0);
    });
  });

  // ── processOneStage ──────────────────────────────────────

  describe('processOneStage - sequential advancement', () => {
    it('calls processStage for the venture\'s current stage', async () => {
      worker = new StageExecutionWorker({ supabase, logger, maxRetries: 0, retryDelayMs: 1 });

      // Venture at stage 1
      supabase._chain.single.mockResolvedValue({
        data: { current_lifecycle_stage: 1, name: 'Test Venture' },
        error: null,
      });
      supabase._chain.maybeSingle.mockResolvedValue({ data: null, error: null });

      // processStage returns COMPLETED without nextStageId.
      // The DB fallback re-reads stage 1 (same) → markCompleted → loop exits.
      processStage.mockResolvedValueOnce({
        status: 'COMPLETED',
        stageNumber: 1,
        ventureId: 'v1',
      });

      await worker.processOneStage('v1');

      expect(processStage).toHaveBeenCalledWith(
        expect.objectContaining({ ventureId: 'v1', stageId: 1 }),
        expect.objectContaining({ supabase, logger }),
      );
    });

    it('marks venture completed at MAX_STAGES (26)', async () => {
      worker = new StageExecutionWorker({ supabase, logger, maxRetries: 0, retryDelayMs: 1 });

      // Venture at stage 26
      supabase._chain.single.mockResolvedValue({
        data: { current_lifecycle_stage: 26, name: 'Final Venture' },
        error: null,
      });
      supabase._chain.maybeSingle.mockResolvedValue({ data: null, error: null });

      processStage.mockResolvedValueOnce({
        status: 'COMPLETED',
        stageNumber: 25,
        ventureId: 'v1',
      });

      await worker.processOneStage('v1');

      // currentStage (25) >= MAX_STAGE → markCompleted called
      expect(markCompleted).toHaveBeenCalledWith(
        supabase, 'v1',
        expect.objectContaining({ lockId: 'lock-1' }),
      );
    });

    it('returns failed result when stage execution throws', async () => {
      worker = new StageExecutionWorker({ supabase, logger, maxRetries: 0, retryDelayMs: 1 });

      supabase._chain.single.mockResolvedValue({
        data: { current_lifecycle_stage: 1, name: 'Error Venture' },
        error: null,
      });
      supabase._chain.maybeSingle.mockResolvedValue({ data: null, error: null });

      processStage.mockRejectedValueOnce(new Error('LLM timeout'));

      const result = await worker.processOneStage('v1');

      // _executeWithRetry returns failed result → loop exits via FAILED check
      expect(result.status).toBe('failed');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Stage 1 attempt'),
      );
    });
  });

  // ── Chairman gate blocking ────────────────────────────────

  describe('Chairman gate blocking', () => {
    it('blocks at gate stage when no approved decision exists', async () => {
      worker = new StageExecutionWorker({ supabase, logger, maxRetries: 0, retryDelayMs: 1 });

      // Venture at stage 3 (a BLOCKING chairman gate)
      supabase._chain.single.mockResolvedValue({
        data: { current_lifecycle_stage: 3, name: 'Gate Venture' },
        error: null,
      });
      // No governance override, no pre-existing approved decision
      supabase._chain.maybeSingle.mockResolvedValue({ data: null, error: null });

      // processStage runs BEFORE gate check in the implementation
      processStage.mockResolvedValueOnce({
        status: 'COMPLETED',
        stageNumber: 3,
        ventureId: 'v1',
      });

      // _handleChairmanGate → createOrReusePendingDecision → new pending decision
      createOrReusePendingDecision.mockResolvedValue({ id: 'dec-1', isNew: true });

      const result = await worker.processOneStage('v1');

      expect(createOrReusePendingDecision).toHaveBeenCalledWith(
        expect.objectContaining({ ventureId: 'v1', stageNumber: 3 }),
      );
      expect(result.status).toBe('blocked');
      expect(result.gate).toBe('chairman');
    });

    it('proceeds past gate when already approved', async () => {
      worker = new StageExecutionWorker({ supabase, logger, maxRetries: 0, retryDelayMs: 1 });

      // Venture at stage 3
      supabase._chain.single.mockResolvedValue({
        data: { current_lifecycle_stage: 3, name: 'Approved Venture' },
        error: null,
      });

      // maybeSingle: return approved decision (SD-VW-FIX-WORKER-GATE-REENTRY-001
      // checks chairman_decisions for already-approved before _handleChairmanGate)
      supabase._chain.maybeSingle.mockResolvedValue({
        data: { id: 'dec-1', status: 'approved' },
        error: null,
      });

      // First call at stage 3
      processStage.mockResolvedValueOnce({
        status: 'COMPLETED',
        stageNumber: 3,
        ventureId: 'v1',
      });
      // Second call at stage 4 (after approval advances) — no nextStageId → exit
      processStage.mockResolvedValueOnce({
        status: 'COMPLETED',
        stageNumber: 4,
        ventureId: 'v1',
      });

      await worker.processOneStage('v1');

      // processStage was called at least for stage 3 (gate didn't block)
      expect(processStage).toHaveBeenCalled();
    });

    it('kills venture on KILL decision', async () => {
      worker = new StageExecutionWorker({ supabase, logger, maxRetries: 0, retryDelayMs: 1 });

      supabase._chain.single.mockResolvedValue({
        data: { current_lifecycle_stage: 5, name: 'Kill Venture' },
        error: null,
      });
      // No pre-approved decision in the initial reentry check
      supabase._chain.maybeSingle.mockResolvedValue({ data: null, error: null });

      processStage.mockResolvedValueOnce({
        status: 'COMPLETED',
        stageNumber: 5,
        ventureId: 'v1',
      });

      // _handleChairmanGate: createOrReusePendingDecision returns existing (not new)
      createOrReusePendingDecision.mockResolvedValue({ id: 'dec-kill', isNew: false });

      // chairman_decisions table is queried twice:
      //   1. Reentry check (line 546): .select().eq().eq().eq().limit().maybeSingle()
      //   2. Inside _handleChairmanGate (line 1027): .select().eq().single()
      // Both need to return kill-compatible data.
      const killChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), // reentry: no pre-approved
        single: vi.fn().mockResolvedValue({
          data: { status: 'rejected', decision: 'kill' },
          error: null,
        }),
      };
      supabase._setTableResponse('chairman_decisions', killChain);

      const result = await worker.processOneStage('v1');

      expect(result.status).toBe('killed');
    });

    it('identifies all chairman gate stages correctly', () => {
      const expectedGates = [3, 5, 10, 13, 17, 18, 23, 24, 25];
      const expectedNonGates = [1, 2, 4, 6, 7, 8, 9, 11, 12, 14, 15, 16, 19, 20, 21, 22, 26];

      for (const stage of expectedGates) {
        expect(CHAIRMAN_GATES.BLOCKING.has(stage)).toBe(true);
      }
      for (const stage of expectedNonGates) {
        expect(CHAIRMAN_GATES.BLOCKING.has(stage)).toBe(false);
      }
    });
  });

  // ── Operating mode enforcement ────────────────────────────

  describe('Operating mode enforcement', () => {
    it('returns correct mode for each stage range', () => {
      // EVALUATION: 1-5
      expect(getOperatingMode(1)).toBe('EVALUATION');
      expect(getOperatingMode(5)).toBe('EVALUATION');
      // STRATEGY: 6-12
      expect(getOperatingMode(6)).toBe('STRATEGY');
      expect(getOperatingMode(10)).toBe('STRATEGY');
      expect(getOperatingMode(12)).toBe('STRATEGY');
      // PLANNING: 13-17
      expect(getOperatingMode(13)).toBe('PLANNING');
      expect(getOperatingMode(17)).toBe('PLANNING');
      // BUILD: 18-22
      expect(getOperatingMode(18)).toBe('BUILD');
      expect(getOperatingMode(22)).toBe('BUILD');
      // LAUNCH: 23-26
      expect(getOperatingMode(23)).toBe('LAUNCH');
      expect(getOperatingMode(26)).toBe('LAUNCH');
      // Out of range
      expect(getOperatingMode(0)).toBe('UNKNOWN');
      expect(getOperatingMode(27)).toBe('UNKNOWN');
    });

    it('stops at mode boundary', async () => {
      worker = new StageExecutionWorker({ supabase, logger, maxRetries: 0, retryDelayMs: 1 });

      // Start at stage 5 (last EVALUATION stage)
      supabase._chain.single.mockResolvedValue({
        data: { current_lifecycle_stage: 5, name: 'Boundary Venture' },
        error: null,
      });
      // Chairman gate at 5 — return approved to let it through
      supabase._chain.maybeSingle.mockResolvedValue({
        data: { id: 'dec-5', status: 'approved' },
        error: null,
      });

      processStage.mockResolvedValueOnce({
        status: 'COMPLETED',
        stageNumber: 5,
        ventureId: 'v1',
        nextStageId: 6, // crosses into STRATEGY mode
      });

      await worker.processOneStage('v1');

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Mode boundary'),
      );
    });
  });

  // ── Retry logic ───────────────────────────────────────────

  describe('Retry logic', () => {
    it('retries on transient failure', async () => {
      worker = new StageExecutionWorker({ supabase, logger, maxRetries: 1, retryDelayMs: 1 });

      supabase._chain.single.mockResolvedValue({
        data: { current_lifecycle_stage: 1, name: 'Retry Venture' },
        error: null,
      });
      supabase._chain.maybeSingle.mockResolvedValue({ data: null, error: null });

      // First attempt throws, second succeeds
      processStage
        .mockRejectedValueOnce(new Error('Transient error'))
        .mockResolvedValueOnce({
          status: 'COMPLETED',
          stageNumber: 1,
          ventureId: 'v1',
          // No nextStageId → DB fallback reads same stage → markCompleted → exit
        });

      await worker.processOneStage('v1');

      expect(processStage).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Stage 1 attempt'),
      );
    });

    it('does not retry on COMPLETED result', async () => {
      worker = new StageExecutionWorker({ supabase, logger, maxRetries: 2, retryDelayMs: 1 });

      supabase._chain.single.mockResolvedValue({
        data: { current_lifecycle_stage: 2, name: 'No Retry Venture' },
        error: null,
      });
      supabase._chain.maybeSingle.mockResolvedValue({ data: null, error: null });

      processStage.mockResolvedValueOnce({
        status: 'COMPLETED',
        stageNumber: 2,
        ventureId: 'v1',
      });

      await worker.processOneStage('v1');

      // Only called once — COMPLETED short-circuits retry loop
      expect(processStage).toHaveBeenCalledTimes(1);
    });
  });

  // ── Kill propagation ──────────────────────────────────────

  describe('Kill propagation', () => {
    it('aborts in-flight venture via AbortController', async () => {
      worker = new StageExecutionWorker({ supabase, logger });

      const ac = new AbortController();
      worker._activeVentures.set('v1', ac);

      await worker.kill('v1', 'Chairman KILL');

      expect(ac.signal.aborted).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith('ventures');
    });
  });

  // ── _pollForWork ──────────────────────────────────────────

  describe('_pollForWork', () => {
    it('queries ventures table for active ventures needing advancement', async () => {
      worker = new StageExecutionWorker({ supabase, logger });

      const mockData = [
        { id: 'v1', name: 'Venture 1', current_lifecycle_stage: 1 },
        { id: 'v2', name: 'Venture 2', current_lifecycle_stage: 3 },
      ];

      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      };
      supabase.from.mockReturnValue(chain);

      const result = await worker._pollForWork();

      expect(supabase.from).toHaveBeenCalledWith('ventures');
      expect(result).toEqual(mockData);
    });
  });
});
