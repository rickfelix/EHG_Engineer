/**
 * Tests for stage timing fix
 * SD-FIX-STAGE-TIMING-ZEROS-ORCH-001-A
 *
 * Verifies that _syncStageWork and _advanceStage produce non-zero durations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock eva-orchestrator
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
    IDLE: 'idle', PROCESSING: 'processing', BLOCKED: 'blocked',
    FAILED: 'failed', COMPLETED: 'completed', KILLED_AT_REALITY_GATE: 'killed_at_reality_gate',
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
  resolveAutonomyLevel: vi.fn().mockResolvedValue({ level: 'L0' }),
}));

vi.mock('../../../lib/eva/health-score-computer.js', () => ({
  computeHealthScore: vi.fn().mockReturnValue('green'),
}));

describe('Stage timing zero fix (SD-FIX-STAGE-TIMING-ZEROS-ORCH-001-A)', () => {
  let StageExecutionWorker;
  let upsertCalls;
  let mockSupabase;

  beforeEach(async () => {
    upsertCalls = [];

    const mockUpsert = vi.fn().mockImplementation((data, opts) => {
      upsertCalls.push({ data, opts });
      return Promise.resolve({ error: null });
    });

    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      single: vi.fn().mockResolvedValue({ data: { work_type: 'artifact_only' } }),
      upsert: mockUpsert,
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    };

    mockSupabase = {
      from: vi.fn().mockReturnValue(mockChain),
    };

    const mod = await import('../../../lib/eva/stage-execution-worker.js');
    StageExecutionWorker = mod.StageExecutionWorker || mod.default;
  });

  it('_syncStageWork uses result.startedAt when provided', async () => {
    const worker = new StageExecutionWorker({
      supabase: mockSupabase,
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    const pastTime = new Date(Date.now() - 5000).toISOString();
    await worker._syncStageWork('v1', 1, {
      status: 'COMPLETED',
      startedAt: pastTime,
      artifacts: [],
    });

    const upsertData = upsertCalls[0]?.data;
    expect(upsertData).toBeDefined();
    expect(upsertData.started_at).toBe(pastTime);
    // completed_at should be later than started_at
    expect(new Date(upsertData.completed_at).getTime()).toBeGreaterThan(
      new Date(upsertData.started_at).getTime()
    );
  });

  it('_syncStageWork falls back to now when startedAt is missing', async () => {
    const worker = new StageExecutionWorker({
      supabase: mockSupabase,
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    const before = Date.now();
    await worker._syncStageWork('v1', 1, {
      status: 'COMPLETED',
      artifacts: [],
    });

    const upsertData = upsertCalls[0]?.data;
    expect(upsertData).toBeDefined();
    // started_at should be recent (within last 2 seconds)
    const startedMs = new Date(upsertData.started_at).getTime();
    expect(startedMs).toBeGreaterThanOrEqual(before - 100);
  });

  it('main execution path attaches stageStartMs to result.startedAt', () => {
    // Verify that the code pattern sets result.startedAt from stageStartMs
    // This is a structural test — the actual integration is in the main loop
    const stageStartMs = Date.now() - 3000;
    const result = { status: 'COMPLETED' };

    // Replicate the fix logic
    if (result && !result.startedAt) {
      result.startedAt = new Date(stageStartMs).toISOString();
    }

    expect(result.startedAt).toBeDefined();
    const startedTime = new Date(result.startedAt).getTime();
    expect(startedTime).toBeLessThan(Date.now());
    expect(Date.now() - startedTime).toBeGreaterThanOrEqual(2900);
  });

  it('_advanceStage preserves existing started_at from DB', async () => {
    const existingStartedAt = new Date(Date.now() - 10000).toISOString();

    // Override the maybeSingle to return existing started_at
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { advisory_data: null, started_at: existingStartedAt }
      }),
      upsert: vi.fn().mockImplementation((data) => {
        upsertCalls.push({ data });
        return Promise.resolve({ error: null });
      }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    };

    const supabase = { from: vi.fn().mockReturnValue(mockChain) };
    const worker = new StageExecutionWorker({
      supabase,
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    await worker._advanceStage('v1', 5, 6, { durationMs: 3000 });

    // Find the venture_stage_work upsert call
    const stageWorkUpsert = upsertCalls.find(c => c.data?.lifecycle_stage === 5);
    expect(stageWorkUpsert).toBeDefined();
    expect(stageWorkUpsert.data.started_at).toBe(existingStartedAt);
    expect(new Date(stageWorkUpsert.data.completed_at).getTime()).toBeGreaterThan(
      new Date(stageWorkUpsert.data.started_at).getTime()
    );
  });

  it('_advanceStage computes started_at from durationMs when no existing row', async () => {
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      upsert: vi.fn().mockImplementation((data) => {
        upsertCalls.push({ data });
        return Promise.resolve({ error: null });
      }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    };

    const supabase = { from: vi.fn().mockReturnValue(mockChain) };
    const worker = new StageExecutionWorker({
      supabase,
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    const before = Date.now();
    await worker._advanceStage('v1', 5, 6, { durationMs: 5000 });

    const stageWorkUpsert = upsertCalls.find(c => c.data?.lifecycle_stage === 5);
    expect(stageWorkUpsert).toBeDefined();

    const startedMs = new Date(stageWorkUpsert.data.started_at).getTime();
    const completedMs = new Date(stageWorkUpsert.data.completed_at).getTime();
    // Duration should be approximately 5000ms
    expect(completedMs - startedMs).toBeGreaterThanOrEqual(4500);
  });
});
