/**
 * SD-LEO-INFRA-CONVERGENCE-CIRCUIT-BREAKERS-001 (FR-4) — the 4 breakers + churn-abort + the launch gate +
 * the convertSprintToSDs wiring.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  evaluateBreakers,
  checkConvergenceLaunchAllowed,
  getBreakerMetrics,
  DEFAULT_THRESHOLDS,
} from '../../../lib/coordinator/convergence-breakers.js';
import { convertSprintToSDs } from '../../../lib/eva/lifecycle-sd-bridge.js';

const CLEAN = { productPerDay: 8, worstStageFixCycles: 1, walkSpawnedToday: 2, walkSpawnedCumulative: 5, issuesTrendingDown: true };

describe('FR-1: evaluateBreakers (pure)', () => {
  it('a clean metrics set allows the launch', () => {
    const r = evaluateBreakers(CLEAN);
    expect(r.allowed).toBe(true);
    expect(r.tripped).toHaveLength(0);
  });

  it('B1 product_throughput_floor trips when product/day is below the floor', () => {
    const r = evaluateBreakers({ ...CLEAN, productPerDay: 1 });
    expect(r.allowed).toBe(false);
    expect(r.tripped.map((b) => b.breaker)).toContain('product_throughput_floor');
  });

  it('B2 per_stage_churn_cap trips at the cap', () => {
    const r = evaluateBreakers({ ...CLEAN, worstStageFixCycles: DEFAULT_THRESHOLDS.stage_churn_cap });
    expect(r.allowed).toBe(false);
    expect(r.tripped.map((b) => b.breaker)).toContain('per_stage_churn_cap');
  });

  it('B3 walk_spawned_daily_budget trips over the daily budget', () => {
    const r = evaluateBreakers({ ...CLEAN, walkSpawnedToday: DEFAULT_THRESHOLDS.walk_spawned_daily_budget + 1 });
    expect(r.allowed).toBe(false);
    expect(r.tripped.map((b) => b.breaker)).toContain('walk_spawned_daily_budget');
  });

  it('B4 walk_spawned_cumulative_budget trips over the cumulative budget', () => {
    const r = evaluateBreakers({ ...CLEAN, walkSpawnedCumulative: DEFAULT_THRESHOLDS.walk_spawned_cumulative_budget + 1 });
    expect(r.allowed).toBe(false);
    expect(r.tripped.map((b) => b.breaker)).toContain('walk_spawned_cumulative_budget');
  });

  it('churn_abort trips when issues are NOT trending down', () => {
    const r = evaluateBreakers({ ...CLEAN, issuesTrendingDown: false });
    expect(r.allowed).toBe(false);
    expect(r.tripped.map((b) => b.breaker)).toContain('churn_abort');
  });

  it('thresholds are overridable', () => {
    // a stricter product floor trips a previously-clean set
    expect(evaluateBreakers(CLEAN, { product_floor_per_day: 10 }).allowed).toBe(false);
  });
});

// Mock supabase covering the head-count (product throughput + walk-spawned), the worst-stage read, and the trend.
const WALK_MARKER_KEY = 'metadata->>convergence_walk_run_id';
function makeSb(cfg) {
  return {
    from(table) {
      const ctx = { table, filters: {}, count: false };
      const builder = {
        select(_c, opts) { if (opts && opts.count) ctx.count = true; return builder; },
        eq(c, v) { ctx.filters[c] = v; return builder; },
        like(c, v) { ctx.filters[`like:${c}`] = v; return builder; },
        gte(c, v) { ctx.filters[`gte:${c}`] = v; return builder; },
        not() { return builder; },
        order() { return builder; },
        limit() { return builder; },
        async maybeSingle() { return { data: cfg.resolve ? cfg.resolve(ctx, 'single') : null, error: null }; },
        then(resolve) {
          if (ctx.count) return resolve({ count: cfg.count ? cfg.count(ctx) : 0, error: null });
          return resolve({ data: cfg.resolve ? cfg.resolve(ctx, 'list') : [], error: null });
        },
      };
      return builder;
    },
  };
}

describe('FR-2/FR-3: getBreakerMetrics + checkConvergenceLaunchAllowed (mock supabase)', () => {
  // product=8/day, walk-spawned today=2 / cumulative=5, worst stage=1, trend decreasing -> all clean.
  const cleanSb = makeSb({
    count: (ctx) => {
      if (ctx.filters['like:sd_key']) return 8;            // product throughput/day
      if (ctx.filters[WALK_MARKER_KEY]) return 5;          // walk-spawned cumulative (eq run_id)
      return 2;                                            // walk-spawned today (sinceIso only)
    },
    resolve: (ctx, kind) => {
      if (ctx.table === 'convergence_ledger_stages') return kind === 'single' ? { fix_cycle_count: 1 } : [{ issues_found: 1 }];
      if (ctx.table === 'convergence_ledger_runs') return [{ run_id: 'r1', started_at: 'x' }];
      return [];
    },
  });

  it('getBreakerMetrics gathers via the ledger SSOT + product telemetry', async () => {
    const m = await getBreakerMetrics(cleanSb, { run_id: 'r1' });
    expect(m.productPerDay).toBe(8);
    expect(m.worstStageFixCycles).toBe(1);
    expect(m.walkSpawnedCumulative).toBe(5);
    expect(typeof m.issuesTrendingDown).toBe('boolean');
  });

  it('checkConvergenceLaunchAllowed allows a clean state', async () => {
    const r = await checkConvergenceLaunchAllowed(cleanSb, { run_id: 'r1' });
    expect(r.allowed).toBe(true);
    expect(r.advisory).toBeNull();
  });

  it('checkConvergenceLaunchAllowed blocks + emits a loud advisory on a trip', async () => {
    // starve product to 1/day -> B1 trips
    const trippedSb = makeSb({
      count: (ctx) => (ctx.filters['like:sd_key'] ? 1 : (ctx.filters[WALK_MARKER_KEY] ? 5 : 2)),
      resolve: (ctx, kind) => {
        if (ctx.table === 'convergence_ledger_stages') return kind === 'single' ? { fix_cycle_count: 1 } : [{ issues_found: 1 }];
        if (ctx.table === 'convergence_ledger_runs') return [{ run_id: 'r1', started_at: 'x' }];
        return [];
      },
    });
    const emit = vi.fn();
    const r = await checkConvergenceLaunchAllowed(trippedSb, { run_id: 'r1', emitAdvisory: emit, log: () => {} });
    expect(r.allowed).toBe(false);
    expect(r.tripped.map((b) => b.breaker)).toContain('product_throughput_floor');
    expect(r.advisory).toMatch(/CIRCUIT-BREAKER TRIPPED/);
    expect(emit).toHaveBeenCalledTimes(1);
  });
});

describe('FR-5: convertSprintToSDs gate wiring', () => {
  const baseParams = {
    stageOutput: { sprint_name: 'S', sprint_goal: 'g', sprint_duration_days: 1, sd_bridge_payloads: [{ title: 'x' }] },
    ventureContext: { id: 'v1', name: 'V' },
  };
  const nonPilotFlags = async () => ({ is_demo: false, is_scaffolding: false, seeded_from_venture_id: null });

  it('a convergence launch (convergenceRunId) with a tripped breaker does NOT create the tree', async () => {
    const res = await convertSprintToSDs(
      { ...baseParams, options: { convergenceRunId: 'run-1' } },
      {
        supabase: makeSb({}),
        logger: { log: () => {}, warn: () => {} },
        fetchVentureFlags: nonPilotFlags,
        checkConvergenceLaunchAllowed: async () => ({ allowed: false, tripped: [{ breaker: 'churn_abort' }], advisory: 'STOP' }),
      }
    );
    expect(res.created).toBe(false);
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe('convergence_breaker_tripped');
    expect(res.tripped[0].breaker).toBe('churn_abort');
  });

  it('an organic build (NO convergenceRunId) never calls the breaker gate', async () => {
    const gate = vi.fn(async () => ({ allowed: false, tripped: [], advisory: 'x' }));
    // No convergenceRunId -> the gate must not be consulted. We stop the build right after via an empty
    // payload check is not hit (payloads present), so let the pilot path proceed; assert the gate was never called.
    await convertSprintToSDs(
      { ...baseParams, options: {} },
      { supabase: makeSb({}), logger: { log: () => {}, warn: () => {} }, fetchVentureFlags: nonPilotFlags, checkConvergenceLaunchAllowed: gate }
    ).catch(() => {});
    expect(gate).not.toHaveBeenCalled();
  });
});
