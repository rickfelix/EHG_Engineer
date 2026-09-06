// SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-G FR-4.
import { describe, it, expect } from 'vitest';
import { markDeliverableHandCompleted } from '../../../lib/deliverables/mark-hand-completed.js';

function mockSupabase(existingMetadata, onUpdate) {
  return {
    from(table) {
      if (table !== 'sd_scope_deliverables') throw new Error(`unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: { metadata: existingMetadata }, error: null }) }),
        }),
        update: (payload) => {
          onUpdate(payload);
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };
}

describe('markDeliverableHandCompleted', () => {
  it('requires an actor', async () => {
    const supabase = mockSupabase({}, () => {});
    await expect(markDeliverableHandCompleted(supabase, 'id1', { reason: 'x' })).rejects.toThrow(/actor/);
  });

  it('requires a reason', async () => {
    const supabase = mockSupabase({}, () => {});
    await expect(markDeliverableHandCompleted(supabase, 'id1', { actor: 'x' })).rejects.toThrow(/reason/);
  });

  it('stamps metadata.producer=hand_completed, producer_actor, completed_at -- and preserves existing metadata', async () => {
    let captured;
    const supabase = mockSupabase({ some_existing: 'field' }, (payload) => { captured = payload; });
    const { error } = await markDeliverableHandCompleted(supabase, 'id1', {
      actor: 'Golf',
      reason: 'verified manually, sub-agent trigger did not fire',
    });

    expect(error).toBeNull();
    expect(captured.completion_status).toBe('completed');
    expect(captured.completed_at).toBeTruthy();
    expect(captured.metadata.producer).toBe('hand_completed');
    expect(captured.metadata.producer_actor).toBe('Golf');
    expect(captured.metadata.some_existing).toBe('field');
  });

  it('propagates a fetch error without attempting the write', async () => {
    const supabase = {
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: null, error: new Error('boom') }) }) }),
      }),
    };
    const { error } = await markDeliverableHandCompleted(supabase, 'id1', { actor: 'a', reason: 'r' });
    expect(error.message).toBe('boom');
  });
});
