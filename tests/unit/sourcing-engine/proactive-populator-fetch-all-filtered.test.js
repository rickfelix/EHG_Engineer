/**
 * SD-LEO-INFRA-SOURCING-LOADSOURCES-CAP-FIX-001: fetchAllFiltered pages through ALL rows of a FILTERED
 * query so a bare .limit() can never silently truncate the newest tail (PostgREST caps a single
 * response + returns rows unordered). These tests exercise the real exported helper with a fake
 * PostgREST builder — no DB, no network. (The module is now import-safe via its main-guard.)
 */
import { describe, it, expect, vi } from 'vitest';
import { fetchAllFiltered } from '../../../scripts/sourcing-engine/proactive-populator.mjs';

// A minimal fake of the PostgREST builder chain: buildQuery() -> { order() -> { range() -> {data,error} } }.
// `pages` is an array of page-arrays returned in order; the builder records the order/range calls.
function makeFakeSource(pages, { error = null } = {}) {
  const calls = { order: [], range: [], builds: 0 };
  let page = 0;
  const buildQuery = () => {
    calls.builds++;
    return {
      order(col, opts) { calls.order.push({ col, opts }); return this; },
      range(from, to) {
        calls.range.push([from, to]);
        if (error) return Promise.resolve({ data: null, error });
        return Promise.resolve({ data: pages[page++] ?? [], error: null });
      },
    };
  };
  return { buildQuery, calls };
}

const rows = (n, base = 0) => Array.from({ length: n }, (_, i) => ({ id: base + i + 1 }));

describe('fetchAllFiltered', () => {
  it('concatenates every page until a short (last) page — no newest-tail truncation', async () => {
    // 1139-style: full page of 1000 then a 139 tail (the rows a bare .limit(1000) used to hide).
    const { buildQuery, calls } = makeFakeSource([rows(1000), rows(139, 1000)]);
    const out = await fetchAllFiltered(buildQuery, { pageSize: 1000 });
    expect(out).toHaveLength(1139);
    expect(out[0].id).toBe(1);
    expect(out[1138].id).toBe(1139); // the previously-dropped newest tail is present
    expect(calls.range).toEqual([[0, 999], [1000, 1999]]);
    expect(calls.builds).toBe(2); // a FRESH builder per page (single-use after await)
  });

  it('stops at an exact page boundary (next page empty)', async () => {
    const { buildQuery, calls } = makeFakeSource([rows(1000), []]);
    const out = await fetchAllFiltered(buildQuery, { pageSize: 1000 });
    expect(out).toHaveLength(1000);
    expect(calls.range).toEqual([[0, 999], [1000, 1999]]);
  });

  it('single short page returns immediately (one range call)', async () => {
    const { buildQuery, calls } = makeFakeSource([rows(42)]);
    const out = await fetchAllFiltered(buildQuery, { pageSize: 1000 });
    expect(out).toHaveLength(42);
    expect(calls.range).toEqual([[0, 999]]);
  });

  it('applies a STABLE order for deterministic paging (default id asc; overridable)', async () => {
    const a = makeFakeSource([rows(1)]);
    await fetchAllFiltered(a.buildQuery, { pageSize: 1000 });
    expect(a.calls.order).toEqual([{ col: 'id', opts: { ascending: true } }]);

    const b = makeFakeSource([rows(1)]);
    await fetchAllFiltered(b.buildQuery, { pageSize: 1000, orderCol: 'created_at' });
    expect(b.calls.order[0].col).toBe('created_at');
  });

  it('honors a custom pageSize in the range windows', async () => {
    const { buildQuery, calls } = makeFakeSource([rows(2), rows(2, 2), rows(1, 4)]);
    const out = await fetchAllFiltered(buildQuery, { pageSize: 2 });
    expect(out).toHaveLength(5);
    expect(calls.range).toEqual([[0, 1], [2, 3], [4, 5]]);
  });

  it('throws on a query error (caller fail-soft decides)', async () => {
    const { buildQuery } = makeFakeSource([], { error: { message: 'boom' } });
    await expect(fetchAllFiltered(buildQuery, { pageSize: 1000 })).rejects.toThrow(/fetchAllFiltered: boom/);
  });
});
