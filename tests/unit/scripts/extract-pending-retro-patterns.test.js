import { describe, it, expect, vi, beforeEach } from 'vitest';

// QF-20260911-299: the retro -> issue_patterns extraction hop had no invoker. This tests the
// batch DRIVER only (find every retrospective still missing learning_extracted_at, call the
// existing per-row extractor for each) -- extractPatternsFromRetrospective's own internals
// already have dedicated coverage elsewhere (tests/unit/learning/batch-resilience.test.js).
//
// auto-extract-patterns-from-retro.js constructs a Supabase service client AT MODULE SCOPE, so
// it is mocked wholesale here rather than merely stubbing its dependencies -- importing the
// real module at all would attempt that construction.
const extractPatternsFromRetrospective = vi.fn();
vi.mock('../../../scripts/auto-extract-patterns-from-retro.js', () => ({
  extractPatternsFromRetrospective,
}));

const { extractPendingRetroPatterns, LAG_ALARM_HOURS } = await import('../../../scripts/extract-pending-retro-patterns.mjs');

/** Fixture retrospectives query builder: .from().select().is().order().limit() -> {data, error}. */
function fixtureSupabase(rows) {
  return {
    from: () => ({
      select: () => ({
        is: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: rows, error: null }),
          }),
        }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('extractPendingRetroPatterns', () => {
  it('a fixture retrospective missing learning_extracted_at is extracted and counted', async () => {
    extractPatternsFromRetrospective.mockResolvedValue({ success: true });
    const supabase = fixtureSupabase([{ id: 'retro-1', created_at: new Date().toISOString() }]);

    const result = await extractPendingRetroPatterns({ supabase });

    expect(extractPatternsFromRetrospective).toHaveBeenCalledWith('retro-1');
    expect(result).toMatchObject({ candidates: 1, processed: 1, failed: 0 });
  });

  it('a second run over an already-extracted retrospective is a no-op (0 candidates)', async () => {
    // The driver's own query filters .is('learning_extracted_at', null) -- once extracted, a
    // retrospective simply never appears in the candidate set again.
    const supabase = fixtureSupabase([]);

    const result = await extractPendingRetroPatterns({ supabase });

    expect(extractPatternsFromRetrospective).not.toHaveBeenCalled();
    expect(result).toMatchObject({ candidates: 0, processed: 0, failed: 0 });
  });

  it('one retrospective failing extraction does not stop the rest of the batch', async () => {
    extractPatternsFromRetrospective
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ success: true });
    const supabase = fixtureSupabase([
      { id: 'retro-bad', created_at: new Date().toISOString() },
      { id: 'retro-good', created_at: new Date().toISOString() },
    ]);

    const result = await extractPendingRetroPatterns({ supabase });

    expect(extractPatternsFromRetrospective).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ candidates: 2, processed: 1, failed: 1 });
    expect(result.failures).toEqual([{ id: 'retro-bad', error: 'boom' }]);
  });

  it('alarms when the oldest candidate exceeds the lag threshold', async () => {
    extractPatternsFromRetrospective.mockResolvedValue({ success: true });
    const staleIso = new Date(Date.now() - (LAG_ALARM_HOURS + 1) * 3_600_000).toISOString();
    const supabase = fixtureSupabase([{ id: 'retro-stale', created_at: staleIso }]);

    const result = await extractPendingRetroPatterns({ supabase });

    expect(result.alarm).toBe(true);
  });

  it('does not alarm when the oldest candidate is within the lag threshold', async () => {
    extractPatternsFromRetrospective.mockResolvedValue({ success: true });
    const freshIso = new Date(Date.now() - 1 * 3_600_000).toISOString();
    const supabase = fixtureSupabase([{ id: 'retro-fresh', created_at: freshIso }]);

    const result = await extractPendingRetroPatterns({ supabase });

    expect(result.alarm).toBe(false);
  });

  it('propagates the query error rather than silently reporting zero candidates', async () => {
    const supabase = { from: () => ({ select: () => ({ is: () => ({ order: () => ({ limit: () => Promise.resolve({ data: null, error: new Error('query failed') }) }) }) }) }) };

    await expect(extractPendingRetroPatterns({ supabase })).rejects.toThrow('query failed');
  });
});
