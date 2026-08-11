/**
 * SD-LEO-INFRA-DRIVE-SCORE-LEG2-001 — readRankedTop5Cohort: cohort selection, live refetch, and
 * denominator-integrity checking against a fake supabase client over two fixture tables.
 *
 * The interesting cases are all about WHICH cohort gets selected and whether the refetch can be
 * trusted, not the happy-path arithmetic (that lives in leg2-uptake.test.js, unchanged by this SD).
 */

import { describe, it, expect } from 'vitest';
import { readRankedTop5Cohort } from '../../../../lib/drive-loop/score/leg2-cohort-reader.js';

const HOUR = 60 * 60 * 1000;
const WINDOW = 24 * HOUR;
const NOW = Date.parse('2026-08-07T09:00:00.000Z');

/** A minimal fake supabase client over in-memory fixture tables, chainable and awaitable. */
function fakeSupabase(tables) {
  return {
    from(table) {
      const rows = (tables[table] || []).map((r) => ({ ...r }));
      let filtered = rows;
      let orderCol = null;
      let orderAsc = true;
      let limitN = null;

      const applyOrder = () => {
        let r = [...filtered];
        if (orderCol) {
          r.sort((a, b) => {
            const av = a[orderCol];
            const bv = b[orderCol];
            const cmp = av > bv ? 1 : av < bv ? -1 : 0;
            return orderAsc ? cmp : -cmp;
          });
        }
        return limitN != null ? r.slice(0, limitN) : r;
      };

      const builder = {
        select() { return builder; },
        lte(col, val) { filtered = filtered.filter((r) => String(r[col]) <= String(val)); return builder; },
        eq(col, val) { filtered = filtered.filter((r) => r[col] === val); return builder; },
        in(col, vals) { const set = new Set(vals); filtered = filtered.filter((r) => set.has(r[col])); return builder; },
        order(col, { ascending = true } = {}) { orderCol = col; orderAsc = ascending; return builder; },
        limit(n) { limitN = n; return builder; },
        maybeSingle: async () => ({ data: applyOrder()[0] ?? null, error: null }),
        // Awaitable without a terminal call, matching real supabase-js query builders.
        then(resolve, reject) { return Promise.resolve({ data: applyOrder(), error: null }).then(resolve, reject); },
      };
      return builder;
    },
  };
}

const iso = (ms) => new Date(ms).toISOString();

