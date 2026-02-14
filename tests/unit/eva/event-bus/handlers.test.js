/**
 * Unit tests for Event Bus Handlers
 * SD: SD-EVA-FIX-POST-LAUNCH-001 (FR-3)
 *
 * Tests all 4 handlers: stage-completed, decision-submitted,
 * gate-evaluated, sd-completed
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleStageCompleted } from '../../../../lib/eva/event-bus/handlers/stage-completed.js';
import { handleDecisionSubmitted } from '../../../../lib/eva/event-bus/handlers/decision-submitted.js';
import { handleGateEvaluated } from '../../../../lib/eva/event-bus/handlers/gate-evaluated.js';
import { handleSdCompleted } from '../../../../lib/eva/event-bus/handlers/sd-completed.js';

function mockSupabase(tableData = {}) {
  return {
    from: vi.fn((table) => {
      const data = tableData[table];
      const chain = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: data?.single ?? null, error: data?.error ?? null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: data?.maybeSingle ?? null, error: data?.error ?? null }),
      };
      // Allow chaining after select
      chain.select.mockReturnValue(chain);
      return chain;
    }),
  };
}

// ── stage-completed handler ──

describe('handleStageCompleted', () => {
  it('returns no_stages_configured when no stages found', async () => {
    const supabase = mockSupabase({
      eva_ventures: { single: { id: 'v1', status: 'active' } },
    });

    const result = await handleStageCompleted(
      { ventureId: 'v1', stageId: 's1' },
      { supabase },
    );
    expect(result.outcome).toBe('no_stages_configured');
  });

  it('throws non-retryable error when venture not found', async () => {
    const supabase = mockSupabase({
      eva_ventures: { single: null, error: { message: 'not found' } },
    });

    await expect(
      handleStageCompleted({ ventureId: 'v1', stageId: 's1' }, { supabase }),
    ).rejects.toThrow('Venture not found');
  });
});

// ── decision-submitted handler ──

describe('handleDecisionSubmitted', () => {
  it('unblocks venture when decision is approved', async () => {
    const supabase = mockSupabase({
      chairman_decisions: { single: { id: 'd1', status: 'approved', venture_id: 'v1', lifecycle_stage: 10 } },
      eva_ventures: { single: { id: 'v1', status: 'blocked', current_stage: 10 } },
    });

    const result = await handleDecisionSubmitted(
      { ventureId: 'v1', decisionId: 'd1' },
      { supabase },
    );
    expect(result.outcome).toBe('unblocked');
    expect(result.newStatus).toBe('active');
  });

  it('cancels venture when decision is rejected', async () => {
    const supabase = mockSupabase({
      chairman_decisions: { single: { id: 'd1', status: 'rejected', venture_id: 'v1', lifecycle_stage: 10 } },
      eva_ventures: { single: { id: 'v1', status: 'pending_review', current_stage: 10 } },
    });

    const result = await handleDecisionSubmitted(
      { ventureId: 'v1', decisionId: 'd1' },
      { supabase },
    );
    expect(result.outcome).toBe('unblocked');
    expect(result.newStatus).toBe('cancelled');
  });

  it('returns no_change when decision still pending', async () => {
    const supabase = mockSupabase({
      chairman_decisions: { single: { id: 'd1', status: 'pending', venture_id: 'v1' } },
      eva_ventures: { single: { id: 'v1', status: 'blocked' } },
    });

    const result = await handleDecisionSubmitted(
      { ventureId: 'v1', decisionId: 'd1' },
      { supabase },
    );
    expect(result.outcome).toBe('no_change');
    expect(result.reason).toBe('decision_still_pending');
  });

  it('returns no_change when venture not blocked', async () => {
    const supabase = mockSupabase({
      chairman_decisions: { single: { id: 'd1', status: 'approved', venture_id: 'v1' } },
      eva_ventures: { single: { id: 'v1', status: 'active' } },
    });

    const result = await handleDecisionSubmitted(
      { ventureId: 'v1', decisionId: 'd1' },
      { supabase },
    );
    expect(result.outcome).toBe('no_change');
    expect(result.reason).toBe('venture_not_blocked');
  });

  it('throws non-retryable error when decision not found', async () => {
    const supabase = mockSupabase({
      chairman_decisions: { single: null, error: { message: 'not found' } },
    });

    await expect(
      handleDecisionSubmitted({ ventureId: 'v1', decisionId: 'bad' }, { supabase }),
    ).rejects.toThrow('Decision not found');
  });

  it('throws non-retryable error when venture not found', async () => {
    const supabase = mockSupabase({
      chairman_decisions: { single: { id: 'd1', status: 'approved', venture_id: 'v1' } },
      eva_ventures: { single: null },
    });

    await expect(
      handleDecisionSubmitted({ ventureId: 'v1', decisionId: 'd1' }, { supabase }),
    ).rejects.toThrow('Venture not found');
  });
});

// ── gate-evaluated handler ──

describe('handleGateEvaluated', () => {
  it('handles proceed outcome', async () => {
    const supabase = mockSupabase({
      eva_ventures: { single: { id: 'v1', status: 'active' } },
    });

    const result = await handleGateEvaluated(
      { ventureId: 'v1', gateId: 'g1', outcome: 'proceed' },
      { supabase },
    );
    // Should return pipeline_complete when no stages found
    expect(result.outcome).toBe('proceed');
    expect(result.action).toBe('pipeline_complete');
  });

  it('handles block outcome', async () => {
    const supabase = mockSupabase({
      eva_ventures: { single: { id: 'v1', status: 'active' } },
    });

    const result = await handleGateEvaluated(
      { ventureId: 'v1', gateId: 'g1', outcome: 'block', reason: 'metrics below threshold' },
      { supabase },
    );
    expect(result.outcome).toBe('block');
    expect(result.action).toBe('blocked');
    expect(result.reason).toContain('metrics');
  });

  it('handles kill outcome', async () => {
    const supabase = mockSupabase({
      eva_ventures: { single: { id: 'v1', status: 'active' } },
    });

    const result = await handleGateEvaluated(
      { ventureId: 'v1', gateId: 'g1', outcome: 'kill' },
      { supabase },
    );
    expect(result.outcome).toBe('kill');
    expect(result.action).toBe('terminated');
  });

  it('throws on invalid outcome', async () => {
    const supabase = mockSupabase();

    await expect(
      handleGateEvaluated(
        { ventureId: 'v1', gateId: 'g1', outcome: 'invalid' },
        { supabase },
      ),
    ).rejects.toThrow('Invalid gate outcome');
  });
});

// ── sd-completed handler ──

describe('handleSdCompleted', () => {
  it('returns no_parent for orchestrator-level completion', async () => {
    const supabase = mockSupabase();

    const result = await handleSdCompleted(
      { sdKey: 'SD-ORCH-001', ventureId: 'v1' },
      { supabase },
    );
    expect(result.outcome).toBe('no_parent');
  });

  it('throws when ventureId missing', async () => {
    const supabase = mockSupabase();

    await expect(
      handleSdCompleted({ sdKey: 'SD-1' }, { supabase }),
    ).rejects.toThrow('Missing ventureId');
  });

  it('throws when sdKey missing', async () => {
    const supabase = mockSupabase();

    await expect(
      handleSdCompleted({ ventureId: 'v1' }, { supabase }),
    ).rejects.toThrow('Missing sdKey');
  });
});
