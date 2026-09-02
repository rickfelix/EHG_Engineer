/**
 * QF-20260830-690: manual PM-board child items only move by hand — the chairman found ten
 * sitting 6-12 days stale before the seat did. checkBoardStale() closes that gap with a
 * chairman-visible HARD line the moment a manual child sits past 7 days untouched or its
 * review_by passes; touching the item (status/blocker/updated_at) clears it. A parent-tier
 * anchor never fires (mirrors QF-20260725-639's parent_tier_anchor suppression elsewhere).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkBoardStale } from '../../../scripts/adam-quiet-tick.mjs';
import { encodeManualChildMeta } from '../../../lib/adam/task-ledger.js';

/** Filter-applying adam_task_ledger builder, single short page (fetchAllPaginated contract). */
function ledgerBuilder(rows) {
  const filters = [];
  const b = {
    select: () => b,
    eq: (col, val) => { filters.push((r) => r[col] === val); return b; },
    in: (col, vals) => { filters.push((r) => vals.includes(r[col])); return b; },
    order: () => b,
    range: () => Promise.resolve({ data: rows.filter((r) => filters.every((f) => f(r))), error: null }),
  };
  return b;
}

function makeSupabase(rows) {
  return { from: (table) => (table === 'adam_task_ledger' ? ledgerBuilder(rows) : ledgerBuilder([])) };
}

const NOW_ISO = '2026-08-30T00:00:00.000Z';

describe('checkBoardStale (QF-20260830-690)', () => {
  // QF-20260901-696: isManualChildStale(row, now = Date.now()) defaults to the REAL wall clock
  // whenever a caller (checkBoardStale here) doesn't pass one, so every literal date below is a
  // dated bomb once the real clock crosses NOW_ISO + 7 days. Freezing the clock at NOW_ISO makes
  // both legs (the updated_at staleness window AND the review_by-passed check) permanently correct
  // regardless of wall-clock date, since Date.now() inside the SUT resolves to the frozen value.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_ISO));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires for a manual child untouched past 7 days', async () => {
    const sb = makeSupabase([{
      id: 'c1', title: 'stale item', status: 'open', tier: 'child', source_kind: 'manual',
      updated_at: '2026-08-20T00:00:00.000Z', // 10 days
      risk: encodeManualChildMeta('hotel-5', '2027-01-01T00:00:00.000Z'),
    }]);
    const result = await checkBoardStale(sb);
    expect(result.count).toBe(1);
    expect(result.items[0]).toMatchObject({ id: 'c1', owner: 'hotel-5', review_by: '2027-01-01T00:00:00.000Z' });
  });

  it('clears the moment the item is touched (updated_at inside the 7-day window)', async () => {
    const sb = makeSupabase([{
      id: 'c1', title: 'fresh item', status: 'open', tier: 'child', source_kind: 'manual',
      updated_at: '2026-08-29T00:00:00.000Z', // 1 day
      risk: encodeManualChildMeta('hotel-5', '2027-01-01T00:00:00.000Z'),
    }]);
    const result = await checkBoardStale(sb);
    expect(result.count).toBe(0);
  });

  it('never fires for a parent-tier anchor, even when untouched for months', async () => {
    const sb = makeSupabase([{
      id: 'p1', title: 'anchor', status: 'open', tier: 'parent', source_kind: 'manual',
      updated_at: '2026-01-01T00:00:00.000Z',
      risk: encodeManualChildMeta('hotel-5', '2027-01-01T00:00:00.000Z'),
    }]);
    const result = await checkBoardStale(sb);
    expect(result.count).toBe(0);
  });

  it('never fires for a non-manual source_kind child', async () => {
    const sb = makeSupabase([{
      id: 'c1', title: 'sourced item', status: 'open', tier: 'child', source_kind: 'sourced_sd',
      updated_at: '2026-08-01T00:00:00.000Z',
    }]);
    const result = await checkBoardStale(sb);
    expect(result.count).toBe(0);
  });

  it('reports owner=(unassigned) / review_by=(none) for a legacy row with no encoded meta', async () => {
    const sb = makeSupabase([{
      id: 'c1', title: 'legacy item', status: 'open', tier: 'child', source_kind: 'manual',
      updated_at: '2026-08-10T00:00:00.000Z', risk: null,
    }]);
    const result = await checkBoardStale(sb);
    expect(result.count).toBe(1);
    expect(result.items[0]).toMatchObject({ owner: '(unassigned)', review_by: '(none)' });
  });

  it('is fail-soft: a throwing client returns count=0, never throws', async () => {
    const sb = { from: () => { throw new Error('boom'); } };
    const result = await checkBoardStale(sb);
    expect(result).toMatchObject({ count: 0, items: [] });
    expect(result.error).toBeTruthy();
  });
});
