/**
 * SD-LEO-INFRA-STAGE-GATE-RETRY-001 (FR-1/FR-2 wiring): proves checkGateRetryCeiling() is
 * actually wired into _processVenture's real poll loop and honored there -- not just tested in
 * isolation against the gate-retry-guard.js module (TESTING finding, evidence
 * 11345782-ebd6-4e74-82ff-b0bd0342809c: "worker wiring has ZERO coverage... deleting the entire
 * checkGateRetryCeiling block left 572 files/7428 tests byte-identical to baseline").
 *
 * Mirrors the real-loop-driving pattern from
 * stage-execution-worker-venture-parked-override-guard.test.js: mock processStage() directly and
 * drive the REAL _processVenture loop via processOneStage().
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/eva/eva-orchestrator.js', () => ({ processStage: vi.fn() }));
vi.mock('../../../lib/eva/orchestrator-state-machine.js', () => ({
  acquireProcessingLock: vi.fn().mockResolvedValue({ acquired: true, lockId: 'lock-1', error: null }),
  releaseProcessingLock: vi.fn().mockResolvedValue({ released: true }),
  markCompleted: vi.fn().mockResolvedValue({ completed: true }),
  getOrchestratorState: vi.fn().mockResolvedValue({ state: 'processing' }),
  ORCHESTRATOR_STATES: { IDLE: 'idle', PROCESSING: 'processing', BLOCKED: 'blocked', FAILED: 'failed', COMPLETED: 'completed', KILLED_AT_REALITY_GATE: 'killed_at_reality_gate' },
}));
vi.mock('../../../lib/eva/chairman-decision-watcher.js', () => ({
  createOrReusePendingDecision: vi.fn(),
  waitForDecision: vi.fn(),
  isFixtureVenture: vi.fn().mockReturnValue(false),
  fetchVentureForFixtureCheck: vi.fn().mockResolvedValue({ id: 'v-retry', name: 'Retry Venture', is_demo: false }),
  isDecisionCreatingStage: vi.fn().mockResolvedValue({ creates_decision: false }),
  extractGateQuality: vi.fn().mockReturnValue(null),
}));
vi.mock('../../../lib/eva/shared-services.js', () => ({ emit: vi.fn().mockResolvedValue({}) }));

let govState = { isReview: false, isBlocking: false, isKill: false, isPromotion: false, isHighConsequence: false };
vi.mock('../../../lib/eva/stage-governance.js', () => ({
  getStageGovernance: vi.fn(async () => ({
    isReview: (_n) => govState.isReview,
    isBlocking: (_n) => govState.isBlocking,
    isKill: (_n) => govState.isKill,
    isPromotion: (_n) => govState.isPromotion,
    isHighConsequence: (_n) => govState.isHighConsequence,
    // SD-LEO-INFRA-STAGE-RENUMBER-DRIFT-001: _processVenture reads maxStageNumber directly
    // (no longer a hardcoded MAX_STAGE literal) -- omitting it made `currentStage <= maxStage`
    // compare against `undefined` (always false), silently short-circuiting the whole loop.
    maxStageNumber: 27,
  })),
}));
vi.mock('../../../lib/eva/autonomy-model.js', () => ({
  checkAutonomy: vi.fn().mockResolvedValue({ action: 'auto_approve', level: 'L4' }),
}));

import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';
import { processStage } from '../../../lib/eva/eva-orchestrator.js';

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };
const STAGE = 21;

/** @param {{attemptCount:number, lastAttemptAt:string|null}} attemptState */
function makeSupabase(attemptState) {
  const queriedTables = [];
  const ventureUpdates = [];
  const from = (table) => {
    queriedTables.push(table);
    if (table === 'ventures') {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: { current_lifecycle_stage: STAGE, name: 'Retry Venture', metadata: {} }, error: null }) }) }),
        update: (payload) => { ventureUpdates.push(payload); return { eq: async () => ({ error: null }) }; },
      };
    }
    if (table === 'eva_stage_gate_attempts') {
      return {
        select: (_cols, opts) => {
          if (opts?.head) {
            return { eq: () => ({ eq: async () => ({ count: attemptState.attemptCount, error: null }) }) };
          }
          return {
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: attemptState.lastAttemptAt ? { created_at: attemptState.lastAttemptAt } : null, error: null }),
                  }),
                }),
              }),
            }),
          };
        },
      };
    }
    if (table === 'chairman_decisions') {
      const chain = {
        select: () => chain, eq: () => chain, neq: () => chain, limit: () => chain, order: () => chain,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
      };
      return chain;
    }
    const chain = {
      select: () => chain, eq: () => chain, neq: () => chain, in: () => chain,
      gt: () => chain, lt: () => chain, order: () => chain, limit: () => chain,
      update: () => chain,
      insert: async () => ({ data: null, error: null }),
      upsert: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: null, error: null }),
    };
    return chain;
  };
  return { supabase: { from: vi.fn(from), rpc: vi.fn(async () => ({ data: null, error: null })) }, queriedTables, ventureUpdates };
}

