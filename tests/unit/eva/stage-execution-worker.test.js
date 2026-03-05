/**
 * Tests for StageExecutionWorker
 * SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-D
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';

// Mock stage-execution-engine
vi.mock('../../../lib/eva/stage-execution-engine.js', () => ({
  executeStage: vi.fn(),
}));

// Mock chairman-decision-watcher
vi.mock('../../../lib/eva/chairman-decision-watcher.js', () => ({
  createOrReusePendingDecision: vi.fn(),
  waitForDecision: vi.fn(),
}));

import { executeStage } from '../../../lib/eva/stage-execution-engine.js';
import { createOrReusePendingDecision } from '../../../lib/eva/chairman-decision-watcher.js';

function createMockSupabase(overrides = {}) {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
  };

  // Make all chainable methods return the chain
  for (const key of Object.keys(mockChain)) {
    if (key !== 'maybeSingle' && key !== 'single') {
      mockChain[key].mockReturnValue(mockChain);
    }
  }

  return {
    from: vi.fn().mockReturnValue(mockChain),
    _chain: mockChain,
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
  });

  afterEach(() => {
    if (worker) worker.stop();
  });

  describe('constructor', () => {
    it('throws without supabase', () => {
      expect(() => new StageExecutionWorker({ logger }))
        .toThrow('supabase client is required');
    });

    it('creates with defaults', () => {
      worker = new StageExecutionWorker({ supabase, logger });
      expect(worker.pollIntervalMs).toBe(30_000);
      expect(worker.maxRetries).toBe(2);
      expect(worker.activeVentures.size).toBe(0);
    });

    it('accepts custom poll interval', () => {
      worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 5000 });
      expect(worker.pollIntervalMs).toBe(5000);
    });
  });

  describe('start/stop', () => {
    it('starts and stops cleanly', () => {
      worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 60000 });
      worker.start();
      expect(worker._running).toBe(true);
      worker.stop();
      expect(worker._running).toBe(false);
    });

    it('aborts active ventures on stop', () => {
      worker = new StageExecutionWorker({ supabase, logger });
      const ac = new AbortController();
      worker.activeVentures.set('venture-1', ac);
      worker.stop();
      expect(ac.signal.aborted).toBe(true);
      expect(worker.activeVentures.size).toBe(0);
    });
  });

  describe('processVenture - sequential advancement', () => {
    it('advances venture from stage N to N+1 on success', async () => {
      worker = new StageExecutionWorker({ supabase, logger });

      executeStage.mockResolvedValue({
        stageNumber: 1,
        ventureId: 'v1',
        persisted: true,
        artifactId: 'art-1',
        latencyMs: 100,
        validation: { valid: true, errors: [] },
      });

      // Mock _fetchPendingVentures won't be called directly
      // Mock update/upsert chains
      supabase._chain.maybeSingle.mockResolvedValue({ data: null, error: null });

      await worker.processVenture('v1', 1);

      // Should have called executeStage
      expect(executeStage).toHaveBeenCalledWith(expect.objectContaining({
        stageNumber: 1,
        ventureId: 'v1',
      }));

      // Should have called supabase.from for updates
      expect(supabase.from).toHaveBeenCalled();
    });

    it('does not advance past MAX_STAGES (25)', async () => {
      worker = new StageExecutionWorker({ supabase, logger });

      // Stage 25 is not a chairman gate, but is a mode transition stage
      // Mock mode transition check to pass
      supabase._chain.maybeSingle.mockResolvedValue({
        data: { id: 'dec-1', status: 'approved', decision: 'approve' },
        error: null,
      });

      executeStage.mockResolvedValue({
        stageNumber: 25,
        persisted: true,
        artifactId: 'art-25',
        latencyMs: 50,
        validation: { valid: true, errors: [] },
      });

      await worker.processVenture('v1', 25);

      // Should mark venture completed, not create stage 26
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('completed all 25 stages')
      );
    });

    it('marks stage failed when execution fails', async () => {
      worker = new StageExecutionWorker({ supabase, logger, maxRetries: 0 });

      executeStage.mockRejectedValue(new Error('LLM timeout'));

      // Use stage 1 (not a chairman gate)
      await worker.processVenture('v1', 1);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error processing venture v1')
      );
    });
  });

  describe('Chairman gate blocking', () => {
    it('blocks at gate stage when no decision exists', async () => {
      worker = new StageExecutionWorker({ supabase, logger });

      // No existing decision
      supabase._chain.maybeSingle.mockResolvedValue({ data: null, error: null });
      createOrReusePendingDecision.mockResolvedValue({ id: 'dec-1', isNew: true });

      await worker.processVenture('v1', 3); // Stage 3 is a chairman gate

      expect(createOrReusePendingDecision).toHaveBeenCalledWith(expect.objectContaining({
        ventureId: 'v1',
        stageNumber: 3,
      }));

      // Should NOT have called executeStage (blocked)
      expect(executeStage).not.toHaveBeenCalled();
    });

    it('proceeds when gate is approved', async () => {
      worker = new StageExecutionWorker({ supabase, logger });

      // Existing approved decision
      supabase._chain.maybeSingle.mockResolvedValue({
        data: { id: 'dec-1', status: 'approved', decision: 'approve' },
        error: null,
      });

      executeStage.mockResolvedValue({
        stageNumber: 3,
        persisted: true,
        artifactId: 'art-3',
        latencyMs: 100,
        validation: { valid: true, errors: [] },
      });

      await worker.processVenture('v1', 3);

      expect(executeStage).toHaveBeenCalled();
    });

    it('kills venture on KILL decision', async () => {
      worker = new StageExecutionWorker({ supabase, logger });

      supabase._chain.maybeSingle.mockResolvedValue({
        data: { id: 'dec-1', status: 'resolved', decision: 'kill' },
        error: null,
      });

      await worker.processVenture('v1', 5);

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('KILL venture v1')
      );
      expect(executeStage).not.toHaveBeenCalled();
    });

    it('identifies all chairman gate stages correctly', () => {
      worker = new StageExecutionWorker({ supabase, logger });
      const gates = [3, 5, 10, 17, 18, 22, 24];
      const nonGates = [1, 2, 4, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 19, 20, 21, 23, 25];

      for (const stage of gates) {
        expect(worker._isChairmanGate(stage)).toBe(true);
      }
      for (const stage of nonGates) {
        expect(worker._isChairmanGate(stage)).toBe(false);
      }
    });
  });

  describe('Operating mode enforcement', () => {
    it('returns correct mode for each stage range', () => {
      expect(StageExecutionWorker.getMode(0)).toBe('EVALUATION');
      expect(StageExecutionWorker.getMode(10)).toBe('EVALUATION');
      expect(StageExecutionWorker.getMode(17)).toBe('EVALUATION');
      expect(StageExecutionWorker.getMode(18)).toBe('BUILD');
      expect(StageExecutionWorker.getMode(22)).toBe('BUILD');
      expect(StageExecutionWorker.getMode(23)).toBe('LAUNCH');
      expect(StageExecutionWorker.getMode(25)).toBe('LAUNCH');
      expect(StageExecutionWorker.getMode(26)).toBe('OPERATIONS');
    });

    it('blocks mode transition without Chairman approval', async () => {
      worker = new StageExecutionWorker({ supabase, logger });

      // No decision for boundary stage
      supabase._chain.maybeSingle.mockResolvedValue({ data: null, error: null });

      await worker.processVenture('v1', 17); // Mode boundary

      // Stage 17 is also a chairman gate, so it gets blocked there first
      expect(executeStage).not.toHaveBeenCalled();
    });
  });

  describe('Retry logic', () => {
    it('retries on transient failure with backoff', async () => {
      worker = new StageExecutionWorker({ supabase, logger, maxRetries: 1 });

      executeStage
        .mockRejectedValueOnce(new Error('Transient error'))
        .mockResolvedValueOnce({
          stageNumber: 1,
          persisted: true,
          artifactId: 'art-1',
          latencyMs: 200,
          validation: { valid: true, errors: [] },
        });

      await worker.processVenture('v1', 1);

      expect(executeStage).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('attempt 1/2 failed')
      );
    });

    it('does not retry on contract violation', async () => {
      worker = new StageExecutionWorker({ supabase, logger, maxRetries: 2 });

      executeStage.mockResolvedValue({
        stageNumber: 2,
        persisted: false,
        contractViolation: true,
        contractErrors: ['Missing upstream data'],
        validation: { valid: false, errors: ['contract'] },
      });

      await worker.processVenture('v1', 2);

      expect(executeStage).toHaveBeenCalledTimes(1); // No retry
    });
  });

  describe('Kill propagation', () => {
    it('aborts in-flight venture via AbortController', async () => {
      worker = new StageExecutionWorker({ supabase, logger });

      // Set up a fake active venture
      const ac = new AbortController();
      worker.activeVentures.set('v1', ac);

      await worker._killVenture('v1', 5, 'Chairman KILL');

      expect(ac.signal.aborted).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith('ventures');
    });
  });

  describe('_fetchPendingVentures', () => {
    it('queries venture_stage_work for pending stages', async () => {
      worker = new StageExecutionWorker({ supabase, logger });

      // Override the chain to return data at the end
      const mockData = [
        { venture_id: 'v1', lifecycle_stage: 1 },
        { venture_id: 'v2', lifecycle_stage: 3 },
      ];

      // Need to make the full chain resolve
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      };
      supabase.from.mockReturnValue(chain);

      const result = await worker._fetchPendingVentures();

      expect(supabase.from).toHaveBeenCalledWith('venture_stage_work');
      expect(result).toEqual(mockData);
    });
  });
});
