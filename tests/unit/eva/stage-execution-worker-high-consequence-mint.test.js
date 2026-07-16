/**
 * SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001 (FR-3 completion) — adversarial-review fix, PR #6104.
 *
 * An independent Deep-tier /ship review (security-agent) + RCA found the feature was inert for
 * its own headline use case: a stage that is ONLY is_high_consequence=true (gate_type='none',
 * review_mode != 'review', not stage 23) never had a chairman_decisions row minted at all, because
 * every existing mint site (the review-mode block, _handleChairmanGate) was gated on
 * gate_type/review_mode, never on is_high_consequence -- and the autonomy model auto-approves
 * plain 'stage_gate'/'promotion_gate' gates away before any mint is reached.
 *
 * These tests drive the REAL _processVenture() loop (via processOneStage, mirroring
 * stage-execution-worker-chairman-gate-rpc-error.test.js's pattern) for exactly that case, and
 * directly call the REAL _handleChairmanGate() for the kill/promotion+HC autonomy-bypass half of
 * the same fix.
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
  fetchVentureForFixtureCheck: vi.fn().mockResolvedValue({ id: 'v-hc', name: 'Real Venture', is_demo: false }),
}));
vi.mock('../../../lib/eva/shared-services.js', () => ({ emit: vi.fn().mockResolvedValue({}) }));
vi.mock('../../../lib/eva/chairman-product-review.js', () => ({ requestProductReview: vi.fn().mockResolvedValue({ id: 'decision-x', isNew: true }) }));

// Mutable per-test governance so isHighConsequence/isKill/isPromotion can vary per test.
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
  checkAutonomy: vi.fn().mockResolvedValue({ action: 'auto_approve', level: 'L4' }), // maximal autonomy — proves HC overrides it
}));

import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';
import { createOrReusePendingDecision } from '../../../lib/eva/chairman-decision-watcher.js';
import { checkAutonomy } from '../../../lib/eva/autonomy-model.js';

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };
const STAGE = 7; // non-special stage (not 18-23), avoids stage-specific guards.

/**
 * Per-table supabase fake mirroring stage-execution-worker-chairman-gate-rpc-error.test.js:
 * ventures resolves to {current_lifecycle_stage: STAGE}; chairman_decisions has no pending row
 * (status='pending' lookups return null) so the pre-exec re-entry shortcuts never fire and the
 * NEW mint path is what actually gets exercised.
 */
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
        maybeSingle: async () => ({ data: null, error: null }), // no pending/approved row exists yet
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
  // _canAutoAdvance mirrors "governance override says fine to auto-advance" -- true here so the
  // ONLY thing standing between this test and a false-pass is the HC-bypass fix itself.
  worker._canAutoAdvance = vi.fn().mockResolvedValue(true);
  return worker;
}

