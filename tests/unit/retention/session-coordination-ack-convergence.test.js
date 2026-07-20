/**
 * SD-FDBK-FIX-BUS-RETENTION-CLEANUP-001 (FR-2) — ack-TTL convergence.
 */
import { describe, it, expect, vi } from 'vitest';
import { convergeAckTTL } from '../../../lib/retention/session-coordination-ack-convergence.js';

function mockSupabase({ candidates = [], updateError = null } = {}) {
  const updates = [];
  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      is: vi.fn(() => ({
        // FR-6 batch 8: convergeAckTTL now paginates the candidate read via
        // fetchAllPaginated (.order().range()); extend the chain to match.
        lte: vi.fn(() => ({
          order: vi.fn(() => ({
            range: vi.fn(async () => ({ data: candidates, error: null })),
          })),
        })),
      })),
    })),
    update: vi.fn((patch) => {
      updates.push(patch);
      return {
        eq: vi.fn(async () => {
          if (updateError) return { error: { message: updateError } };
          return { error: null };
        }),
      };
    }),
  }));
  return { supabase: { from }, updates };
}

describe('convergeAckTTL', () => {
  it('no-ops when there are no candidates', async () => {
    const { supabase } = mockSupabase({ candidates: [] });
    const r = await convergeAckTTL(supabase);
    expect(r).toEqual({ converged: 0, error: null });
  });

  it('stamps acknowledged_at and payload.auto_acked=true, preserving existing payload keys', async () => {
    const now = new Date('2026-07-13T00:00:00Z');
    const { supabase, updates } = mockSupabase({
      candidates: [{ id: 'row-1', payload: { kind: 'roll_call' } }],
    });
    const r = await convergeAckTTL(supabase, { now });
    expect(r).toEqual({ converged: 1, error: null });
    expect(updates[0]).toEqual({
      acknowledged_at: now.toISOString(),
      payload: { kind: 'roll_call', auto_acked: true },
    });
  });

  it('handles a null payload gracefully', async () => {
    const { supabase, updates } = mockSupabase({ candidates: [{ id: 'row-1', payload: null }] });
    await convergeAckTTL(supabase);
    expect(updates[0].payload).toEqual({ auto_acked: true });
  });

  it('deletes nothing -- only ever calls update, never delete', async () => {
    const { supabase } = mockSupabase({ candidates: [{ id: 'row-1', payload: {} }] });
    expect(supabase.from().delete).toBeUndefined();
    await convergeAckTTL(supabase);
  });

  it('reports the error and stops on an update failure', async () => {
    const { supabase } = mockSupabase({
      candidates: [{ id: 'row-1', payload: {} }],
      updateError: 'network blip',
    });
    const r = await convergeAckTTL(supabase);
    expect(r.error).toMatch(/update failed for id=row-1/);
    expect(r.converged).toBe(0);
  });
});
