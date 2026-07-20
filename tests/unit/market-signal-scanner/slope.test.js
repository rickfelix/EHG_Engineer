// SD-LEO-INFRA-MARKET-SIGNAL-SCANNER-001 -- adversarial-review fix (PR #6142).
// Shared slope module: (1) baseline must exclude recent rows (non-overlapping
// windows), (2) slope must be a clamped percent-change, never an unbounded
// raw-unit difference that could overflow venture_nursery.current_score
// (NUMERIC(5,2), max ~999.99).
import { describe, it, expect } from 'vitest';
import { computeSlopeAndPersist, computePercentSlope, extractNumeric, SLOPE_CLAMP_ABS } from '../../../lib/market-signal-scanner/slope.js';

function makeSupabase({ priorRows = [] } = {}) {
  const inserted = [];
  return {
    inserted,
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              gte: () => ({
                // FR-6 batch 8: computeSlopeAndPersist now paginates via fetchAllPaginated
                // (.order('fetched_at').order('id') then .range())
                lte: () => ({
                  order() { return this; },
                  range: (from, to) => Promise.resolve({ data: priorRows.slice(from, to + 1), error: null }),
                }),
              }),
            }),
          }),
        }),
      }),
      insert: async (row) => {
        inserted.push(row);
        return { data: null, error: null };
      },
    }),
  };
}

describe('computePercentSlope', () => {
  it('computes a percent-change and never a raw absolute difference', () => {
    // 4,000,000 -> 4,900,000 is a 22.5% increase, NOT the raw delta 900000.
    expect(computePercentSlope(4900000, 4000000)).toBeCloseTo(22.5, 5);
  });

  it('clamps growth from a zero baseline to +SLOPE_CLAMP_ABS (never Infinity/NaN)', () => {
    expect(computePercentSlope(50, 0)).toBe(SLOPE_CLAMP_ABS);
  });

  it('returns 0 for a zero-to-zero baseline (no growth, not a fabricated large value)', () => {
    expect(computePercentSlope(0, 0)).toBe(0);
  });

  it('clamps a huge swing to +/-SLOPE_CLAMP_ABS', () => {
    expect(computePercentSlope(100_000_000, 1)).toBe(SLOPE_CLAMP_ABS);
    expect(computePercentSlope(-100_000_000, 1)).toBe(-SLOPE_CLAMP_ABS);
  });

  it('returns null when either input is null (no fabricated zero)', () => {
    expect(computePercentSlope(null, 10)).toBeNull();
    expect(computePercentSlope(10, null)).toBeNull();
  });
});