describe('High-consequence mint-and-hold (FR-3 completion) — real _processVenture loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    govState = { isReview: false, isBlocking: false, isKill: false, isPromotion: false, isHighConsequence: false };
    checkAutonomy.mockResolvedValue({ action: 'auto_approve', level: 'L4' });
  });

  it('mints a blocking=true decision (forced) and HOLDS a gate_type=none stage marked high-consequence, despite full autonomy', async () => {
    govState.isHighConsequence = true; // gate_type='none' equivalent: isReview/isBlocking both false
    createOrReusePendingDecision.mockResolvedValue({ id: 'hc-decision-1', isNew: true });

    const worker = makeWorker(makeSupabase());
    const result = await worker.processOneStage('v-hc');

    expect(createOrReusePendingDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        ventureId: 'v-hc',
        stageNumber: STAGE,
        blocking: true,
        forceDecisionCreation: true,
      }),
    );
    expect(result.status).toBe('blocked');
    expect(result.gate).toBe('review');
  });

  it('does NOT mint or hold a plain gate_type=none, non-high-consequence stage (regression pin)', async () => {
    // govState all false (default) — this stage has no gate of any kind.
    const worker = makeWorker(makeSupabase());

    const result = await worker.processOneStage('v-hc');

    expect(createOrReusePendingDecision).not.toHaveBeenCalled();
    expect(result.status).not.toBe('blocked');
  });

  // 2nd-pass adversarial review (PR #6104): the pending-decision canonical-RPC auto-approve
  // resolver (worker ~line 924) is a THIRD independent auto-approve path, separate from the
  // review-mode block and _handleChairmanGate, and must also never resolve an already-minted
  // high-consequence decision on a later tick.
  it('does NOT auto-approve an already-minted high-consequence decision via the canonical-RPC resolver, even when isPreExecGate=true and autonomy says yes', async () => {
    govState.isReview = true; // makes isPreExecGate=true so the resolver block is reached
    govState.isHighConsequence = true;
    createOrReusePendingDecision.mockResolvedValue({ id: 'hc-existing', isNew: false });

    const supabase = makeSupabase();
    const realFrom = supabase.from;
    supabase.from = vi.fn((table) => {
      if (table === 'chairman_decisions') {
        // Every read path this test can reach (resolver's pre-exec lookup, the reuse-path
        // re-check-by-id) sees the SAME still-pending row — chainable regardless of which
        // .eq()/.single()/.maybeSingle() combination the caller uses.
        const chain = {
          select: () => chain,
          eq: () => chain,
          neq: () => chain,
          limit: () => chain,
          order: () => chain,
          maybeSingle: async () => ({ data: { id: 'hc-existing', status: 'pending' }, error: null }),
          single: async () => ({ data: { id: 'hc-existing', status: 'pending' }, error: null }),
        };
        return chain;
      }
      return realFrom(table);
    });

    const worker = makeWorker(supabase);
    const result = await worker.processOneStage('v-hc');

    expect(supabase.rpc).not.toHaveBeenCalledWith('fn_chairman_decide', expect.anything());
    expect(result.status).toBe('blocked');
  });

  // 2nd-pass adversarial review: a mint failure for a high-consequence stage must HOLD
  // (fail closed), not silently fall through to a later auto-advance path.
  it('HOLDS (fail-closed) when createOrReusePendingDecision throws for a high-consequence stage', async () => {
    govState.isHighConsequence = true;
    createOrReusePendingDecision.mockRejectedValueOnce(new Error('db down'));

    const worker = makeWorker(makeSupabase());
    const result = await worker.processOneStage('v-hc');

    expect(result.status).toBe('blocked');
  });

  it('advances (does not re-hold) once the minted high-consequence decision is already approved', async () => {
    govState.isHighConsequence = true;
    createOrReusePendingDecision.mockResolvedValue({ id: 'hc-decision-2', isNew: false });
    const supabase = makeSupabase();
    // Reused (isNew:false) path re-checks chairman_decisions status by id — return approved.
    const realFrom = supabase.from;
    supabase.from = vi.fn((table) => {
      if (table === 'chairman_decisions') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { status: 'approved' }, error: null }) }) }),
        };
      }
      return realFrom(table);
    });

    const worker = makeWorker(supabase);
    const result = await worker.processOneStage('v-hc');

    expect(result.status).not.toBe('blocked');
  });
});

describe('_handleChairmanGate autonomy-bypass for high-consequence gates (FR-3 completion) — real method', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    govState = { isReview: false, isBlocking: false, isKill: false, isPromotion: false, isHighConsequence: false };
  });

  it('does NOT auto-approve a promotion_gate stage marked high-consequence, even at max autonomy (L4)', async () => {
    govState.isPromotion = true;
    govState.isHighConsequence = true;
    checkAutonomy.mockResolvedValue({ action: 'auto_approve', level: 'L4' }); // would normally auto-approve promotion_gate at L2+
    createOrReusePendingDecision.mockResolvedValue({ id: 'hc-promo-decision', isNew: true });

    const worker = makeWorker(makeSupabase());
    const result = await worker._handleChairmanGate('v-hc', 18);

    expect(result.approved).not.toBe(true);
    expect(createOrReusePendingDecision).toHaveBeenCalledWith(
      expect.objectContaining({ blocking: true, forceDecisionCreation: true }),
    );
  });

  it('still auto-approves a plain (non-high-consequence) promotion_gate at sufficient autonomy (regression pin)', async () => {
    govState.isPromotion = true;
    govState.isHighConsequence = false;
    checkAutonomy.mockResolvedValue({ action: 'auto_approve', level: 'L4' });

    const worker = makeWorker(makeSupabase());
    const result = await worker._handleChairmanGate('v-hc', 18);

    expect(result).toEqual({ blocked: false, killed: false, approved: true });
    expect(createOrReusePendingDecision).not.toHaveBeenCalled();
  });

  it('kill_gate high-consequence: checkAutonomy is never even consulted (bypassed unconditionally)', async () => {
    govState.isKill = true;
    govState.isHighConsequence = true;
    createOrReusePendingDecision.mockResolvedValue({ id: 'hc-kill-decision', isNew: true });

    const worker = makeWorker(makeSupabase());
    await worker._handleChairmanGate('v-hc', 5);

    expect(checkAutonomy).not.toHaveBeenCalled();
  });
});
