/**
 * SD-LEO-FIX-RETRO-ACTION-ITEMS-001 (FR-3) — pending-decision auto-approve RPC error handling
 * in stage-execution-worker.js _processVenture() poll loop.
 *
 * Bug: inside the pending-decision auto-approve shortcut, the worker captured
 * `const { error: _approveErr } = await this._supabase.rpc('fn_chairman_decide', {...})` but only
 * logged it as a non-fatal warning — execution unconditionally proceeded to `_advanceStage()` and
 * `continue`d to the next stage regardless of the RPC outcome. When the DB trigger
 * reject_s16_programmatic_approval (or any other DB-side rejection) rejected the approval, the
 * worker advanced the venture as though the decision were approved — a code/DB state divergence.
 *
 * Fix: the artifact-enrichment + `_advanceStage()` + `continue` logic now runs only in an `else`
 * branch when `_approveErr` is falsy. On a truthy `_approveErr` the worker logs and falls through
 * (no `_advanceStage`, no `continue`), landing in the existing still-pending handling so the
 * decision is retried on the next poll instead of a false advance.
 *
 * These tests drive the REAL _processVenture() loop (via processOneStage) for a single stage that
 * has a pending decision and is eligible for auto-approve, and assert whether _advanceStage runs.
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
  createOrReusePendingDecision: vi.fn(), waitForDecision: vi.fn(),
  isFixtureVenture: vi.fn().mockReturnValue(false),
  fetchVentureForFixtureCheck: vi.fn().mockResolvedValue({ id: 'v-7', name: 'Real Venture', is_demo: false }),
}));
vi.mock('../../../lib/eva/shared-services.js', () => ({ emit: vi.fn().mockResolvedValue({}) }));
vi.mock('../../../lib/eva/autonomy-model.js', () => ({ checkAutonomy: vi.fn().mockResolvedValue({ action: 'block', level: 'L0' }) }));
// Force the current stage to be treated as a pre-execution (review) gate so the pending-decision
// shortcut is reachable — isReview()=true short-circuits the isPreExecGate check.
vi.mock('../../../lib/eva/stage-governance.js', () => ({
  getStageGovernance: vi.fn().mockResolvedValue({ isReview: () => true, isBlocking: () => false }),
}));

import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };

const STAGE = 7; // non-special stage (not 19/20), STRATEGY mode — avoids the stage-specific guards.
const PENDING = { id: 'dec-7', status: 'pending' };

/**
 * Per-table supabase fake. chairman_decisions distinguishes the "already approved?" universal check
 * (status='approved' → none) from the "pending decision?" shortcut lookup (status='pending' → PENDING).
 */
function makeSupabase(rpcResult) {
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
      let statusFilter = null;
      const chain = {
        select: () => chain,
        eq: (col, val) => { if (col === 'status') statusFilter = val; return chain; },
        neq: () => chain, limit: () => chain, order: () => chain,
        maybeSingle: async () => ({ data: statusFilter === 'pending' ? PENDING : null, error: null }),
        single: async () => ({ data: null, error: null }),
      };
      return chain;
    }
    if (table === 'venture_stage_work') {
      // Non-empty advisory_data → the error-path advisory backfill is a no-op (skips _syncStageWork).
      const chain = {
        select: () => chain, eq: () => chain, update: () => chain,
        upsert: async () => ({ data: null, error: null }),
        maybeSingle: async () => ({ data: { advisory_data: { seeded: true } }, error: null }),
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
  return {
    from: vi.fn(from),
    rpc: vi.fn(async (fn) => (fn === 'fn_chairman_decide' ? rpcResult : { data: null, error: null })),
  };
}

function makeWorker(supabase, { advanceStops = false } = {}) {
  const worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999, maxRetries: 0, retryDelayMs: 1 });
  // Stub the surrounding machinery so the test isolates the pending-decision shortcut branch.
  worker._checkGovernanceOverride = vi.fn().mockResolvedValue(null);
  worker._canAutoAdvance = vi.fn().mockResolvedValue(true); // eligible for auto-approve
  worker._isInHardGateStages = vi.fn().mockResolvedValue(false);
  worker._syncStageWork = vi.fn().mockResolvedValue(undefined);
  worker._advanceStage = vi.fn().mockImplementation(async () => {
    // On the success path, stop the loop after the single advance so it does not cascade.
    if (advanceStops) worker._running = false;
    return {}; // not blocked
  });
  return worker;
}

describe('_processVenture pending-decision auto-approve RPC error handling (FR-3)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('RPC error → does NOT call _advanceStage and stays blocked at the same stage', async () => {
    const supabase = makeSupabase({ data: null, error: { message: 'reject_s16_programmatic_approval' } });
    const worker = makeWorker(supabase);

    const result = await worker.processOneStage('v-7');

    // The canonical auto-approve RPC was attempted...
    expect(supabase.rpc).toHaveBeenCalledWith('fn_chairman_decide', expect.objectContaining({
      p_decision_id: 'dec-7', p_action: 'approved', p_decided_by: 'auto-proceed-worker',
    }));
    // ...but the rejection means the venture must NOT advance.
    expect(worker._advanceStage).not.toHaveBeenCalled();
    // It falls through to the existing still-pending handling → blocked at the same stage.
    expect(result.status).toBe('blocked');
    expect(result.stageId).toBe(STAGE);
    expect(result.pendingDecisionId).toBe('dec-7');
  });

  it('RPC success → advances the stage (regression pin, unchanged behavior)', async () => {
    const supabase = makeSupabase({ data: { ok: true }, error: null });
    const worker = makeWorker(supabase, { advanceStops: true });

    await worker.processOneStage('v-7');

    expect(supabase.rpc).toHaveBeenCalledWith('fn_chairman_decide', expect.objectContaining({
      p_decision_id: 'dec-7', p_action: 'approved', p_decided_by: 'auto-proceed-worker',
    }));
    // Success → the pending-decision shortcut advances from STAGE to STAGE+1.
    expect(worker._advanceStage).toHaveBeenCalledTimes(1);
    expect(worker._advanceStage).toHaveBeenCalledWith(
      'v-7', STAGE, STAGE + 1, expect.objectContaining({ advancementType: 'auto_approved' }),
    );
  });
});
