/**
 * Tests for Stage Execution Record Methods
 * SD-VW-BACKEND-EXEC-RECORDS-001
 *
 * Covers: _createStageExecution, _updateExecutionHeartbeat,
 *         _finalizeStageExecution, _markStaleExecutions,
 *         and integration with _executeWithRetry heartbeat lifecycle.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';

// Mock dependencies
vi.mock('../../../lib/eva/eva-orchestrator.js', () => ({
  processStage: vi.fn(),
}));

vi.mock('../../../lib/eva/orchestrator-state-machine.js', () => ({
  acquireProcessingLock: vi.fn().mockResolvedValue({ acquired: false }),
  releaseProcessingLock: vi.fn().mockResolvedValue({}),
  markCompleted: vi.fn().mockResolvedValue({}),
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

vi.mock('../../../lib/eva/chairman-decision-watcher.js', () => ({
  createOrReusePendingDecision: vi.fn(),
  waitForDecision: vi.fn(),
}));

vi.mock('../../../lib/eva/shared-services.js', () => ({
  emit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../lib/eva/autonomy-model.js', () => ({
  checkAutonomy: vi.fn().mockResolvedValue({ action: 'require_approval', level: 'L0' }),
}));

import { processStage } from '../../../lib/eva/eva-orchestrator.js';

/**
 * Create a mock Supabase client that tracks calls per table.
 * Returns configurable results per table-operation combo.
 */
function createMockSupabase(tableResults = {}) {
  const calls = [];

  function makeChain(tableName) {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      lt: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      insert: vi.fn((data) => {
        calls.push({ table: tableName, op: 'insert', data });
        return chain;
      }),
      update: vi.fn((data) => {
        calls.push({ table: tableName, op: 'update', data });
        return chain;
      }),
      upsert: vi.fn((data) => {
        calls.push({ table: tableName, op: 'upsert', data });
        const result = tableResults[`${tableName}:upsert`] || { data: null, error: null };
        return Promise.resolve(result);
      }),
      single: vi.fn(() => {
        const result = tableResults[`${tableName}:single`] || { data: { id: 'mock-exec-id' }, error: null };
        return Promise.resolve(result);
      }),
      maybeSingle: vi.fn(() => {
        const result = tableResults[`${tableName}:maybeSingle`] || { data: null, error: null };
        return Promise.resolve(result);
      }),
    };
    return chain;
  }

  return {
    from: vi.fn((tableName) => makeChain(tableName)),
    _calls: calls,
  };
}

function createMockLogger() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };
}

