/**
 * Tests for stage-execution-worker._canAutoAdvance — POST-RPC REFACTOR.
 *
 * SD-LEO-REFAC-GATE-AUTO-ADVANCE-001 FR-2 + REGRESSION REG-2:
 * The 4-layer governance logic moved from the worker into the SECURITY DEFINER
 * RPC `can_auto_advance(p_stage_number int)`. These tests preserve the
 * original 12-case decision matrix as a CONTRACT — only the mock surface
 * shifts from supabase.from(...) chains to supabase.rpc(...).
 *
 * For the worker-vs-RPC equivalence test (snapshot-frozen), see
 * tests/integration/eva/can-auto-advance-equivalence.test.js.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';

/**
 * The RPC verdict shape returned by Supabase RPC: an array with one row.
 * Reasons enum: global_off | kill_promotion_gate | explicit_pause |
 *               review_default_pause | config_missing | stage_not_found |
 *               approved
 */
function rpcRow(can, reason, layer) {
  return { data: [{ can, reason, layer }], error: null };
}
function rpcError(message) {
  return { data: null, error: new Error(message) };
}

function mockSupabase(rpcResponder) {
  return {
    rpc: vi.fn(async (fnName, args) => {
      if (fnName !== 'can_auto_advance') throw new Error(`unexpected RPC ${fnName}`);
      return rpcResponder(args.p_stage_number);
    }),
  };
}

function makeWorker(supabase) {
  return new StageExecutionWorker({
    supabase,
    logger: { log: () => {}, warn: () => {}, error: () => {} },
  });
}

describe('worker._canAutoAdvance (RPC-backed, post-refactor)', () => {
  describe('L1: master toggle', () => {
    test('master=false blocks every stage', async () => {
      const w = makeWorker(mockSupabase(() => rpcRow(false, 'global_off', 1)));
      expect(await w._canAutoAdvance(6)).toBe(false);
      expect(await w._canAutoAdvance(8)).toBe(false);
      expect(await w._canAutoAdvance(3)).toBe(false);
    });
  });

  describe('L2: kill / promotion gates (never auto-advance)', () => {
    test('kill gate S3 blocks regardless of master/override', async () => {
      const w = makeWorker(mockSupabase((s) =>
        s === 3 ? rpcRow(false, 'kill_promotion_gate', 2) : rpcRow(true, 'approved', null)
      ));
      expect(await w._canAutoAdvance(3)).toBe(false);
    });

    test('promotion gate S10 blocks regardless of master/override', async () => {
      const w = makeWorker(mockSupabase((s) =>
        s === 10 ? rpcRow(false, 'kill_promotion_gate', 2) : rpcRow(true, 'approved', null)
      ));
      expect(await w._canAutoAdvance(10)).toBe(false);
    });

    test('promotion gate S16 blocks (the historical drift case)', async () => {
      const w = makeWorker(mockSupabase((s) =>
        s === 16 ? rpcRow(false, 'kill_promotion_gate', 2) : rpcRow(true, 'approved', null)
      ));
      expect(await w._canAutoAdvance(16)).toBe(false);
    });
  });

  describe('L3: per-stage explicit pause', () => {
    test('stage_overrides.stage_6.auto_proceed=false blocks S6', async () => {
      const w = makeWorker(mockSupabase((s) =>
        s === 6 ? rpcRow(false, 'explicit_pause', 3) : rpcRow(true, 'approved', null)
      ));
      expect(await w._canAutoAdvance(6)).toBe(false);
    });
  });

  describe('L4: review-mode default-pause', () => {
    test('S7 review-mode without opt-in blocks', async () => {
      const w = makeWorker(mockSupabase((s) =>
        s === 7 ? rpcRow(false, 'review_default_pause', 4) : rpcRow(true, 'approved', null)
      ));
      expect(await w._canAutoAdvance(7)).toBe(false);
    });

    test('S11 review-mode without opt-in blocks', async () => {
      const w = makeWorker(mockSupabase((s) =>
        s === 11 ? rpcRow(false, 'review_default_pause', 4) : rpcRow(true, 'approved', null)
      ));
      expect(await w._canAutoAdvance(11)).toBe(false);
    });

    test('S8 review-mode WITH stage_overrides opt-in passes', async () => {
      const w = makeWorker(mockSupabase((s) =>
        s === 8 ? rpcRow(true, 'approved', null) : rpcRow(false, 'review_default_pause', 4)
      ));
      expect(await w._canAutoAdvance(8)).toBe(true);
    });
  });

  describe('all-clear paths', () => {
    test('S6 plain auto-mode passes', async () => {
      const w = makeWorker(mockSupabase(() => rpcRow(true, 'approved', null)));
      expect(await w._canAutoAdvance(6)).toBe(true);
    });

    test('S26 plain auto-mode passes', async () => {
      const w = makeWorker(mockSupabase(() => rpcRow(true, 'approved', null)));
      expect(await w._canAutoAdvance(26)).toBe(true);
    });
  });

  describe('RPC error / missing rows fail-safe to block', () => {
    test('RPC error returns false', async () => {
      const w = makeWorker(mockSupabase(() => rpcError('network down')));
      expect(await w._canAutoAdvance(6)).toBe(false);
    });

    test('Empty data rows return false (config_missing-equivalent)', async () => {
      const w = makeWorker({
        rpc: vi.fn(async () => ({ data: [], error: null })),
      });
      expect(await w._canAutoAdvance(6)).toBe(false);
    });
  });
});
