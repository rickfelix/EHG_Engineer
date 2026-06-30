/**
 * SD-LEO-INFRA-CONVERGENCE-LEDGER-001 (FR-7) — convergence ledger read SSOT + pure trend.
 *
 * Pure isTrendingDown coverage + the read helpers (getActiveRun / getStageChurn / getWalkSpawnedCount /
 * getIssuesPerRunTrend) against a mock supabase. The table DDL is validated separately by the DATABASE
 * sub-agent via a rolled-back transaction.
 */
import { describe, it, expect } from 'vitest';
import {
  isTrendingDown,
  getActiveRun,
  getStageChurn,
  getWalkSpawnedCount,
  getIssuesPerRunTrend,
  RUNS_TABLE,
  STAGES_TABLE,
} from '../../../lib/coordinator/convergence-ledger.js';

describe('FR-4: isTrendingDown (pure)', () => {
  it('true for a strictly decreasing series', () => {
    expect(isTrendingDown([10, 7, 4, 1])).toBe(true);
  });
  it('false for a non-decreasing (flat or rising) series', () => {
    expect(isTrendingDown([5, 5, 5])).toBe(false);  // flat -> not converging
    expect(isTrendingDown([3, 4, 2])).toBe(false);  // a later run rose above the prior
    expect(isTrendingDown([1, 2, 3])).toBe(false);  // rising
  });
  it('true (not enough evidence) for 0- or 1-length / non-array input', () => {
    expect(isTrendingDown([])).toBe(true);
    expect(isTrendingDown([7])).toBe(true);
    expect(isTrendingDown(null)).toBe(true);
  });
  it('non-increasing with a strictly-lower end is trending down', () => {
    expect(isTrendingDown([8, 8, 5])).toBe(true);   // never rises, ends below start
    expect(isTrendingDown([8, 8, 8])).toBe(false);  // never drops
  });
});

// Mock supabase: per-table canned reads + a count head-query for walk-spawned.
function makeSb(cfg) {
  return {
    from(table) {
      const ctx = { table, filters: {}, count: false };
      const builder = {
        select(_cols, opts) { if (opts && opts.count) ctx.count = true; return builder; },
        eq(col, val) { ctx.filters[col] = val; return builder; },
        not() { return builder; },
        gte(col, val) { ctx.filters[`gte:${col}`] = val; return builder; },
        order() { return builder; },
        limit() { return builder; },
        async maybeSingle() { return { data: cfg.resolve(ctx), error: null }; },
        then(resolve) {
          if (ctx.count) return resolve({ count: cfg.count(ctx), error: null });
          return resolve({ data: cfg.resolve(ctx), error: null });
        },
      };
      return builder;
    },
  };
}

describe('read SSOT helpers (mock supabase)', () => {
  it('getActiveRun returns the active run row', async () => {
    const sb = makeSb({ resolve: (ctx) => (ctx.table === RUNS_TABLE && ctx.filters.status === 'active' ? { run_id: 'r1', status: 'active' } : null), count: () => 0 });
    const run = await getActiveRun(sb);
    expect(run.run_id).toBe('r1');
  });

  it('getStageChurn returns fix_cycle_count for (run_id, stage); 0 when absent', async () => {
    const sb = makeSb({ resolve: (ctx) => (ctx.table === STAGES_TABLE && ctx.filters.run_id === 'r1' && ctx.filters.stage === 19 ? { fix_cycle_count: 4 } : null), count: () => 0 });
    expect(await getStageChurn(sb, 'r1', 19)).toBe(4);
    expect(await getStageChurn(sb, 'r1', 5)).toBe(0); // no row -> 0
  });

  it('getWalkSpawnedCount counts walk-tagged SDs (by run_id), isolating organic SDs via the head count', async () => {
    const sb = makeSb({ resolve: () => null, count: (ctx) => (ctx.filters['metadata->>convergence_walk_run_id'] === 'r1' ? 3 : 7) });
    expect(await getWalkSpawnedCount(sb, { run_id: 'r1' })).toBe(3);
    expect(await getWalkSpawnedCount(sb, {})).toBe(7); // all walk-tagged (any run)
  });

  it('getIssuesPerRunTrend sums issues_found per run, oldest -> newest', async () => {
    const runs = [{ run_id: 'r-new', started_at: '2026-06-30T02:00:00Z' }, { run_id: 'r-old', started_at: '2026-06-30T01:00:00Z' }];
    const stagesByRun = { 'r-old': [{ issues_found: 6 }, { issues_found: 4 }], 'r-new': [{ issues_found: 2 }, { issues_found: 1 }] };
    const sb = makeSb({
      resolve: (ctx) => (ctx.table === RUNS_TABLE ? runs : (stagesByRun[ctx.filters.run_id] || [])),
      count: () => 0,
    });
    const series = await getIssuesPerRunTrend(sb, 2);
    expect(series).toEqual([10, 3]); // oldest (r-old=10) -> newest (r-new=3)
    expect(isTrendingDown(series)).toBe(true);
  });

  it('helpers fail safe without supabase', async () => {
    expect(await getActiveRun(null)).toBeNull();
    expect(await getStageChurn(null, 'r', 1)).toBe(0);
    expect(await getWalkSpawnedCount(null)).toBe(0);
    expect(await getIssuesPerRunTrend(null)).toEqual([]);
  });
});
