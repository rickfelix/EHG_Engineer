/**
 * Integration test for the market-signal-scanner CLI wiring (FR-3/FR-4).
 * SD: SD-LEO-INFRA-MARKET-SIGNAL-SCANNER-001
 *
 * Uses a fake in-memory Supabase client (routing by table name -- only
 * 'market_signal_scanner_budget' and 'venture_nursery' are exercised, since
 * the source fetchers are dependency-injected fakes that never touch
 * supabase directly) plus mocked source fetchers. parkVenture() itself is
 * the REAL implementation (lib/eva/stage-zero/venture-nursery.js) -- not
 * mocked -- so these assertions prove genuine integration through the
 * proven insert path, not just that runScan() calls a spy correctly.
 */

import { describe, it, expect, vi } from 'vitest';
import { runScan, SD_KEY } from '../../../scripts/market-signal-scan.mjs';
import { DEFAULT_CAP_USD } from '../../../lib/market-signal-scanner/budget-guard.js';

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

/** In-memory fake Supabase client routing by table name; also records the
 * order tables are touched in (shared with fetcher call markers) so budget-
 * before-fetch ordering can be asserted directly. */
function makeFakeSupabase({ budgetRow, callOrder = [] } = {}) {
  const budgetRows = new Map(budgetRow ? [[budgetRow.month_key, budgetRow]] : []);
  const nurseryInserts = [];

  function from(table) {
    if (table === 'market_signal_scanner_budget') {
      callOrder.push('budget');
      return {
        select() {
          return {
            eq(_col, monthKey) {
              return {
                async maybeSingle() {
                  const row = budgetRows.get(monthKey);
                  return { data: row ? { ...row } : null, error: null };
                },
              };
            },
          };
        },
        insert(row) {
          return {
            select: () => ({
              async single() {
                const stored = {
                  month_key: row.month_key,
                  spent_usd: row.spent_usd ?? 0,
                  cap_usd: row.cap_usd ?? DEFAULT_CAP_USD,
                  updated_at: new Date().toISOString(),
                };
                budgetRows.set(row.month_key, stored);
                return { data: { ...stored }, error: null };
              },
            }),
          };
        },
      };
    }

    if (table === 'venture_nursery') {
      return {
        insert(payload) {
          nurseryInserts.push(payload);
          return {
            select: () => ({
              async single() {
                return { data: { id: `nursery-${nurseryInserts.length}`, ...payload }, error: null };
              },
            }),
          };
        },
      };
    }

    // Not exercised in this test (fetchers are mocked and never call supabase),
    // but kept harmless in case anything unexpected reaches it.
    return {
      select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ gte: async () => ({ data: [], error: null }) }) }) }) }),
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
    };
  }

  return { from, __nurseryInserts: nurseryInserts };
}

/** A family reading fixture with one attested observation. */
function reading(family, slope, hash) {
  return {
    family,
    slope_90d_vs_baseline: slope,
    observations: [
      {
        source: 'fixture',
        raw_value: slope,
        source_url: 'https://example.test',
        content_hash: hash,
        fetched_at: new Date().toISOString(),
        transform_version: 'v1',
      },
    ],
  };
}

function makeCallOrderTrackingFetchers(callOrder) {
  return {
    wordpressPlugins: vi.fn(async () => {
      callOrder.push('fetch:wordpress_plugins');
      return { readings: [reading('money_in', 10, 'hash-money-in'), reading('stickiness', 5, 'hash-stickiness')], errors: [] };
    }),
    reddit: vi.fn(async () => {
      callOrder.push('fetch:reddit');
      return { readings: [reading('structural', 2, 'hash-structural')], errors: [] };
    }),
    googleTrends: vi.fn(async () => {
      callOrder.push('fetch:google_trends');
      return { readings: [reading('attention', 1, 'hash-attention')], errors: [] };
    }),
  };
}

