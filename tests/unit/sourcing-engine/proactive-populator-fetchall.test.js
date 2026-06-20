/**
 * fetchAllRows pagination — SD-LEO-INFRA-SOURCING-ENGINE-ACTIVATION-001 (FR-2).
 *
 * PostgREST silently caps a single response at 1000 rows regardless of .limit(), so the populator's
 * dedup CONTEXT (the existing-SD set) was truncated to the first 1000 of ~4000 SDs — which is why the
 * dry-run reported dedup_matches=0 (a duplicate living past row 1000 was invisible to findDedupMatch).
 * fetchAllRows pages via .range() until a short page, returning the FULL set.
 */
import { describe, it, expect } from 'vitest';
import { fetchAllRows } from '../../../scripts/sourcing-engine/proactive-populator.mjs';

// Minimal supabase-like stub whose .range() serves from a fixed dataset in 1000-row pages.
function stubDb(total, pageSize = 1000) {
  const rows = Array.from({ length: total }, (_, i) => ({ sd_key: `SD-${i}`, title: `t${i}`, status: 'completed' }));
  let lastRange = null;
  return {
    _rows: rows,
    get lastRange() { return lastRange; },
    from() {
      return {
        select() { return this; },
        range(from, to) {
          lastRange = [from, to];
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
      };
    },
  };
}

describe('fetchAllRows — pages past the PostgREST 1000-row cap (FR-2)', () => {
  it('returns ALL rows when the table exceeds one page (3994 > 1000)', async () => {
    const db = stubDb(3994);
    const out = await fetchAllRows(db, 'strategic_directives_v2', 'sd_key,title,status');
    expect(out).toHaveLength(3994);
    expect(out[0].sd_key).toBe('SD-0');
    expect(out[3993].sd_key).toBe('SD-3993');
  });

  it('stops on a short final page (no infinite loop, no extra fetch)', async () => {
    const db = stubDb(1500);
    const out = await fetchAllRows(db, 't', 'c');
    expect(out).toHaveLength(1500);
  });

  it('returns an empty array for an empty table', async () => {
    const db = stubDb(0);
    expect(await fetchAllRows(db, 't', 'c')).toHaveLength(0);
  });

  it('handles an exact-multiple-of-pageSize table (1000) without dropping rows', async () => {
    const db = stubDb(1000);
    const out = await fetchAllRows(db, 't', 'c');
    expect(out).toHaveLength(1000);
  });

  it('throws (fail-loud) on a query error rather than silently truncating', async () => {
    const db = { from() { return { select() { return this; }, range() { return Promise.resolve({ data: null, error: { message: 'boom' } }); } }; } };
    await expect(fetchAllRows(db, 't', 'c')).rejects.toThrow(/fetchAllRows\(t\): boom/);
  });
});
