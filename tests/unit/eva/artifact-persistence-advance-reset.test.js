/**
 * SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-001 FR-A — regression tests for
 * resetStaleStageWork() + advanceStage() three-layer reset.
 *
 * The LexiGuard impossible-state pattern (stage_status='in_progress' +
 * completed_at NOT NULL) is fixtured in `lexiguardImpossibleStateRow`
 * below. The bulk-blocked pattern (orchestrator_state='blocked') is
 * fixtured in the venture mock.
 *
 * @module tests/unit/eva/artifact-persistence-advance-reset.test
 */

import { describe, it, expect, vi } from 'vitest';
import { createSupabaseChainMock } from '../../helpers/supabase-chain-mock.js';

vi.mock('../../../lib/eva/chairman-product-review.js', () => ({ requestProductReview: vi.fn().mockResolvedValue({ id: 'decision-x', isNew: true }) }));

import { resetStaleStageWork, advanceStage } from '../../../lib/eva/artifact-persistence-service.js';
import { requestProductReview } from '../../../lib/eva/chairman-product-review.js';

const VENTURE_ID = '94856fc6-9ba9-4f56-9a5c-85041031a0fc'; // LexiGuard
const TO_STAGE = 20;

const lexiguardImpossibleStateRow = {
  id: 'vsw-lexiguard-s20',
  stage_status: 'in_progress',
  completed_at: '2026-04-29T18:00:00Z', // ← the impossible-state bit
};

const lexiguardVentureRow = {
  orchestrator_state: 'blocked',
  orchestrator_lock_id: null,
};

/**
 * Build a mock supabase that records UPDATE payloads for assertion.
 *
 * Only the two tables the reset logic touches (venture_stage_work, ventures)
 * have bespoke handlers. advanceStage() also runs checkExitGates / checkGateDebt
 * which read other tables (venture_stages, eva_stage_gate_results,
 * chairman_decisions); the fallback returns a fully chainable + thenable
 * createSupabaseChainMock() that resolves empty so those checks pass through to
 * allowed/not-blocked (the previous `|| {}` fallback broke with
 * "supabase.from(...).select is not a function").
 */
function createMockSupabase({ stageWorkRow, ventureRow, rpcResult = { success: true } }) {
  const updates = { venture_stage_work: [], ventures: [] };
  const fromHandlers = {
    // SD-LEO-INFRA-EXIT-GATE-FAIL-CLOSED-POLARITY-001 (HP-2): the enforcer now
    // fails CLOSED on a MISSING venture_stages row, so healthy-config fixtures
    // must model row-present-with-empty-gates (the intended allow path) instead
    // of riding the old row-absent silent allow through the chainable fallback.
    venture_stages: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: { metadata: {} }, error: null }),
        }),
      }),
    }),
    venture_stage_work: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: stageWorkRow, error: null }),
              }),
            }),
          }),
        }),
      }),
      update: vi.fn().mockImplementation((payload) => {
        updates.venture_stage_work.push(payload);
        return { eq: () => Promise.resolve({ error: null }) };
      }),
    }),
    ventures: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: ventureRow, error: null }),
        }),
      }),
      update: vi.fn().mockImplementation((payload) => {
        updates.ventures.push(payload);
        return { eq: () => Promise.resolve({ error: null }) };
      }),
    }),
  };
  const supabase = {
    from: vi.fn().mockImplementation((tbl) => fromHandlers[tbl]?.() || createSupabaseChainMock()),
    rpc: vi.fn().mockResolvedValue({ data: rpcResult, error: null }),
  };
  return { supabase, updates };
}