describe('readRankedTop5Cohort', () => {
  it('TS-4 no cohort has ever been ranked — returns null, never an empty-but-measured cohort', async () => {
    const supabase = fakeSupabase({ drive_rank_snapshots: [], strategic_directives_v2: [] });
    const cohort = await readRankedTop5Cohort(supabase, NOW, WINDOW);
    expect(cohort).toBeNull();
  });

  it('TS-2/R1 selects the NEAREST FULLY-ELAPSED cohort, not the latest (still-open) one', async () => {
    // The latest cohort (15 min old) is by construction unclaimed — reading it would read as
    // permanent ~0% uptake. The 25h-old cohort has fully elapsed its 24h window.
    const supabase = fakeSupabase({
      drive_rank_snapshots: [
        { ranked_at: iso(NOW - 15 * 60 * 1000), rank: 1, sd_id: 'id-recent', sd_key: 'SD-RECENT' },
        { ranked_at: iso(NOW - 25 * HOUR), rank: 1, sd_id: 'id-old', sd_key: 'SD-OLD' },
      ],
      strategic_directives_v2: [
        { id: 'id-recent', sd_key: 'SD-RECENT', metadata: {} },
        { id: 'id-old', sd_key: 'SD-OLD', metadata: { claim_history: [{ claimed_at: iso(NOW - HOUR) }] } },
      ],
    });
    const cohort = await readRankedTop5Cohort(supabase, NOW, WINDOW);
    expect(cohort).not.toBeNull();
    expect(cohort.rankedAt).toBe(iso(NOW - 25 * HOUR));
    expect(cohort.rankedTop5.map((r) => r.sd_key)).toEqual(['SD-OLD']);
  });

  it('when NO cohort has fully elapsed the window yet (only recent ones exist), returns null', async () => {
    const supabase = fakeSupabase({
      drive_rank_snapshots: [
        { ranked_at: iso(NOW - 15 * 60 * 1000), rank: 1, sd_id: 'id-recent', sd_key: 'SD-RECENT' },
      ],
      strategic_directives_v2: [{ id: 'id-recent', sd_key: 'SD-RECENT', metadata: {} }],
    });
    const cohort = await readRankedTop5Cohort(supabase, NOW, WINDOW);
    expect(cohort).toBeNull();
  });

  it('preserves RANK ORDER from the snapshot, not refetch/insertion order', async () => {
    const rankedAt = iso(NOW - 25 * HOUR);
    const supabase = fakeSupabase({
      drive_rank_snapshots: [
        { ranked_at: rankedAt, rank: 2, sd_id: 'id-b', sd_key: 'SD-B' },
        { ranked_at: rankedAt, rank: 1, sd_id: 'id-a', sd_key: 'SD-A' },
        { ranked_at: rankedAt, rank: 3, sd_id: 'id-c', sd_key: 'SD-C' },
      ],
      strategic_directives_v2: [
        { id: 'id-a', sd_key: 'SD-A', metadata: {} },
        { id: 'id-b', sd_key: 'SD-B', metadata: {} },
        { id: 'id-c', sd_key: 'SD-C', metadata: {} },
      ],
    });
    const cohort = await readRankedTop5Cohort(supabase, NOW, WINDOW);
    expect(cohort.rankedTop5.map((r) => r.sd_key)).toEqual(['SD-A', 'SD-B', 'SD-C']);
    expect(cohort.cohortSize).toBe(3);
  });

  it('TS-10/R8 [DENOMINATOR INTEGRITY] a live-refetch shortfall is flagged, not silently absorbed', async () => {
    const rankedAt = iso(NOW - 25 * HOUR);
    const supabase = fakeSupabase({
      drive_rank_snapshots: [
        { ranked_at: rankedAt, rank: 1, sd_id: 'id-a', sd_key: 'SD-A' },
        { ranked_at: rankedAt, rank: 2, sd_id: 'id-gone', sd_key: 'SD-GONE' }, // no longer readable
      ],
      // Only ONE of the two snapshotted SDs is still present in the live table.
      strategic_directives_v2: [{ id: 'id-a', sd_key: 'SD-A', metadata: {} }],
    });
    const cohort = await readRankedTop5Cohort(supabase, NOW, WINDOW);
    expect(cohort.cohortSize).toBe(2);
    expect(cohort.rankedTop5).toHaveLength(1);
    expect(cohort.integrityOk, 'a 2-recorded/1-refetched cohort must NOT read as integrity-ok').toBe(false);
  });

  it('a full-integrity cohort (refetch count matches cohort size) reports integrityOk true', async () => {
    const rankedAt = iso(NOW - 25 * HOUR);
    const supabase = fakeSupabase({
      drive_rank_snapshots: [{ ranked_at: rankedAt, rank: 1, sd_id: 'id-a', sd_key: 'SD-A' }],
      strategic_directives_v2: [{ id: 'id-a', sd_key: 'SD-A', metadata: {} }],
    });
    const cohort = await readRankedTop5Cohort(supabase, NOW, WINDOW);
    expect(cohort.integrityOk).toBe(true);
  });

  it('TS-11/R4 every returned row carries a non-null id (the fresh refetch, not the snapshot identity alone)', async () => {
    const rankedAt = iso(NOW - 25 * HOUR);
    const supabase = fakeSupabase({
      drive_rank_snapshots: [{ ranked_at: rankedAt, rank: 1, sd_id: 'id-a', sd_key: 'SD-A' }],
      strategic_directives_v2: [{ id: 'id-a', sd_key: 'SD-A', metadata: { claim_history: [{ claimed_at: iso(NOW - HOUR) }] } }],
    });
    const cohort = await readRankedTop5Cohort(supabase, NOW, WINDOW);
    for (const row of cohort.rankedTop5) {
      expect(row.id, 'a live-refetched row must carry its own id').toBeTruthy();
      expect(row.metadata, 'must be the FRESH metadata, not a frozen snapshot').toBeDefined();
    }
  });

  it('refuses an implicit clock rather than defaulting to Date.now()', async () => {
    const supabase = fakeSupabase({ drive_rank_snapshots: [], strategic_directives_v2: [] });
    await expect(readRankedTop5Cohort(supabase, undefined, WINDOW)).rejects.toThrow(/nowMs and windowMs must be finite numbers/);
    await expect(readRankedTop5Cohort(supabase, NOW, undefined)).rejects.toThrow(/nowMs and windowMs must be finite numbers/);
  });
});