describe('market-signal-scan CLI wiring (FR-3/FR-4)', () => {
  it('(a) a niche clearing triangulation produces a real venture_nursery insert with the documented source_ref shape', async () => {
    const callOrder = [];
    const fetchers = makeCallOrderTrackingFetchers(callOrder);
    const supabase = makeFakeSupabase({ callOrder });

    const result = await runScan({
      supabase,
      fetchers,
      candidates: [{ term: 'ai meeting notes', category: '', keywords: [], description: '' }],
      logger: silentLogger,
      runId: 'run-fixture-1',
    });

    expect(result.nominations).toBe(1);
    expect(supabase.__nurseryInserts).toHaveLength(1);

    const payload = supabase.__nurseryInserts[0];
    expect(payload.source_type).toBe('discovery_mode');
    expect(payload.maturity_level).toBe('seed');
    expect(payload.source_ref.synthesis_snapshot).toMatchObject({
      source: 'market-signal-scanner',
      run_id: 'run-fixture-1',
      sd_key: SD_KEY,
    });
    expect(typeof payload.source_ref.synthesis_snapshot.niche_score).toBe('number');
    expect(payload.source_ref.synthesis_snapshot.family_scores).toMatchObject({
      money_in: 10,
      stickiness: 5,
      structural: 2,
      attention: 1,
    });
    expect(payload.source_ref.synthesis_snapshot.raw_observation_refs.sort()).toEqual(
      ['hash-money-in', 'hash-stickiness', 'hash-structural', 'hash-attention'].sort()
    );
    expect(payload.current_score).toBe(payload.source_ref.synthesis_snapshot.niche_score);
  });

  it('(a-regression) a parkVenture insert failure for one niche does not abort the remaining candidates in the cycle (adversarial-review fix, PR #6142)', async () => {
    const callOrder = [];
    const fetchers = makeCallOrderTrackingFetchers(callOrder);
    const supabase = makeFakeSupabase({ callOrder });
    const warnLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

    let calls = 0;
    const flakyParkVentureFn = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error('simulated numeric field overflow');
      return { id: 'nursery-2' };
    });

    const result = await runScan({
      supabase,
      fetchers,
      parkVentureFn: flakyParkVentureFn,
      candidates: [
        { term: 'niche one', category: '', keywords: [], description: '' },
        { term: 'niche two', category: '', keywords: [], description: '' },
      ],
      logger: warnLogger,
    });

    expect(flakyParkVentureFn).toHaveBeenCalledTimes(2);
    expect(result.nominations).toBe(1); // only the second (successful) nomination counts
    expect(warnLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('niche one')
    );
    expect(warnLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('simulated numeric field overflow')
    );
  });

  it('(b) a niche that fails triangulation produces NO venture_nursery insert call', async () => {
    const callOrder = [];
    // Only 2 distinct families (structural + attention), no money_in/stickiness -- must fail.
    const fetchers = {
      wordpressPlugins: vi.fn(async () => ({ readings: [], errors: [] })),
      reddit: vi.fn(async () => ({ readings: [reading('structural', 5, 'h1')], errors: [] })),
      googleTrends: vi.fn(async () => ({ readings: [reading('attention', 9, 'h2')], errors: [] })),
    };
    const supabase = makeFakeSupabase({ callOrder });

    const result = await runScan({
      supabase,
      fetchers,
      candidates: [{ term: 'losing niche', category: '', keywords: [], description: '' }],
      logger: silentLogger,
    });

    expect(result.nominations).toBe(0);
    expect(supabase.__nurseryInserts).toHaveLength(0);
  });

  it('(c) a 0-nomination cycle across all candidates calls the honest-idle reporter and writes zero rows', async () => {
    const fetchers = {
      wordpressPlugins: vi.fn(async () => ({ readings: [], errors: [] })),
      reddit: vi.fn(async () => ({ readings: [reading('structural', 1, 'h1')], errors: [] })),
      googleTrends: vi.fn(async () => ({ readings: [reading('attention', 1, 'h2')], errors: [] })),
    };
    const supabase = makeFakeSupabase({});
    const reportIdleCycleFn = vi.fn();

    const result = await runScan({
      supabase,
      fetchers,
      reportIdleCycleFn,
      candidates: [
        { term: 'niche one', category: '', keywords: [], description: '' },
        { term: 'niche two', category: '', keywords: [], description: '' },
      ],
      logger: silentLogger,
    });

    expect(result.nominations).toBe(0);
    expect(supabase.__nurseryInserts).toHaveLength(0);
    expect(reportIdleCycleFn).toHaveBeenCalledTimes(1);
    expect(reportIdleCycleFn).toHaveBeenCalledWith(silentLogger);
  });

  it('(d) the budget guard is checked before any fetch work begins, and blocks the cycle when the cap is exceeded', async () => {
    const now = new Date();
    const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const callOrder = [];
    const fetchers = makeCallOrderTrackingFetchers(callOrder);
    const supabase = makeFakeSupabase({
      budgetRow: { month_key: monthKey, spent_usd: DEFAULT_CAP_USD, cap_usd: DEFAULT_CAP_USD },
      callOrder,
    });

    const result = await runScan({
      supabase,
      fetchers,
      candidates: [{ term: 'ai meeting notes', category: '', keywords: [], description: '' }],
      logger: silentLogger,
    });

    expect(result.budgetAllowed).toBe(false);
    expect(result.ranFetch).toBe(false);
    expect(result.nominations).toBe(0);
    expect(fetchers.wordpressPlugins).not.toHaveBeenCalled();
    expect(fetchers.reddit).not.toHaveBeenCalled();
    expect(fetchers.googleTrends).not.toHaveBeenCalled();
    expect(supabase.__nurseryInserts).toHaveLength(0);
    // Only the budget table was ever touched -- no fetch markers precede or follow it.
    expect(callOrder).toEqual(['budget']);
  });

  it('budget guard is checked before fetch work even when the cycle proceeds (ordering, not just gating)', async () => {
    const callOrder = [];
    const fetchers = makeCallOrderTrackingFetchers(callOrder);
    const supabase = makeFakeSupabase({ callOrder });

    await runScan({
      supabase,
      fetchers,
      candidates: [{ term: 'ai meeting notes', category: '', keywords: [], description: '' }],
      logger: silentLogger,
    });

    expect(callOrder[0]).toBe('budget');
    expect(callOrder.indexOf('budget')).toBeLessThan(callOrder.indexOf('fetch:wordpress_plugins'));
  });
});
