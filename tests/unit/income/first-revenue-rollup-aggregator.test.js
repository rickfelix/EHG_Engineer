/**
 * SD-EHG-PRODUCT-FIRSTREV-SUBSTRATE-ROLLUP-001-A — pure monthly rollup aggregator tests.
 *
 * These lock the spec that distinguishes this aggregator from a naive one:
 *  - monetary (first_dollar, mrr) sum `amount` -> total_amount; count (signup_count) sums `count` -> total_count
 *  - first_dollar and mrr are DISTINCT groups (never summed together)
 *  - month key is UTC (a 23:00Z boundary row stays in the earlier month)
 *  - a naive "sum amount+count into one total" or "group only by month" impl fails these
 */
import { describe, it, expect } from 'vitest';
import { rollupMonthly } from '../../../lib/income/first-revenue-rollup-aggregator.js';

const V1 = '00000000-0000-0000-0000-000000000001';
const V2 = '00000000-0000-0000-0000-000000000002';

// row shorthand with sensible defaults
const row = (o) => ({
  venture_id: V1,
  entry_type: 'first_dollar',
  amount: null,
  count: null,
  currency: 'USD',
  recorded_at: '2026-07-15T12:00:00Z',
  ...o,
});

describe('rollupMonthly', () => {
  it('returns [] for empty input (no throw)', () => {
    expect(rollupMonthly([])).toEqual([]);
    expect(rollupMonthly(undefined)).toEqual([]);
    expect(rollupMonthly(null)).toEqual([]);
  });

  it('single first_dollar row -> one monetary record with total_amount=amount, entry_count=1', () => {
    const out = rollupMonthly([row({ entry_type: 'first_dollar', amount: 10 })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      month: '2026-07',
      venture_id: V1,
      entry_type: 'first_dollar',
      currency: 'USD',
      total_amount: 10,
      entry_count: 1,
    });
    // monetary record has NO total_count key (distinct from count groups)
    expect('total_count' in out[0]).toBe(false);
  });

  it('first_dollar and mrr in the same month/venture/currency are DISTINCT groups (do NOT sum together)', () => {
    const out = rollupMonthly([
      row({ entry_type: 'first_dollar', amount: 10, recorded_at: '2026-07-01T00:00:00Z' }),
      row({ entry_type: 'mrr', amount: 5, recorded_at: '2026-07-15T00:00:00Z' }),
    ]);
    expect(out).toHaveLength(2);
    const fd = out.find((r) => r.entry_type === 'first_dollar');
    const mrr = out.find((r) => r.entry_type === 'mrr');
    expect(fd.total_amount).toBe(10); // NOT 15
    expect(mrr.total_amount).toBe(5);
    expect(fd.entry_count).toBe(1);
    expect(mrr.entry_count).toBe(1);
  });

  it('multiple first_dollar rows same month/venture/currency -> summed total_amount + entry_count', () => {
    const out = rollupMonthly([
      row({ entry_type: 'first_dollar', amount: 10.25 }),
      row({ entry_type: 'first_dollar', amount: 4.10 }),
      row({ entry_type: 'first_dollar', amount: 0.15 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].total_amount).toBe(14.5); // 10.25 + 4.10 + 0.15, rounded to 2dp (no float drift)
    expect(out[0].entry_count).toBe(3);
  });

  it('signup_count rows -> total_count summed, total_amount ABSENT (distinct from monetary)', () => {
    const out = rollupMonthly([
      row({ entry_type: 'signup_count', amount: null, count: 3 }),
      row({ entry_type: 'signup_count', amount: null, count: 7 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].total_count).toBe(10);
    expect(out[0].entry_count).toBe(2);
    expect('total_amount' in out[0]).toBe(false);
  });

  it('keys the month in UTC — a 23:00Z boundary row stays in the earlier month', () => {
    const out = rollupMonthly([
      row({ entry_type: 'mrr', amount: 1, recorded_at: '2026-07-31T23:00:00Z' }),
      row({ entry_type: 'mrr', amount: 2, recorded_at: '2026-08-01T00:00:00Z' }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.month)).toEqual(['2026-07', '2026-08']);
    expect(out.find((r) => r.month === '2026-07').total_amount).toBe(1);
    expect(out.find((r) => r.month === '2026-08').total_amount).toBe(2);
  });

  it('sorts deterministically by month, venture_id, entry_type, currency', () => {
    // Feed in scrambled order; expect canonical sort out.
    const out = rollupMonthly([
      row({ venture_id: V2, entry_type: 'mrr', amount: 1, currency: 'USD', recorded_at: '2026-08-05T00:00:00Z' }),
      row({ venture_id: V1, entry_type: 'first_dollar', amount: 1, currency: 'USD', recorded_at: '2026-07-05T00:00:00Z' }),
      row({ venture_id: V1, entry_type: 'first_dollar', amount: 1, currency: 'EUR', recorded_at: '2026-07-05T00:00:00Z' }),
      row({ venture_id: V1, entry_type: 'mrr', amount: 1, currency: 'USD', recorded_at: '2026-07-05T00:00:00Z' }),
    ]);
    const seq = out.map((r) => `${r.month}|${r.venture_id === V1 ? 'V1' : 'V2'}|${r.entry_type}|${r.currency}`);
    expect(seq).toEqual([
      '2026-07|V1|first_dollar|EUR',
      '2026-07|V1|first_dollar|USD',
      '2026-07|V1|mrr|USD',
      '2026-08|V2|mrr|USD',
    ]);
  });

  it('does NOT mutate the input array or its row objects', () => {
    const input = [
      row({ entry_type: 'first_dollar', amount: 10 }),
      row({ entry_type: 'signup_count', amount: null, count: 4 }),
    ];
    const snapshot = JSON.parse(JSON.stringify(input));
    Object.freeze(input); // freezing the array would throw on push/splice mutation
    rollupMonthly(input);
    expect(input).toEqual(snapshot); // rows unchanged deeply
  });

  it('handles a monetary row with null amount and a signup row with null count without NaN', () => {
    const out = rollupMonthly([
      row({ entry_type: 'first_dollar', amount: null }),
      row({ entry_type: 'signup_count', amount: null, count: null }),
    ]);
    const fd = out.find((r) => r.entry_type === 'first_dollar');
    const su = out.find((r) => r.entry_type === 'signup_count');
    expect(fd.total_amount).toBe(0);
    expect(Number.isNaN(fd.total_amount)).toBe(false);
    expect(su.total_count).toBe(0);
    expect(Number.isNaN(su.total_count)).toBe(false);
  });

  it('skips unrecognized entry_type rows without throwing', () => {
    const out = rollupMonthly([
      row({ entry_type: 'bogus_type', amount: 99 }),
      row({ entry_type: 'first_dollar', amount: 5 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].entry_type).toBe('first_dollar');
    expect(out[0].total_amount).toBe(5);
  });

  it('separates the same entry_type across different currencies', () => {
    const out = rollupMonthly([
      row({ entry_type: 'first_dollar', amount: 10, currency: 'USD' }),
      row({ entry_type: 'first_dollar', amount: 8, currency: 'EUR' }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((r) => r.currency === 'USD').total_amount).toBe(10);
    expect(out.find((r) => r.currency === 'EUR').total_amount).toBe(8);
  });
});
