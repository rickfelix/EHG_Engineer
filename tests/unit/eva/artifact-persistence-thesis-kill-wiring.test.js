/**
 * SD-LEO-INFRA-KILL-GATE-TIER-001 — integration-style test proving advanceStage() actually
 * invokes checkThesisKillGate and throws when it blocks. The gate function itself is unit-
 * tested in isolation (tests/unit/eva/lifecycle/thesis-kill-gate.test.js); this file closes the
 * remaining gap flagged by the EXEC-phase TESTING sub-agent review: the one-line production
 * wiring in artifact-persistence-service.js was previously untested.
 *
 * @module tests/unit/eva/artifact-persistence-thesis-kill-wiring.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSupabaseChainMock } from '../../helpers/supabase-chain-mock.js';

vi.mock('../../../lib/eva/lifecycle/exit-gate-enforcer.js', () => ({
  checkExitGates: vi.fn().mockResolvedValue({ allowed: true, blocked_by: [], gates_checked: [], would_block_by: [] }),
}));
vi.mock('../../../lib/eva/lifecycle/thesis-kill-gate.js', () => ({
  checkThesisKillGate: vi.fn(),
}));

import { advanceStage } from '../../../lib/eva/artifact-persistence-service.js';
import { checkThesisKillGate } from '../../../lib/eva/lifecycle/thesis-kill-gate.js';

const VENTURE_ID = '94856fc6-9ba9-4f56-9a5c-85041031a0fc';

function buildSupabase({ rpcResult = { success: true } } = {}) {
  return {
    from: vi.fn(() => createSupabaseChainMock()),
    rpc: vi.fn().mockResolvedValue({ data: rpcResult, error: null }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('advanceStage() — thesis-kill gate wiring', () => {
  it('calls checkThesisKillGate with ventureId/fromStage/toStage and proceeds when allowed', async () => {
    checkThesisKillGate.mockResolvedValue({ allowed: true, would_kill_by: [], blocked_by: [], fired: [], held: [] });
    const supabase = buildSupabase();

    const out = await advanceStage(supabase, {
      ventureId: VENTURE_ID,
      fromStage: 11,
      toStage: 12,
      handoffData: {},
    });

    expect(out.success).toBe(true);
    expect(checkThesisKillGate).toHaveBeenCalledWith(
      expect.objectContaining({ ventureId: VENTURE_ID, fromStage: 11, toStage: 12 })
    );
  });

  it('throws (blocking the RPC) when checkThesisKillGate returns allowed:false, naming the blocked reason', async () => {
    checkThesisKillGate.mockResolvedValue({
      allowed: false,
      would_kill_by: ['kill-demand-signals: demand_test_qualified_signups lt 10 (observed 8)'],
      blocked_by: ['kill-demand-signals: demand_test_qualified_signups lt 10 (observed 8)'],
      fired: [{ criterionId: 'kill-demand-signals' }],
      held: [],
    });
    const supabase = buildSupabase();

    await expect(
      advanceStage(supabase, { ventureId: VENTURE_ID, fromStage: 11, toStage: 12, handoffData: {} })
    ).rejects.toThrow(/thesis-kill gate.*kill-demand-signals/s);

    // The RPC itself must never have been reached — a binding-mode block happens BEFORE the
    // fn_advance_venture_stage call, mirroring the pre-existing exit-gate block ordering.
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('runs checkThesisKillGate AFTER checkExitGates passes but BEFORE the RPC call', async () => {
    const callOrder = [];
    const { checkExitGates } = await import('../../../lib/eva/lifecycle/exit-gate-enforcer.js');
    checkExitGates.mockImplementation(async () => {
      callOrder.push('exit-gates');
      return { allowed: true, blocked_by: [], gates_checked: [], would_block_by: [] };
    });
    checkThesisKillGate.mockImplementation(async () => {
      callOrder.push('thesis-kill');
      return { allowed: true, would_kill_by: [], blocked_by: [], fired: [], held: [] };
    });
    const supabase = buildSupabase();
    supabase.rpc = vi.fn().mockImplementation(async () => {
      callOrder.push('rpc');
      return { data: { success: true }, error: null };
    });

    await advanceStage(supabase, { ventureId: VENTURE_ID, fromStage: 11, toStage: 12, handoffData: {} });

    expect(callOrder).toEqual(['exit-gates', 'thesis-kill', 'rpc']);
  });
});
