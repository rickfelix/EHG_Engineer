import { describe, it, expect, vi } from 'vitest';
import { planDrainGauge, RESOLVED_EQUIVALENT_STATUSES } from '../../../../lib/coordinator/drain-gauge.cjs';

function makeChain(result) {
  const chain = {
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    not: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(result)),
    then: (resolve) => resolve(result),
  };
  return chain;
}

function buildSupabase({ count = null, countError = null, oldestRows = [], oldestError = null } = {}) {
  const countChain = makeChain({ count, error: countError });
  const rowsChain = makeChain({ data: oldestRows, error: oldestError });

  const from = vi.fn(() => ({
    select: vi.fn((_cols, opts) => (opts && opts.head ? countChain : rowsChain)),
  }));

  return { from, _countChain: countChain, _rowsChain: rowsChain };
}

describe('planDrainGauge', () => {
  it('returns noData=true (not a stale/zero count) when the count query fails (TS-8)', async () => {
    const supabase = buildSupabase({ countError: { message: 'connection refused' } });
    const result = await planDrainGauge(supabase);
    expect(result.noData).toBe(true);
    expect(result.reason).toContain('connection refused');
  });

  it('returns noData=true when the oldest-row query fails', async () => {
    const supabase = buildSupabase({ count: 5, oldestError: { message: 'timeout' } });
    const result = await planDrainGauge(supabase);
    expect(result.noData).toBe(true);
    expect(result.reason).toContain('timeout');
  });

  it('returns openCount=0 and oldestAgeDays=null without a second query when count is 0', async () => {
    const supabase = buildSupabase({ count: 0 });
    const result = await planDrainGauge(supabase);
    expect(result).toEqual({ noData: false, openCount: 0, oldestAgeDays: null });
  });

  it('uses the exact count (not a row fetch, which PostgREST caps at 1000) for openCount', async () => {
    const now = new Date('2026-07-10T00:00:00Z').getTime();
    const supabase = buildSupabase({
      count: 4200,
      oldestRows: [{ created_at: new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString() }],
    });
    const result = await planDrainGauge(supabase, { nowMs: now });
    expect(result).toEqual({ noData: false, openCount: 4200, oldestAgeDays: 20 });
  });

  it('excludes the documented resolved-equivalent statuses from its query filter', async () => {
    expect(RESOLVED_EQUIVALENT_STATUSES).toEqual(['resolved', 'wont_fix', 'duplicate', 'invalid', 'shipped']);
    const supabase = buildSupabase({ count: 0 });
    await planDrainGauge(supabase);
    expect(supabase._countChain.not).toHaveBeenCalledWith('status', 'in', '(resolved,wont_fix,duplicate,invalid,shipped)');
  });
});
