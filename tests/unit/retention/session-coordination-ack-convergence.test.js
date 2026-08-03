/**
 * SD-FDBK-FIX-BUS-RETENTION-CLEANUP-001 (FR-2) — ack-TTL convergence.
 */
import { describe, it, expect, vi } from 'vitest';
import { convergeAckTTL } from '../../../lib/retention/session-coordination-ack-convergence.js';

function mockSupabase({ candidates = [], updateError = null } = {}) {
  const updates = [];
  // SELF-RETURNING BUILDER, replacing a hand-nested chain.
  //
  // The chain used to be spelled out literally (select -> is -> lte -> order -> range), so it
  // encoded not just WHICH filters convergeAckTTL applies but the ORDER it applies them in. It
  // has now broken twice on additive changes that were correct in production: once when
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 added pagination (see the comment it left), and
  // again when SD-LEO-INFRA-SIGNAL-ROUTER-AUTO-001 added a second .is() after .lte() — which a
  // real supabase client chains without complaint. A mock that fails on a change the SUT handles
  // correctly is testing the mock.
  //
  // Filters are RECORDED rather than shaped, so a test can assert WHICH filters were applied
  // (see the promotion-marker case below) without pinning the order they arrive in.
  const filters = [];
  const tables = [];
  const builder = {
    select: vi.fn(() => builder),
    is: vi.fn((col, val) => { filters.push(['is', col, val]); return builder; }),
    lte: vi.fn((col, val) => { filters.push(['lte', col, val]); return builder; }),
    // RECORDED, not ignored: the nested chain used to reach .range() only via .order(), so it
    // incidentally pinned the pagination contract. Dropping to a self-returning builder lost
    // that — deleting the FR-6 `.order('id')` unique tiebreaker (added by
    // COUNT-TRUNCATION-DISCIPLINE-001 precisely for stable page boundaries) reddened nothing.
    // Recording it restores the pin without re-encoding filter ORDER, which was the brittleness.
    order: vi.fn((col, opts) => { filters.push(['order', col, opts]); return builder; }),
    range: vi.fn(async () => ({ data: candidates, error: null })),
  };
  const from = vi.fn((table) => ({
    // The table name is recorded because a builder that ignores its argument will happily report
    // the right filters applied to the WRONG RELATION — changing the SUT to .from('other_table')
    // left this suite green until this was added.
    select: (...a) => { tables.push(table); return builder.select(...a); },
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
  return { supabase: { from }, updates, filters, tables };
}

describe('convergeAckTTL', () => {
  // SD-LEO-INFRA-SIGNAL-ROUTER-AUTO-001 (FR-8, second site). BEHAVIOURAL, not a source scan.
  //
  // The first version of this guard was pinned only by a regex over the file. That is defeatable
  // four ways — comment the line out (the regex matches commented text), bolt an identical .is()
  // onto an unrelated query elsewhere in the file (a file-global match never checks position),
  // or leave the asserted line byte-identical while re-binding the import
  // (`{ PROMOTION_ACK_SOURCE_KEY: PROMOTION_ACK_KEY }`) so the guard filters the WRONG KEY while
  // reading as correct. The last one defeats the entire "imports the key rather than re-spelling
  // it" rationale, and a grep also cannot see the runtime death of the line it greps for.
  //
  // convergeAckTTL takes an injectable client, so the filters it ACTUALLY applies can just be
  // observed. That closes all four, and it exercises the ESM createRequire import at runtime
  // rather than asserting the import statement exists.
  it('EXCLUDES promotion-marked rows from TTL convergence (observed, not grepped)', async () => {
    const { supabase, filters, tables } = mockSupabase({ candidates: [] });
    await convergeAckTTL(supabase);
    // The right filters on the wrong relation is still wrong.
    expect(tables).toContain('session_coordination');
    const isFilters = filters.filter((f) => f[0] === 'is');
    expect(isFilters).toContainEqual(['is', 'acknowledged_at', null]);
    // The exact column string matters: promotion_ack_source would pass a laxer assertion while
    // filtering the wrong key entirely.
    expect(isFilters).toContainEqual(['is', 'payload->>promotion_ack', null]);
  });

  it('still paginates with the FR-6 unique tiebreaker (pinned after the builder swap lost it)', async () => {
    // Not about this SD, but the self-returning builder dropped a contract the old nested chain
    // held incidentally: it reached .range() only via .order(), so deleting the FR-6 unique
    // tiebreaker reddened nothing. Re-pinned rather than left to be rediscovered.
    const { supabase, filters } = mockSupabase({ candidates: [] });
    await convergeAckTTL(supabase);
    expect(filters).toContainEqual(['order', 'id', { ascending: true }]);
  });

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
