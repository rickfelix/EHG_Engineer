/**
 * SD-LEO-INFRA-TIERED-SOURCING-CLAIM-001 (FR-1/FR-4, TESTING finding D-2):
 * scripts/cron/batch-mint-sweep.mjs — the missing production consumer that wires the pure
 * batch-mint detector to the hold writer.
 */
import { describe, it, expect } from 'vitest';
import { runBatchMintSweep } from '../../../scripts/cron/batch-mint-sweep.mjs';

function fakeSupabase({ mints, existingHolds = [], updateResults = {} }) {
  return {
    from: (table) => {
      if (table === 'quick_fixes') {
        return {
          select: (cols) => {
            if (cols.includes('created_by')) {
              // mints.length is well below the default pageSize, so the first page is already
              // "short" and fetchAllPaginated stops after one call — no need to track pages here.
              return { gte: () => ({ not: () => ({ range: async () => ({ data: mints, error: null }) }) }) };
            }
            // the existing-holds lookup: select('id, owner, release_condition').in('id', [...])
            return { in: async () => ({ data: existingHolds, error: null }) };
          },
          update: (payload) => ({
            eq: (col, id) => ({
              select: () => ({
                maybeSingle: async () => (updateResults[id] || { data: { id, ...payload }, error: null }),
              }),
            }),
          }),
        };
      }
      return {};
    },
  };
}

describe('runBatchMintSweep', () => {
  it('holds a genuine batch and skips ids already oracle-held', async () => {
    const t0 = Date.parse('2026-08-01T00:00:00Z');
    const mints = [
      { id: 'QF-1', created_by: 'sess-A', created_at: new Date(t0).toISOString() },
      { id: 'QF-2', created_by: 'sess-A', created_at: new Date(t0 + 3 * 60000).toISOString() },
      { id: 'QF-3', created_by: 'sess-A', created_at: new Date(t0 + 8 * 60000).toISOString() },
    ];
    const supabase = fakeSupabase({
      mints,
      existingHolds: [{ id: 'QF-1', owner: 'chairman', release_condition: '[oracle_read_pending] review_at=x :: already held' }],
    });
    const result = await runBatchMintSweep(supabase, { nowMs: t0 + 9 * 60000 });
    expect(result.groups).toBe(1);
    expect(result.alreadyHeld).toBe(1);
    expect(result.held).toBe(2); // QF-2, QF-3 newly held; QF-1 already held
    expect(result.failed).toEqual([]);
  });

  it('returns scanned:true with zero groups when nothing crosses the batch threshold', async () => {
    const supabase = fakeSupabase({ mints: [{ id: 'QF-1', created_by: 'sess-A', created_at: '2026-08-01T00:00:00Z' }] });
    const result = await runBatchMintSweep(supabase, { nowMs: Date.parse('2026-08-01T00:01:00Z') });
    expect(result).toEqual({ scanned: true, groups: 0, held: 0, alreadyHeld: 0, failed: [] });
  });
});
