/**
 * fetch-all-paginated.test.js — TS-1/TS-2/TS-3
 * (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-2/FR-3/FR-4).
 */
import { describe, it, expect } from 'vitest';
import {
  fetchAllPaginated,
  assertNotCapTruncated,
  renderCount,
  POSTGREST_MAX_ROWS,
} from '../../../lib/db/fetch-all-paginated.mjs';

/** Mock relation: queryFactory whose .range(from,to) serves slices of `rows`. */
function makeRelation(rows, { failAtOffset = null } = {}) {
  let calls = 0;
  const factory = () => ({
    range(from, to) {
      calls += 1;
      if (failAtOffset !== null && from === failAtOffset) {
        return Promise.resolve({ data: null, error: { message: 'synthetic page fault' } });
      }
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
    },
  });
  return { factory, pageCalls: () => calls };
}

const row = (i) => ({ id: i });

describe('TS-1 fetchAllPaginated full retrieval', () => {
  it('returns all 2500 rows across 3 pages with the 1000 cap', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => row(i));
    const { factory, pageCalls } = makeRelation(rows);
    const out = await fetchAllPaginated(factory, { pageSize: 1000 });
    expect(out).toHaveLength(2500);
    expect(out[2499]).toEqual(row(2499));
    expect(pageCalls()).toBe(3);
  });

  it('page-boundary: an exact multiple of pageSize takes one extra (empty) page and returns all rows', async () => {
    const rows = Array.from({ length: 2000 }, (_, i) => row(i));
    const { factory, pageCalls } = makeRelation(rows);
    const out = await fetchAllPaginated(factory, { pageSize: 1000 });
    expect(out).toHaveLength(2000);
    expect(pageCalls()).toBe(3); // 1000 + 1000 + 0 (short page terminates)
  });

  it('short page terminates immediately; empty relation returns []', async () => {
    const { factory: shortF } = makeRelation(Array.from({ length: 7 }, (_, i) => row(i)));
    expect(await fetchAllPaginated(shortF, { pageSize: 1000 })).toHaveLength(7);
    const { factory: emptyF } = makeRelation([]);
    expect(await fetchAllPaginated(emptyF, { pageSize: 1000 })).toEqual([]);
  });

  it('throws on a page error (callers keep their own fail-open policy)', async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => row(i));
    const { factory } = makeRelation(rows, { failAtOffset: 1000 });
    await expect(fetchAllPaginated(factory, { pageSize: 1000 })).rejects.toThrow(/page at offset 1000/);
  });

  it('defaults pageSize to the PostgREST cap', async () => {
    const rows = Array.from({ length: POSTGREST_MAX_ROWS + 5 }, (_, i) => row(i));
    const { factory, pageCalls } = makeRelation(rows);
    const out = await fetchAllPaginated(factory);
    expect(out).toHaveLength(POSTGREST_MAX_ROWS + 5);
    expect(pageCalls()).toBe(2);
  });

  it('rejects pageSize above the server cap or non-positive (would silently re-truncate)', async () => {
    const { factory } = makeRelation([]);
    await expect(fetchAllPaginated(factory, { pageSize: 5000 })).rejects.toThrow(/pageSize must be an integer/);
    await expect(fetchAllPaginated(factory, { pageSize: 0 })).rejects.toThrow(/pageSize must be an integer/);
    await expect(fetchAllPaginated(factory, { pageSize: -1 })).rejects.toThrow(/pageSize must be an integer/);
  });

  it('maxRows is a clean sampling cap: stops paginating and returns exactly maxRows', async () => {
    const rows = Array.from({ length: 3500 }, (_, i) => row(i));
    const { factory, pageCalls } = makeRelation(rows);
    const out = await fetchAllPaginated(factory, { pageSize: 1000, maxRows: 2500 });
    expect(out).toHaveLength(2500);
    expect(pageCalls()).toBe(3); // stopped after the page that crossed maxRows
  });

  it('throws (not hangs) when the builder ignores .range() and serves identical full pages', async () => {
    const fullPage = Array.from({ length: 10 }, (_, i) => row(i));
    const factory = () => ({ range: () => Promise.resolve({ data: fullPage, error: null }) });
    await expect(fetchAllPaginated(factory, { pageSize: 10, maxPages: 5 })).rejects.toThrow(/exceeded 5 pages/);
  });
});

describe('TS-2 cap-tripwire', () => {
  it('throws CAP_TRUNCATION_SUSPECTED on exactly-at-cap results, naming the site', () => {
    const atCap = Array.from({ length: 1000 }, (_, i) => row(i));
    expect(() => assertNotCapTruncated(atCap, { cap: 1000, site: 'test-site' }))
      .toThrow(/CAP_TRUNCATION_SUSPECTED at test-site/);
  });

  it('passes below-cap results through unchanged', () => {
    const below = Array.from({ length: 999 }, (_, i) => row(i));
    expect(assertNotCapTruncated(below, { cap: 1000 })).toBe(below);
    expect(assertNotCapTruncated([], { cap: 1000 })).toEqual([]);
  });

  it('above-cap (already-paginated) results pass through', () => {
    const above = Array.from({ length: 1500 }, (_, i) => row(i));
    expect(assertNotCapTruncated(above, { cap: 1000 })).toBe(above);
  });
});

describe('TS-3 count-null fail-loud', () => {
  it("renders 'unavailable' for null/undefined/NaN counts (missing-relation signature)", () => {
    expect(renderCount(null)).toBe('unavailable');
    expect(renderCount(undefined)).toBe('unavailable');
    expect(renderCount(Number.NaN)).toBe('unavailable');
  });

  it('never coerces a failed measurement to 0, but passes real numbers through (including 0)', () => {
    expect(renderCount(null)).not.toBe(0);
    expect(renderCount(0)).toBe(0);
    expect(renderCount(1495)).toBe(1495);
  });
});
