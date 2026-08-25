/**
 * SD-LEO-INFRA-APEXNICHE-STAGE-RUNAWAY-001 (adversarial peer review, blocked-consumer-sweep).
 *
 * processStage()'s new VENTURE_PARKED early return (eva-orchestrator.js) returns
 * status='BLOCKED'. The worker's governance-override branch (~line 1450-1516) treats ANY
 * BLOCKED/FAILED result as override-eligible UNLESS result.errors matches the isContractBlock
 * check (MISSING_DEPENDENCY / 'upstream' / 'missing'). VENTURE_PARKED matched none of those, so
 * a venture parked at an ORDINARY (non-hard-gate) stage would be silently governance-overridden
 * and advanced past the park the moment `_canAutoAdvance()` returns true (e.g. once
 * global_auto_proceed flips on company-wide) -- the exact venture this SD's guard exists to
 * freeze. Fixed by adding a sibling `isVenturePark` check alongside `isContractBlock`.
 *
 * Mirrors the real-loop-driving pattern from
 * stage-execution-worker-high-consequence-mint.test.js: mock processStage() directly and drive
 * the REAL _processVenture loop via processOneStage(), rather than re-testing eva-orchestrator.js
 * in isolation (already covered in tests/unit/eva/eva-orchestrator.test.js).
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
  fetchVentureForFixtureCheck: vi.fn().mockResolvedValue({ id: 'v-parked', name: 'Parked Venture', is_demo: false }),
  isDecisionCreatingStage: vi.fn().mockResolvedValue({ creates_decision: false }),
  extractGateQuality: vi.fn().mockReturnValue(null),
}));
vi.mock('../../../lib/eva/shared-services.js', () => ({ emit: vi.fn().mockResolvedValue({}) }));

// All-false governance: a plain, ordinary, non-gate stage — the exact case where the pre-fix
// bug bites (a hard-gate stage would already be blocked by _canAutoAdvance's kill_promotion_gate
// layer regardless of this guard).
let govState = { isReview: false, isBlocking: false, isKill: false, isPromotion: false, isHighConsequence: false };
vi.mock('../../../lib/eva/stage-governance.js', () => ({
  getStageGovernance: vi.fn(async () => ({
    isReview: (n) => govState.isReview,
    isBlocking: (n) => govState.isBlocking,
    isKill: (n) => govState.isKill,
    isPromotion: (n) => govState.isPromotion,
    isHighConsequence: (n) => govState.isHighConsequence,
  })),
}));
vi.mock('../../../lib/eva/autonomy-model.js', () => ({
  checkAutonomy: vi.fn().mockResolvedValue({ action: 'auto_approve', level: 'L4' }),
}));

import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';
import { processStage } from '../../../lib/eva/eva-orchestrator.js';

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };
const STAGE = 7; // ordinary, non-special stage (not 18-23) — matches the sibling HC test's convention.

function makeSupabase() {
  const from = (table) => {
    if (table === 'ventures') {
      const chain = {
        select: () => chain, eq: () => chain, update: () => chain,
        single: async () => ({ data: { current_lifecycle_stage: STAGE, name: 'V' }, error: null }),
        maybeSingle: async () => ({ data: { current_lifecycle_stage: STAGE, name: 'V' }, error: null }),
      };
      return chain;
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
  return { from: vi.fn(from), rpc: vi.fn(async () => ({ data: null, error: null })) };
}

function makeWorker(supabase) {
  const worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999, maxRetries: 0, retryDelayMs: 1 });
  worker._checkGovernanceOverride = vi.fn().mockResolvedValue(null);
  worker._isInHardGateStages = vi.fn().mockResolvedValue(false);
  worker._syncStageWork = vi.fn().mockResolvedValue(undefined);
  worker._logStageTransition = vi.fn().mockResolvedValue(undefined);
  worker._writeHealthScore = vi.fn().mockResolvedValue(undefined);
  worker._advanceStage = vi.fn().mockResolvedValue({ blocked: false });
  // The load-bearing precondition for this test class: governance WOULD approve advancing an
  // ordinary stage (mirrors global_auto_proceed=true) — the ONLY thing that should stop the
  // advance for a VENTURE_PARKED result is the new isVenturePark guard, not this predicate.
  worker._canAutoAdvance = vi.fn().mockResolvedValue(true);
  return worker;
}

describe('VENTURE_PARKED governance-override guard (SD-LEO-INFRA-APEXNICHE-STAGE-RUNAWAY-001)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    govState = { isReview: false, isBlocking: false, isKill: false, isPromotion: false, isHighConsequence: false };
  });

  it('does NOT governance-override / advance a VENTURE_PARKED BLOCKED result, even when _canAutoAdvance approves', async () => {
    processStage.mockResolvedValueOnce({
      ventureId: 'v-parked',
      stageId: STAGE,
      status: 'BLOCKED',
      errors: [{ code: 'VENTURE_PARKED', message: 'Venture stage-motion is parked: test park (unpark: test trigger)' }],
    });

    const worker = makeWorker(makeSupabase());
    const result = await worker.processOneStage('v-parked');

    // This branch (stage-execution-worker.js ~1509-1515) deliberately does not build a custom
    // lastResult literal -- it leaves the earlier `lastResult = result` (line ~1208) assignment
    // in place, so the raw processStage() result (uppercase STATUS.BLOCKED) passes through
    // unchanged. The load-bearing assertion is that governance never overrides it.
    expect(worker._advanceStage).not.toHaveBeenCalled();
    expect(result.status).toBe('BLOCKED');
    expect(result.stageId).toBe(STAGE); // never advanced past the parked stage
  });

  it('regression control: a BLOCKED result WITHOUT VENTURE_PARKED still governance-overrides and advances (pre-existing behavior preserved)', async () => {
    processStage.mockResolvedValueOnce({
      status: 'BLOCKED',
      errors: [{ code: 'SOME_OTHER_GATE_BLOCK', message: 'unrelated business-rule block' }],
    });

    const worker = makeWorker(makeSupabase());
    const result = await worker.processOneStage('v-parked');

    expect(worker._advanceStage).toHaveBeenCalledWith('v-parked', STAGE, STAGE + 1, expect.anything());
  });
});

describe('VENTURE_PARKED entry-point guard in _processVenture (2nd pass -- live post-merge incident)', () => {
  // Live post-merge verification found eva_stage_gate_attempts STILL growing for the real
  // ApexNiche venture, through a full code merge AND a leo-stack daemon restart. Root cause: the
  // "P0 UNIVERSAL pre-execution guard" (stage-execution-worker.js ~826-869) runs unconditionally
  // on EVERY poll for any venture with an approved chairman_decisions row, calling
  // recordGateOverride() -> recordGateAttempt() -- a fresh eva_stage_gate_attempts INSERT --
  // entirely BEFORE processStage() is ever considered, via the "already approved + has
  // artifacts -- skipping processStage, advancing" shortcut. The processStage()-internal guard
  // (tested above) never had a chance to run for this exact, real-world shape. This describe
  // block reproduces that exact shape (approved chairman_decisions row + existing artifacts,
  // matching ApexNiche's live stage-21 kill-gate state) and proves the NEW entry-point guard
  // (top of _processVenture, right after the venture fetch) stops it before chairman_decisions
  // is ever queried.
  beforeEach(() => {
    vi.clearAllMocks();
    govState = { isReview: false, isBlocking: false, isKill: false, isPromotion: false, isHighConsequence: false };
  });

  function makeVulnerableSupabase(ventureRow) {
    const queriedTables = [];
    const from = vi.fn((table) => {
      queriedTables.push(table);
      if (table === 'ventures') {
        const chain = {
          select: () => chain, eq: () => chain, update: () => chain,
          single: async () => ({ data: ventureRow, error: null }),
          maybeSingle: async () => ({ data: ventureRow, error: null }),
        };
        return chain;
      }
      if (table === 'chairman_decisions') {
        // If reached, this is the REAL live shape: an approved, non-advisory decision for this
        // venture+stage (ApexNiche's chairman override 7c706688) -- exactly what feeds the
        // vulnerable "already approved + has artifacts" shortcut.
        const chain = {
          select: () => chain, eq: () => chain, neq: () => chain, limit: () => chain, order: () => chain,
          maybeSingle: async () => ({ data: { id: 'decision-7c706688', status: 'approved', updated_at: new Date().toISOString() }, error: null }),
          single: async () => ({ data: { id: 'decision-7c706688', status: 'approved', updated_at: new Date().toISOString(), decided_by: 'chairman', rationale: 'override' }, error: null }),
        };
        return chain;
      }
      if (table === 'venture_artifacts') {
        // Existing artifacts -- the second precondition of the vulnerable shortcut.
        const chain = {
          select: () => chain, eq: () => chain, limit: () => chain,
          maybeSingle: async () => ({ data: { artifact_data: {} }, error: null }),
        };
        // .limit(1) resolves as an array in the real shortcut's `existingArt.length > 0` check.
        chain.limit = () => Promise.resolve({ data: [{ id: 'art-1' }], error: null });
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
    });
    return { supabase: { from, rpc: vi.fn(async () => ({ data: null, error: null })) }, queriedTables };
  }

  it('freezes a parked venture BEFORE the P0 universal pre-execution guard ever queries chairman_decisions', async () => {
    const parkedVentureRow = {
      current_lifecycle_stage: STAGE,
      name: 'ApexNiche-shaped Venture',
      metadata: {
        gating_decision: {
          decision: 'PARKED pending class fix',
          parked: true,
          by: 'SD-LEO-INFRA-APEXNICHE-STAGE-RUNAWAY-001',
          at: '2026-08-24T18:50:31.326Z',
          unpark_trigger: 'SD-LEO-INFRA-STAGE-GATE-RETRY-001 shipped + stage-21 gate re-evaluated once',
        },
      },
    };
    const { supabase, queriedTables } = makeVulnerableSupabase(parkedVentureRow);
    const worker = makeWorker(supabase);

    const result = await worker.processOneStage('v-apexniche-shaped');

    expect(result.status).toBe('blocked');
    expect(result.gate).toBe('venture_parked');
    expect(processStage).not.toHaveBeenCalled();
    expect(worker._advanceStage).not.toHaveBeenCalled();
    // The load-bearing assertion: the vulnerable P0 block's own trigger query never runs.
    expect(queriedTables).not.toContain('chairman_decisions');
    expect(queriedTables).not.toContain('venture_artifacts');
  });

  it('regression control: an UNPARKED venture with the same approved-decision shape still takes the vulnerable shortcut (pre-existing behavior preserved)', async () => {
    const unparkedVentureRow = {
      current_lifecycle_stage: STAGE,
      name: 'ApexNiche-shaped Venture',
      metadata: {}, // no gating_decision at all
    };
    const { supabase, queriedTables } = makeVulnerableSupabase(unparkedVentureRow);
    const worker = makeWorker(supabase);

    await worker.processOneStage('v-apexniche-shaped');

    // Proves makeVulnerableSupabase() genuinely reaches the P0 block absent the guard --
    // the prior test's zero-query result is the guard's doing, not a fixture artifact.
    expect(queriedTables).toContain('chairman_decisions');
  });
});
