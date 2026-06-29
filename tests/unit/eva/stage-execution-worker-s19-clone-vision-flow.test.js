/**
 * SD-LEO-INFRA-S19-CLONE-VISION-PROMOTE-ORDER-001 (FR-2) — call-ordering reachability.
 *
 * A clone's enriched L2 vision must be auto-promoted to active+chairman_approved BEFORE the S19
 * bridge evaluates vision readiness. The promote (_autoApproveCloneVision) used to be invoked at
 * ONLY ONE of _runS19Bridge's four entry points — the synchronous S19 entry gate (~L1450), which
 * precedes the fast-path/primary bridge runs. A clone arriving via the OTHER bridge entry points —
 * the S19 hard-gate run-then-recheck (~L690) or the fire-and-forget _postStageHook_S19_Bridge
 * (~L3424) — reached _runS19Bridge WITHOUT the promote and blocked on vision_missing.
 *
 * FR-1 moves the promote to the TOP of _runS19Bridge (the shared callee) so EVERY entry point
 * inherits it. This test asserts _runS19Bridge invokes _autoApproveCloneVision FIRST, before any
 * bridge DB op — which FAILS against the pre-FR-1 code (the bridge never called the promote) and
 * PASSES after. The post-hook (_postStageHook_S19_Bridge) is a thin wrapper around _runS19Bridge,
 * so covering the callee covers that entry path too. A companion test confirms a REAL venture is
 * byte-unchanged (the real promote early-returns real_venture, no vision UPDATE).
 *
 * @module tests/unit/eva/stage-execution-worker-s19-clone-vision-flow.test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const repairMocks = vi.hoisted(() => ({
  isRepairLoopEnabled: vi.fn(),
  repairVision: vi.fn(),
}));
vi.mock('../../../lib/eva/vision-repair-loop.js', () => ({
  isRepairLoopEnabled: repairMocks.isRepairLoopEnabled,
  repairVision: repairMocks.repairVision,
}));

const { StageExecutionWorker } = await import('../../../lib/eva/stage-execution-worker.js');
const runS19Bridge = StageExecutionWorker.prototype._runS19Bridge;
const postStageHook = StageExecutionWorker.prototype._postStageHook_S19_Bridge;
const autoApproveReal = StageExecutionWorker.prototype._autoApproveCloneVision;

const silentLogger = { log() {}, warn() {}, error() {} };

/**
 * Mock supabase that drives _runS19Bridge down its seeded_repo EARLY-RETURN path (no
 * convertSprintToSDs / _verifyAndProvisionVenture), recording the order of `from(table)` calls in
 * `calls` so we can assert the promote ran before any bridge DB op. Also serves the queries the
 * REAL _autoApproveCloneVision issues (ventures / eva_vision_documents) for the companion test.
 */
function makeBridgeSb({ calls, venture, activeL2 = null, draftSeed = null, updates = [] }) {
  const sb = {
    from(table) {
      calls.push(`from:${table}`);
      const ctx = { table, op: 'select', filters: {}, payload: null };
      const builder = {
        select() { ctx.op = 'select'; return builder; },
        update(payload) { ctx.op = 'update'; ctx.payload = payload; return builder; },
        eq(col, val) { ctx.filters[col] = val; return builder; },
        order() { return builder; },
        limit() { return builder; },
        async upsert() { return { error: null }; },
        async single() { return { data: resolve(ctx), error: null }; },
        async maybeSingle() { return { data: resolve(ctx), error: null }; },
        then(res) {
          if (ctx.op === 'update') { updates.push({ table: ctx.table, payload: ctx.payload }); res({ error: null }); }
          else res({ data: resolve(ctx), error: null });
        },
      };
      return builder;
    },
  };
  function resolve(ctx) {
    if (ctx.table === 'ventures') {
      // ventureRow (select name) | ventureBM2 (select build_model) | _autoApproveCloneVision (id, seeded_from_venture_id)
      return { name: 'TestVenture', build_model: 'seeded_repo', ...venture };
    }
    if (ctx.table === 'venture_stage_work') return { advisory_data: {} };
    if (ctx.table === 'eva_vision_documents') {
      if (ctx.filters.status === 'active') return activeL2;
      if (ctx.filters.status === 'draft_seed') return draftSeed;
    }
    return null;
  }
  return sb;
}

beforeEach(() => {
  repairMocks.isRepairLoopEnabled.mockReset();
  repairMocks.repairVision.mockReset();
});

describe('FR-1/FR-2: _runS19Bridge promotes a clone vision at the TOP (before any bridge DB op)', () => {
  it('invokes _autoApproveCloneVision FIRST — fails pre-FR-1 (bridge never called the promote)', async () => {
    const calls = [];
    const autoApproveSpy = vi.fn(async () => { calls.push('autoApprove'); });
    const ctx = {
      _supabase: makeBridgeSb({ calls, venture: { id: 'clone-1', seeded_from_venture_id: 'src-1' } }),
      _logger: silentLogger,
      _autoApproveCloneVision: autoApproveSpy,
      _verifyAndProvisionVenture: vi.fn(),
    };

    const result = await runS19Bridge.call(ctx, 'clone-1');

    // The promote ran exactly once, and BEFORE any bridge DB access (calls[0]).
    expect(autoApproveSpy).toHaveBeenCalledTimes(1);
    expect(autoApproveSpy).toHaveBeenCalledWith('clone-1');
    expect(calls[0]).toBe('autoApprove');
    // Bridge still took its normal seeded_repo early-return (CREATED), promote did not change the outcome.
    expect(result.created).toBe(true);
  });

  it('the _postStageHook_S19_Bridge entry path also promotes first (thin wrapper over the callee)', async () => {
    const calls = [];
    const autoApproveSpy = vi.fn(async () => { calls.push('autoApprove'); });
    const ctx = {
      _supabase: makeBridgeSb({ calls, venture: { id: 'clone-2', seeded_from_venture_id: 'src-2' } }),
      _logger: silentLogger,
      _autoApproveCloneVision: autoApproveSpy,
      _runS19Bridge: runS19Bridge,
      _verifyAndProvisionVenture: vi.fn(),
    };

    await postStageHook.call(ctx, 'clone-2');

    expect(autoApproveSpy).toHaveBeenCalledTimes(1);
    expect(calls[0]).toBe('autoApprove');
  });

  it('companion: REAL venture (seeded_from_venture_id NULL) is byte-unchanged — real promote no-ops, no vision UPDATE', async () => {
    const calls = [];
    const updates = [];
    const ctx = {
      _supabase: makeBridgeSb({ calls, venture: { id: 'real-1', seeded_from_venture_id: null }, updates }),
      _logger: silentLogger,
      _autoApproveCloneVision: autoApproveReal, // the REAL promote, bound via call below
      _verifyAndProvisionVenture: vi.fn(),
    };

    const result = await runS19Bridge.call(ctx, 'real-1');

    // The real promote was reached (it runs for every venture) but early-returned real_venture:
    // no eva_vision_documents UPDATE, and the bridge proceeded unchanged.
    const visionUpdates = updates.filter((u) => u.table === 'eva_vision_documents');
    expect(visionUpdates).toHaveLength(0);
    expect(result.created).toBe(true);
    expect(repairMocks.repairVision).not.toHaveBeenCalled();
  });
});
