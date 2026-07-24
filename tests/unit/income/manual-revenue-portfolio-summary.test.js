/**
 * SD-EHG-PRODUCT-FIRSTREV-SUBSTRATE-ROLLUP-001-B — portfolio-level manual-revenue summary tests.
 *
 * summarizeManualRevenue() consumes sibling SD-...-001-A's rollupMonthly() output shape
 * ({month, venture_id, entry_type, currency, total_amount|total_count, entry_count}) and
 * collapses it into one portfolio-level USD total for a target month.
 */
import { describe, it, expect, vi } from 'vitest';
import { summarizeManualRevenue, fetchManualRevenueTotal } from '../../../lib/income/manual-revenue-portfolio-summary.js';

const V1 = '00000000-0000-0000-0000-000000000001';
const V2 = '00000000-0000-0000-0000-000000000002';

const record = (o) => ({
  month: '2026-07',
  venture_id: V1,
  entry_type: 'first_dollar',
  currency: 'USD',
  total_amount: 0,
  entry_count: 1,
  ...o,
});

describe('summarizeManualRevenue', () => {
  it('empty/null/undefined input returns a zeroed summary, no throw', () => {
    const zero = { total_usd: 0, excluded_non_usd_count: 0, matched_record_count: 0 };
    expect(summarizeManualRevenue([], '2026-07')).toEqual(zero);
    expect(summarizeManualRevenue(null, '2026-07')).toEqual(zero);
    expect(summarizeManualRevenue(undefined, '2026-07')).toEqual(zero);
    expect(summarizeManualRevenue('not-an-array', '2026-07')).toEqual(zero);
  });

  it('sums first_dollar + mrr across multiple ventures in the same month into one portfolio total', () => {
    const out = summarizeManualRevenue([
      record({ venture_id: V1, entry_type: 'first_dollar', total_amount: 100 }),
      record({ venture_id: V2, entry_type: 'mrr', total_amount: 50 }),
    ], '2026-07');
    expect(out.total_usd).toBe(150);
    expect(out.matched_record_count).toBe(2);
    expect(out.excluded_non_usd_count).toBe(0);
  });

  it('signup_count entries are excluded from the monetary sum entirely', () => {
    const out = summarizeManualRevenue([
      record({ entry_type: 'first_dollar', total_amount: 100 }),
      record({ entry_type: 'signup_count', total_amount: undefined, total_count: 25 }),
    ], '2026-07');
    expect(out.total_usd).toBe(100);
    expect(out.matched_record_count).toBe(1);
  });

  it('records from a different month than targetMonth are excluded', () => {
    const out = summarizeManualRevenue([
      record({ month: '2026-06', total_amount: 100 }),
      record({ month: '2026-07', total_amount: 40 }),
    ], '2026-07');
    expect(out.total_usd).toBe(40);
    expect(out.matched_record_count).toBe(1);
  });

  it('non-USD currency records are excluded (not converted, not silently summed)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = summarizeManualRevenue([
      record({ currency: 'USD', total_amount: 100 }),
      record({ currency: 'EUR', total_amount: 90 }),
    ], '2026-07');
    expect(out.total_usd).toBe(100);
    expect(out.excluded_non_usd_count).toBe(1);
    expect(out.matched_record_count).toBe(1);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('does not mutate the input array', () => {
    const input = [record({ total_amount: 100 })];
    const snapshot = JSON.parse(JSON.stringify(input));
    summarizeManualRevenue(input, '2026-07');
    expect(input).toEqual(snapshot);
  });

  it('rounds the total to 2 decimal places (numeric(14,2)-consistent)', () => {
    const out = summarizeManualRevenue([
      record({ total_amount: 10.005 }),
      record({ total_amount: 10.005 }),
    ], '2026-07');
    expect(out.total_usd).toBeCloseTo(20.01, 2);
  });
});

// SD-EHG-PRODUCT-FIRSTREV-SUBSTRATE-ROLLUP-001-A merged (lib/income/first-revenue-rollup-aggregator.js
// now exists on main): mock the dynamic import so both the available and unavailable paths are
// deterministic regardless of the sibling module's live presence/implementation.
const aggregatorMock = vi.hoisted(() => ({ fetchAndRollup: vi.fn() }));
vi.mock('../../../lib/income/first-revenue-rollup-aggregator.js', () => aggregatorMock);

describe('fetchManualRevenueTotal', () => {
  it('summarizes real fetchAndRollup() output when the SD-...-001-A aggregator is available', async () => {
    aggregatorMock.fetchAndRollup.mockResolvedValue([
      record({ entry_type: 'first_dollar', total_amount: 75 }),
    ]);
    const result = await fetchManualRevenueTotal({}, '2026-07');
    expect(result).toMatchObject({ total_usd: 75, source_available: true, matched_record_count: 1 });
    // bounded to the target month (avoids an unbounded full-table scan every hourly run)
    expect(aggregatorMock.fetchAndRollup).toHaveBeenCalledWith({}, { since: '2026-07-01T00:00:00.000Z' });
  });

  it('fails soft when the SD-...-001-A aggregator throws (returns 0, source_available:false)', async () => {
    aggregatorMock.fetchAndRollup.mockRejectedValue(new Error('boom'));
    const result = await fetchManualRevenueTotal({}, '2026-07');
    expect(result).toMatchObject({ total_usd: 0, source_available: false });
  });
});
