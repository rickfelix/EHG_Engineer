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
import { resetStaleStageWork, advanceStage } from '../../../lib/eva/artifact-persistence-service.js';

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
 */
function createMockSupabase({ stageWorkRow, ventureRow, rpcResult = { success: true } }) {
  const updates = { venture_stage_work: [], ventures: [] };
  const fromHandlers = {
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
    from: vi.fn().mockImplementation((tbl) => fromHandlers[tbl]?.() || {}),
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
});