describe('Stage Execution Records (SD-VW-BACKEND-EXEC-RECORDS-001)', () => {
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

  describe('_createStageExecution', () => {
    it('inserts a stage_executions record with correct fields', async () => {
      worker = new StageExecutionWorker({ supabase, logger });
      const execId = await worker._createStageExecution('venture-123', 5);

      expect(execId).toBe('mock-exec-id');

      // Verify insert was called on stage_executions table
      const insertCall = supabase._calls.find(c => c.table === 'stage_executions' && c.op === 'insert');
      expect(insertCall).toBeTruthy();
      expect(insertCall.data.venture_id).toBe('venture-123');
      expect(insertCall.data.lifecycle_stage).toBe(5);
      expect(insertCall.data.status).toBe('running');
      expect(insertCall.data.worker_id).toMatch(/^sew-/);
      expect(insertCall.data.started_at).toBeDefined();
      expect(insertCall.data.heartbeat_at).toBeDefined();
    });

    it('returns null on insert error without crashing', async () => {
      supabase = createMockSupabase({
        'stage_executions:single': { data: null, error: { message: 'insert failed' } },
      });
      worker = new StageExecutionWorker({ supabase, logger });

      const execId = await worker._createStageExecution('venture-123', 5);
      expect(execId).toBeNull();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('_updateExecutionHeartbeat', () => {
    it('updates heartbeat_at on a running execution', async () => {
      worker = new StageExecutionWorker({ supabase, logger });
      await worker._updateExecutionHeartbeat('exec-id-123');

      const updateCall = supabase._calls.find(c => c.table === 'stage_executions' && c.op === 'update');
      expect(updateCall).toBeTruthy();
      expect(updateCall.data.heartbeat_at).toBeDefined();
    });
  });

  describe('_finalizeStageExecution', () => {
    it('sets status to succeeded with completed_at', async () => {
      worker = new StageExecutionWorker({ supabase, logger });
      await worker._finalizeStageExecution('exec-id-123', 'succeeded', null);

      const updateCall = supabase._calls.find(c => c.table === 'stage_executions' && c.op === 'update');
      expect(updateCall).toBeTruthy();
      expect(updateCall.data.status).toBe('succeeded');
      expect(updateCall.data.completed_at).toBeDefined();
      expect(updateCall.data.error_message).toBeNull();
    });

    it('sets status to failed with error_message', async () => {
      worker = new StageExecutionWorker({ supabase, logger });
      await worker._finalizeStageExecution('exec-id-123', 'failed', 'Stage processing error');

      const updateCall = supabase._calls.find(c => c.table === 'stage_executions' && c.op === 'update');
      expect(updateCall).toBeTruthy();
      expect(updateCall.data.status).toBe('failed');
      expect(updateCall.data.error_message).toBe('Stage processing error');
    });
  });

  describe('_markStaleExecutions', () => {
    it('marks running executions with stale heartbeats as timed_out', async () => {
      const staleExec = {
        id: 'stale-exec-1',
        venture_id: 'venture-1',
        lifecycle_stage: 3,
        worker_id: 'sew-old-worker',
        heartbeat_at: new Date(Date.now() - 600_000).toISOString(), // 10 min ago
      };

      // Override to return stale executions on select
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockResolvedValue({ data: [staleExec], error: null }),
        update: vi.fn().mockReturnThis(),
      };
      supabase.from = vi.fn((table) => {
        if (table === 'stage_executions') return chain;
        return createMockSupabase().from(table);
      });

      worker = new StageExecutionWorker({ supabase, logger, staleLockThresholdMs: 300_000 });
      await worker._markStaleExecutions();

      // Should have logged a warning about stale execution
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Marking stale execution'));

      // Should have called update with timed_out status
      const updateCall = chain.update.mock.calls[0]?.[0];
      expect(updateCall?.status).toBe('timed_out');
      expect(updateCall?.completed_at).toBeDefined();
      expect(updateCall?.error_message).toContain('Stale heartbeat');
    });

    it('does nothing when no stale executions found', async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockResolvedValue({ data: [], error: null }),
        update: vi.fn().mockReturnThis(),
      };
      supabase.from = vi.fn(() => chain);

      worker = new StageExecutionWorker({ supabase, logger });
      await worker._markStaleExecutions();

      expect(chain.update).not.toHaveBeenCalled();
    });
  });

  describe('_executeWithRetry integration', () => {
    it('creates execution record and finalizes on success', async () => {
      processStage.mockResolvedValue({ status: 'COMPLETED', nextStageId: 2 });

      worker = new StageExecutionWorker({ supabase, logger, maxRetries: 0, execHeartbeatMs: 60_000 });
      const result = await worker._executeWithRetry('venture-123', 1);

      expect(result.status).toBe('COMPLETED');

      // Verify execution record was created
      const insertCalls = supabase._calls.filter(c => c.table === 'stage_executions' && c.op === 'insert');
      expect(insertCalls.length).toBe(1);
      expect(insertCalls[0].data.status).toBe('running');

      // Verify execution was finalized
      const updateCalls = supabase._calls.filter(c => c.table === 'stage_executions' && c.op === 'update');
      expect(updateCalls.length).toBeGreaterThanOrEqual(1);
      const finalizeCall = updateCalls.find(c => c.data.status === 'succeeded');
      expect(finalizeCall).toBeTruthy();
    });

    it('creates execution record and finalizes on failure', async () => {
      processStage.mockRejectedValue(new Error('Stage blew up'));

      worker = new StageExecutionWorker({ supabase, logger, maxRetries: 0, execHeartbeatMs: 60_000 });
      const result = await worker._executeWithRetry('venture-123', 1);

      expect(result.status).toBe('failed');

      // Verify execution was finalized with failed status
      const updateCalls = supabase._calls.filter(c => c.table === 'stage_executions' && c.op === 'update');
      const failCall = updateCalls.find(c => c.data.status === 'failed');
      expect(failCall).toBeTruthy();
    });
  });
});