describe('computeSlopeAndPersist -- non-overlapping baseline/recent windows', () => {
  it('excludes recent-window rows from the baseline average (regression for the self-contamination bug)', async () => {
    const now = Date.now();
    const priorRows = [
      // true baseline: strictly older than 90 days
      { raw_value: 100, fetched_at: new Date(now - 200 * 24 * 60 * 60 * 1000).toISOString() },
      // recent: within the last 90 days
      { raw_value: 200, fetched_at: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString() },
    ];
    const supabase = makeSupabase({ priorRows });
    const errors = [];

    const slope = await computeSlopeAndPersist({
      supabase,
      source: 'test_source',
      queryTerm: 'test-term',
      family: 'money_in',
      rawValue: 200,
      observation: { fetched_at: new Date(now).toISOString(), content_hash: 'abc', transform_version: 'v1' },
      errors,
    });

    // If recent contaminated baseline (old buggy behavior), baseline would be
    // (100+200)/2=150 and slope=(200-150)/150*100=33.33, NOT 100.
    // Corrected: baseline=100 (recent excluded), recent=200, slope=(200-100)/100*100=100.
    expect(slope).toBe(100);
    expect(errors).toEqual([]);
  });

  it('returns null (not a fabricated 0) when there are no baseline rows yet, even with recent rows present', async () => {
    const now = Date.now();
    // Every prior row is within the last 90 days -- no true baseline exists yet.
    const priorRows = [
      { raw_value: 100, fetched_at: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString() },
      { raw_value: 110, fetched_at: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString() },
    ];
    const supabase = makeSupabase({ priorRows });
    const errors = [];

    const slope = await computeSlopeAndPersist({
      supabase,
      source: 'test_source',
      queryTerm: 'test-term',
      family: 'money_in',
      rawValue: 110,
      observation: { fetched_at: new Date(now).toISOString(), content_hash: 'abc', transform_version: 'v1' },
      errors,
    });

    expect(slope).toBeNull();
  });

  it('never produces a slope magnitude that could overflow a NUMERIC(5,2) column, even from huge raw install-count deltas', async () => {
    const now = Date.now();
    const priorRows = [
      { raw_value: 1000, fetched_at: new Date(now - 200 * 24 * 60 * 60 * 1000).toISOString() },
      { raw_value: 6_000_000, fetched_at: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString() },
    ];
    const supabase = makeSupabase({ priorRows });
    const errors = [];

    const slope = await computeSlopeAndPersist({
      supabase,
      source: 'wordpress_plugins',
      queryTerm: 'popular-plugin',
      family: 'money_in',
      rawValue: 6_000_000,
      observation: { fetched_at: new Date(now).toISOString(), content_hash: 'abc', transform_version: 'v1' },
      errors,
    });

    expect(Math.abs(slope)).toBeLessThanOrEqual(SLOPE_CLAMP_ABS);
    // Sanity: NUMERIC(5,2) max is ~999.99; even summing 4 such slopes at max
    // family weight (0.35) stays at 140, nowhere near overflow.
    expect(Math.abs(slope) * 0.35).toBeLessThan(999.99);
  });

  it('applies a custom extractValue uniformly to historical AND current rows (object raw_value support)', async () => {
    const now = Date.now();
    const priorRows = [
      { raw_value: { complaintDensity: 0.1 }, fetched_at: new Date(now - 200 * 24 * 60 * 60 * 1000).toISOString() },
      { raw_value: { complaintDensity: 0.2 }, fetched_at: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString() },
    ];
    const supabase = makeSupabase({ priorRows });
    const errors = [];

    const slope = await computeSlopeAndPersist({
      supabase,
      source: 'reddit',
      queryTerm: 'test-term',
      family: 'structural',
      rawValue: { complaintDensity: 0.2, totalPosts: 10, complaintMatches: 2 },
      observation: { fetched_at: new Date(now).toISOString(), content_hash: 'abc', transform_version: 'v1' },
      errors,
      extractValue: (v) => (v && typeof v.complaintDensity === 'number' ? v.complaintDensity : null),
    });

    expect(slope).toBe(100); // (0.2-0.1)/0.1*100
  });

  it('persists the raw_value verbatim (full object, not just the extracted numeric signal)', async () => {
    const supabase = makeSupabase({ priorRows: [] });
    const errors = [];
    const rawValue = { complaintDensity: 0.3, totalPosts: 20, complaintMatches: 6 };

    await computeSlopeAndPersist({
      supabase,
      source: 'reddit',
      queryTerm: 'test-term',
      family: 'structural',
      rawValue,
      observation: { fetched_at: new Date().toISOString(), content_hash: 'abc', transform_version: 'v1' },
      errors,
      extractValue: (v) => v?.complaintDensity ?? null,
    });

    expect(supabase.inserted).toHaveLength(1);
    expect(supabase.inserted[0].raw_value).toEqual(rawValue);
  });

  it('returns null without throwing when supabase is not provided', async () => {
    const slope = await computeSlopeAndPersist({
      supabase: null,
      source: 'x',
      queryTerm: 'y',
      family: 'money_in',
      rawValue: 1,
      observation: { fetched_at: new Date().toISOString(), content_hash: 'abc', transform_version: 'v1' },
      errors: [],
    });
    expect(slope).toBeNull();
  });
});

describe('extractNumeric', () => {
  it('accepts only finite bare numbers', () => {
    expect(extractNumeric(42)).toBe(42);
    expect(extractNumeric(NaN)).toBeNull();
    expect(extractNumeric('42')).toBeNull();
    expect(extractNumeric({ value: 42 })).toBeNull();
    expect(extractNumeric(null)).toBeNull();
  });
});