function makeWorker(supabase) {
  const worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999, maxRetries: 0, retryDelayMs: 1 });
  worker._checkGovernanceOverride = vi.fn().mockResolvedValue(null);
  worker._isInHardGateStages = vi.fn().mockResolvedValue(false);
  worker._syncStageWork = vi.fn().mockResolvedValue(undefined);
  worker._logStageTransition = vi.fn().mockResolvedValue(undefined);
  worker._writeHealthScore = vi.fn().mockResolvedValue(undefined);
  worker._advanceStage = vi.fn().mockResolvedValue({ blocked: false });
  worker._canAutoAdvance = vi.fn().mockResolvedValue(true);
  return worker;
}

describe('checkGateRetryCeiling wiring in the real _processVenture loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    govState = { isReview: false, isBlocking: false, isKill: false, isPromotion: false, isHighConsequence: false };
  });

  it('terminalizes and stops BEFORE processStage/chairman_decisions are ever reached, when attempts are at the ceiling', async () => {
    const { supabase, queriedTables, ventureUpdates } = makeSupabase({ attemptCount: 20, lastAttemptAt: '2026-08-24T20:48:18Z' });
    const worker = makeWorker(supabase);

    const result = await worker.processOneStage('v-retry');

    expect(result.status).toBe('blocked');
    expect(result.gate).toBe('gate_retry_ceiling_exceeded');
    expect(result.attemptCount).toBe(20);
    expect(processStage).not.toHaveBeenCalled();
    expect(worker._advanceStage).not.toHaveBeenCalled();
    expect(queriedTables).not.toContain('chairman_decisions');
    expect(ventureUpdates).toHaveLength(1);
    expect(ventureUpdates[0].metadata.gating_decision.parked).toBe(true);
  });

  it('skips (backoff) and stops BEFORE processStage, without touching ventures.metadata, when within a backoff window', async () => {
    const { supabase, queriedTables, ventureUpdates } = makeSupabase({ attemptCount: 5, lastAttemptAt: new Date().toISOString() });
    const worker = makeWorker(supabase);

    const result = await worker.processOneStage('v-retry');

    expect(result.status).toBe('backoff_skip');
    expect(processStage).not.toHaveBeenCalled();
    expect(queriedTables).not.toContain('chairman_decisions');
    expect(ventureUpdates).toHaveLength(0);
  });

  it('regression control: a venture below the backoff start proceeds to processStage normally (the guard does not block ordinary ventures)', async () => {
    processStage.mockResolvedValueOnce({ ventureId: 'v-retry', stageId: STAGE, status: 'COMPLETED' });
    const { supabase } = makeSupabase({ attemptCount: 1, lastAttemptAt: null });
    const worker = makeWorker(supabase);

    await worker.processOneStage('v-retry');

    expect(processStage).toHaveBeenCalled();
  });
});
