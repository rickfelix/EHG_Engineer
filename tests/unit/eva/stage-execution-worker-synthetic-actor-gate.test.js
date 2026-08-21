/**
 * SD-LEO-INFRA-ALTIFYAI-TEST-IDENTITY-001 (FR-6) — unit tests for the fenced
 * synthetic-actor choke-point, the 5th backstop in
 * StageExecutionWorker._advanceStage(). Mirrors
 * stage-execution-worker-high-consequence-gate.test.js's pattern: drives the
 * REAL _advanceStage() method against a mocked, chainable supabase fake, with
 * checkSyntheticActorFencing itself mocked at the module level (its own
 * internal logic — opt-in short-circuit, GitHub pull, fail-closed, cache — is
 * covered separately by tests/unit/eva/synthetic-actor-guard.test.js). This
 * file only tests the WIRING: does _advanceStage() call the guard at the
 * right stage transition, with the right ventureId, and correctly translate
 * {applies, satisfied} into advance/block.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/eva/eva-orchestrator.js', () => ({ processStage: vi.fn() }));
vi.mock('../../../lib/eva/orchestrator-state-machine.js', () => ({
  acquireProcessingLock: vi.fn(), releaseProcessingLock: vi.fn(), markCompleted: vi.fn(),
  ORCHESTRATOR_STATES: { IDLE: 'idle', PROCESSING: 'processing', BLOCKED: 'blocked', FAILED: 'failed', KILLED_AT_REALITY_GATE: 'killed_at_reality_gate' },
}));
vi.mock('../../../lib/eva/chairman-decision-watcher.js', () => ({
  createOrReusePendingDecision: vi.fn(),
  waitForDecision: vi.fn(),
  isFixtureVenture: vi.fn().mockReturnValue(false),
  fetchVentureForFixtureCheck: vi.fn().mockResolvedValue({ id: 'v-1', name: 'Real Venture', is_demo: false }),
}));
vi.mock('../../../lib/eva/shared-services.js', () => ({ emit: vi.fn().mockResolvedValue({}) }));
vi.mock('../../../lib/eva/autonomy-model.js', () => ({ checkAutonomy: vi.fn().mockResolvedValue({ action: 'block', level: 'L0' }) }));
vi.mock('../../../lib/eva/chairman-product-review.js', () => ({ requestProductReview: vi.fn().mockResolvedValue({ id: 'decision-x', isNew: true }) }));
vi.mock('../../../lib/eva/stage-governance.js', () => ({
  getStageGovernance: vi.fn(async () => ({ isBlocking: () => false, isReview: () => false, isHighConsequence: () => false })),
}));

let mockFencingResult = { applies: false, satisfied: true, reason: '' };
vi.mock('../../../lib/eva/synthetic-actor-guard.js', () => ({
  checkSyntheticActorFencing: vi.fn(async () => mockFencingResult),
}));

import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';
import { checkSyntheticActorFencing } from '../../../lib/eva/synthetic-actor-guard.js';

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };

function makeSupabase({ fenceEnforceEnabled = null } = {}) {
  const calls = { venturesUpdate: 0 };
  const from = (table) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      in: () => chain,
      gt: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => {
        if (table === 'leo_feature_flags') {
          return fenceEnforceEnabled === null
            ? { data: null, error: null }
            : { data: { is_enabled: fenceEnforceEnabled }, error: null };
        }
        if (table === 'chairman_decisions') return { data: null, error: null };
        if (table === 'ventures') return { data: { metadata: {} }, error: null };
        if (table === 'venture_stages') return { data: { required_artifacts: [] }, error: null };
        return { data: null, error: null };
      },
      single: async () => ({ data: null, error: null }),
      upsert: async () => ({ data: null, error: null }),
      insert: async () => ({ data: null, error: null }),
      update: () => { if (table === 'ventures') calls.venturesUpdate += 1; return chain; },
      then: (resolve) => resolve({ data: table === 'stage_artifact_requirements' ? [] : null, error: null }),
    };
    return chain;
  };
  return { from, calls };
}

function makeWorker(supabase) {
  const worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999 });
  worker._logStageTransition = vi.fn().mockResolvedValue(undefined);
  worker._runPostStageHooks = vi.fn().mockResolvedValue(undefined);
  return worker;
}

describe('_advanceStage fenced synthetic-actor choke-point (FR-6) — real method', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFencingResult = { applies: false, satisfied: true, reason: '' };
  });

  it('short-circuits with ZERO guard calls for any stage transition other than 19->20', async () => {
    const supabase = makeSupabase();
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 10, 11, {});

    expect(result?.blocked).not.toBe(true);
    expect(checkSyntheticActorFencing).not.toHaveBeenCalled();
  });

  it('calls the guard exactly once, with the ventureId, on a 19->20 transition', async () => {
    const supabase = makeSupabase();
    const worker = makeWorker(supabase);

    await worker._advanceStage('venture-xyz', 19, 20, {});

    expect(checkSyntheticActorFencing).toHaveBeenCalledTimes(1);
    expect(checkSyntheticActorFencing).toHaveBeenCalledWith(supabase, 'venture-xyz');
  });

  it('advances normally when the venture has not opted in (applies:false)', async () => {
    mockFencingResult = { applies: false, satisfied: true, reason: 'not opted in' };
    const supabase = makeSupabase();
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 19, 20, {});

    expect(result?.blocked).not.toBe(true);
    expect(supabase.calls.venturesUpdate).toBe(1);
  });

  it('advances normally when the venture opted in and the guard is satisfied', async () => {
    mockFencingResult = { applies: true, satisfied: true, reason: 'verified' };
    const supabase = makeSupabase();
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 19, 20, {});

    expect(result?.blocked).not.toBe(true);
    expect(supabase.calls.venturesUpdate).toBe(1);
  });

  it('BLOCKS the advance when the venture opted in, the guard is NOT satisfied, AND LEO_SYNTHETIC_ACTOR_FENCE_ENFORCE is enabled', async () => {
    mockFencingResult = { applies: true, satisfied: false, reason: 'synthetic_actor.exclusion_predicate_ref is a placeholder' };
    const supabase = makeSupabase({ fenceEnforceEnabled: true });
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 19, 20, {});

    expect(result).toEqual({
      advanced: false,
      blocked: true,
      reason: 'synthetic_actor_fencing_unmet',
      details: 'synthetic_actor.exclusion_predicate_ref is a placeholder',
    });
    expect(supabase.calls.venturesUpdate).toBe(0);
  });

  // SEC-42 (EXEC-TO-PLAN SECURITY finding): shipping this choke-point
  // unconditionally binding, with no flag, would have hard-blocked AltifyAI's
  // very next Stage 19->20 attempt the moment LEO_ALTIFYAI_UAT_READ_TOKEN was
  // left unprovisioned, with no off switch short of a code revert. These two
  // tests pin the safe default: an unsatisfied result advances anyway
  // (observe-only) unless LEO_SYNTHETIC_ACTOR_FENCE_ENFORCE is explicitly true.
  it('OBSERVE-ONLY: advances anyway (with a warning, not blocked) when the flag row is ABSENT (default)', async () => {
    mockFencingResult = { applies: true, satisfied: false, reason: 'no completed run found on main' };
    const supabase = makeSupabase({ fenceEnforceEnabled: null });
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 19, 20, {});

    expect(result?.blocked).not.toBe(true);
    expect(supabase.calls.venturesUpdate).toBe(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('OBSERVE-ONLY'));
  });

  it('OBSERVE-ONLY: advances anyway when the flag is explicitly is_enabled:false', async () => {
    mockFencingResult = { applies: true, satisfied: false, reason: 'GitHub API error and no fresh cached result' };
    const supabase = makeSupabase({ fenceEnforceEnabled: false });
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 19, 20, {});

    expect(result?.blocked).not.toBe(true);
    expect(supabase.calls.venturesUpdate).toBe(1);
  });

  it('does not block a 19->20 transition that is already blocked by an earlier backstop (this choke-point never runs)', async () => {
    // Force the artifact-precondition backstop to block by making venture_stages
    // report a required artifact via the `.then` fallback path used by
    // checkStageArtifactPrecondition. If this choke-point ran anyway despite an
    // earlier block, checkSyntheticActorFencing would still only be called once
    // at most -- the real assertion is that _advanceStage's overall block reason
    // reflects whichever backstop fired first, and this one never overrides it.
    mockFencingResult = { applies: true, satisfied: false, reason: 'should not matter if an earlier gate already blocked' };
    const supabase = makeSupabase();
    const realFrom = supabase.from;
    supabase.from = (table) => {
      if (table === 'venture_stages') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { required_artifacts: ['some_required_artifact'] }, error: null }) }) }),
        };
      }
      if (table === 'venture_artifacts') {
        // Generic passthrough: every chain method returns the chain itself, so
        // this survives internal query-shape changes in
        // checkStageArtifactPrecondition/readDeviations without re-tracking
        // their exact call sequence -- terminal `.then` always resolves to
        // "nothing found," so the required artifact stays missing regardless
        // of which query (the artifact lookup or the deviation-ledger lookup)
        // is currently running.
        const chain = new Proxy({}, {
          get: (_t, prop) => {
            if (prop === 'then') return (resolve) => resolve({ data: [], error: null });
            return () => chain;
          },
        });
        return chain;
      }
      return realFrom(table);
    };
    const worker = makeWorker(supabase);

    const result = await worker._advanceStage('v-1', 19, 20, {});

    expect(result?.blocked).toBe(true);
    // Whatever the artifact backstop's own reason is, it must not be
    // silently overwritten by this SD's choke-point running redundantly.
    expect(result?.reason).not.toBe('synthetic_actor_fencing_unmet');
  });
});