describe('resetStaleStageWork() — three-layer reset', () => {
  it('resets venture_stage_work IFF impossible-state pattern present (LexiGuard fixture)', async () => {
    const { supabase, updates } = createMockSupabase({
      stageWorkRow: lexiguardImpossibleStateRow,
      ventureRow: lexiguardVentureRow,
    });
    const out = await resetStaleStageWork(supabase, { ventureId: VENTURE_ID, toStage: TO_STAGE });
    expect(out.stage_work_reset).toBe(true);
    expect(updates.venture_stage_work).toHaveLength(1);
    expect(updates.venture_stage_work[0]).toMatchObject({
      stage_status: 'not_started',
      completed_at: null,
      health_score: null,
      started_at: null,
      advisory_data: null,
    });
  });

  it('does NOT reset a fresh in_progress row (completed_at IS NULL)', async () => {
    const fresh = { id: 'vsw-fresh', stage_status: 'in_progress', completed_at: null };
    const { supabase, updates } = createMockSupabase({
      stageWorkRow: fresh,
      ventureRow: { orchestrator_state: 'processing', orchestrator_lock_id: null },
    });
    const out = await resetStaleStageWork(supabase, { ventureId: VENTURE_ID, toStage: TO_STAGE });
    expect(out.stage_work_reset).toBe(false);
    expect(updates.venture_stage_work).toHaveLength(0);
  });

  it("forces ventures.orchestrator_state to 'idle' when current is 'blocked'", async () => {
    const { supabase, updates } = createMockSupabase({
      stageWorkRow: null,
      ventureRow: { orchestrator_state: 'blocked', orchestrator_lock_id: null },
    });
    const out = await resetStaleStageWork(supabase, { ventureId: VENTURE_ID, toStage: TO_STAGE });
    expect(out.orchestrator_state_reset).toBe(true);
    expect(updates.ventures[0]).toEqual({ orchestrator_state: 'idle' });
  });

  it("forces ventures.orchestrator_state to 'idle' when current is 'failed'", async () => {
    const { supabase, updates } = createMockSupabase({
      stageWorkRow: null,
      ventureRow: { orchestrator_state: 'failed', orchestrator_lock_id: null },
    });
    const out = await resetStaleStageWork(supabase, { ventureId: VENTURE_ID, toStage: TO_STAGE });
    expect(out.orchestrator_state_reset).toBe(true);
    expect(updates.ventures[0].orchestrator_state).toBe('idle');
  });

  it("does NOT trample 'processing' state — leaves a legitimate worker run alone", async () => {
    const { supabase, updates } = createMockSupabase({
      stageWorkRow: null,
      ventureRow: { orchestrator_state: 'processing', orchestrator_lock_id: null },
    });
    const out = await resetStaleStageWork(supabase, { ventureId: VENTURE_ID, toStage: TO_STAGE });
    expect(out.orchestrator_state_reset).toBe(false);
    expect(updates.ventures).toHaveLength(0);
  });

  it('clears orchestrator_lock_id when non-null (alongside state reset)', async () => {
    const { supabase, updates } = createMockSupabase({
      stageWorkRow: null,
      ventureRow: { orchestrator_state: 'blocked', orchestrator_lock_id: 'lock-abc-123' },
    });
    const out = await resetStaleStageWork(supabase, { ventureId: VENTURE_ID, toStage: TO_STAGE });
    expect(out.lock_cleared).toBe(true);
    expect(updates.ventures[0]).toMatchObject({ orchestrator_state: 'idle', orchestrator_lock_id: null });
  });

  it('returns errors[] without throwing on missing inputs', async () => {
    const out = await resetStaleStageWork(null, { ventureId: VENTURE_ID, toStage: TO_STAGE });
    expect(out.errors).toContain('resetStaleStageWork: missing supabase/ventureId/toStage');
    expect(out.stage_work_reset).toBe(false);
  });
});

describe('advanceStage() — invokes resetStaleStageWork after RPC success', () => {
  it('returns reset summary alongside RPC result', async () => {
    const { supabase } = createMockSupabase({
      stageWorkRow: lexiguardImpossibleStateRow,
      ventureRow: lexiguardVentureRow,
    });
    const out = await advanceStage(supabase, {
      ventureId: VENTURE_ID,
      fromStage: 19,
      toStage: TO_STAGE,
      handoffData: { source: 'test' },
    });
    expect(out.success).toBe(true);
    expect(out.reset).toBeDefined();
    expect(out.reset.stage_work_reset).toBe(true);
    expect(out.reset.orchestrator_state_reset).toBe(true);
  });

  it('does NOT swallow RPC failures — reset is post-success only', async () => {
    const { supabase } = createMockSupabase({
      stageWorkRow: lexiguardImpossibleStateRow,
      ventureRow: lexiguardVentureRow,
      rpcResult: { success: false, error: 'sentinel-failure' },
    });
    await expect(
      advanceStage(supabase, {
        ventureId: VENTURE_ID,
        fromStage: 19,
        toStage: TO_STAGE,
        handoffData: {},
      })
    ).rejects.toThrow(/sentinel-failure/);
  });

  // SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001: the RPC choke point (23->24) can't itself mint/email
  // the chairman decision (plpgsql) — a manual-advance/clone-run caller must trigger the ask here.
  describe('advanceStage() — product_review_required RPC failure', () => {
    it('calls requestProductReview then still throws (never masks the original block)', async () => {
      vi.clearAllMocks();
      const { supabase } = createMockSupabase({
        stageWorkRow: null,
        ventureRow: { orchestrator_state: 'idle', orchestrator_lock_id: null },
        rpcResult: { success: false, error: 'product_review_required' },
      });

      await expect(
        advanceStage(supabase, { ventureId: VENTURE_ID, fromStage: 23, toStage: 24, handoffData: {} }),
      ).rejects.toThrow(/product_review_required/);

      expect(requestProductReview).toHaveBeenCalledWith(supabase, VENTURE_ID);
    });

    it('does not call requestProductReview for an unrelated RPC failure', async () => {
      vi.clearAllMocks();
      const { supabase } = createMockSupabase({
        stageWorkRow: null,
        ventureRow: { orchestrator_state: 'idle', orchestrator_lock_id: null },
        rpcResult: { success: false, error: 'gate_blocked' },
      });

      await expect(
        advanceStage(supabase, { ventureId: VENTURE_ID, fromStage: 23, toStage: 24, handoffData: {} }),
      ).rejects.toThrow(/gate_blocked/);

      expect(requestProductReview).not.toHaveBeenCalled();
    });

    it('still throws the original RPC error even if requestProductReview itself fails', async () => {
      vi.clearAllMocks();
      requestProductReview.mockRejectedValueOnce(new Error('escalation transport down'));
      const { supabase } = createMockSupabase({
        stageWorkRow: null,
        ventureRow: { orchestrator_state: 'idle', orchestrator_lock_id: null },
        rpcResult: { success: false, error: 'product_review_required' },
      });

      await expect(
        advanceStage(supabase, { ventureId: VENTURE_ID, fromStage: 23, toStage: 24, handoffData: {} }),
      ).rejects.toThrow(/product_review_required/);
    });
  });
});
