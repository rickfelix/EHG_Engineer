/**
 * Unit tests for the real-build STALL alarm.
 * SD-LEO-INFRA-VENTURE-REAL-DISCRIMINATOR-AND-STALL-ALARM-001-B (Part 2, FR-4).
 *
 * These pin the DERIVED rule: alarm iff the venture is BOTH divergent (per the Child-A
 * discriminator: stage past STAGE_SIMULATION_OK with no real-build evidence) AND stalled
 * (no forward motion for >= its tiered day-clock). They RED against a naive
 * `orchestrator_state==='blocked' => stall` rule (which would flag a divergent-but-progressing
 * venture whose gate is legitimately working) and against a naive `stage>=N => stall` rule
 * (which would flag a real-build-started venture, or a divergent venture that just advanced),
 * and GREEN only with the divergent + stalled + tiered rule. No live DB — plain objects only.
 *
 * The integration block mirrors tests/unit/adam/adam-quiet-tick-venture-stall.test.js: it drives
 * the real checkVentureTraversalStalls against a filter-applying supabase mock and asserts the
 * DISTINCT real_build_stall class surfaces (or does not) without regressing the class-1 scan.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STALL_CLOCK_DAYS,
  resolveStallClockDays,
  resolveStallClockTier,
  evaluateRealBuildStall,
} from '../../../lib/governance/real-build-stall-alarm.mjs';
import { checkVentureTraversalStalls } from '../../../scripts/adam-quiet-tick.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-07-21T12:00:00Z');
const daysAgo = (n, base = NOW) => new Date(base - n * DAY_MS).toISOString();

// A divergent venture: stage past STAGE_SIMULATION_OK (18), no real-build evidence, simulated.
const divergentVenture = (overrides = {}) => ({
  current_lifecycle_stage: 19,
  launch_mode: 'simulated',
  deployment_url: null,
  repo_url: null,
  workflow_started_at: null,
  metadata: {},
  ...overrides,
});

describe('evaluateRealBuildStall — divergent AND stalled is the ONLY alarm condition', () => {
  it('divergent + stalled (elapsed >= clock) => alarm:true, reason divergent-and-stalled', () => {
    const r = evaluateRealBuildStall(divergentVenture(), { now: NOW, lastStageAdvanceAt: daysAgo(20) });
    expect(r.alarm).toBe(true);
    expect(r.reason).toBe('divergent-and-stalled');
    expect(r.clock_days).toBe(DEFAULT_STALL_CLOCK_DAYS);
    expect(r.elapsed_days).toBeGreaterThanOrEqual(DEFAULT_STALL_CLOCK_DAYS);
  });

  it('divergent but recently advanced (elapsed < clock) => alarm:false, reason gated-or-progressing', () => {
    // A working S19_HARD_GATE block IS the gate doing its job — not a stall. A naive
    // `stage>=N => stall` rule would FALSELY flag this; the time axis is what saves it.
    const r = evaluateRealBuildStall(divergentVenture(), { now: NOW, lastStageAdvanceAt: daysAgo(3) });
    expect(r.alarm).toBe(false);
    expect(r.reason).toBe('gated-or-progressing');
  });

  it('real-build venture (isRealBuildStarted true) => alarm:false, reason real-build-or-not-divergent', () => {
    // Even at a high stage and long-idle, a venture whose real build has started is NOT divergent,
    // so it can never trip this alarm. A naive `blocked/high-stage => stall` rule would flag it.
    const r = evaluateRealBuildStall(
      divergentVenture({ deployment_url: 'https://app.example.com' }),
      { now: NOW, lastStageAdvanceAt: daysAgo(100) },
    );
    expect(r.alarm).toBe(false);
    expect(r.reason).toBe('real-build-or-not-divergent');
  });

  it('divergent but lastStageAdvanceAt null => alarm:false, reason no-stall-signal (no false alarm on missing data)', () => {
    const r = evaluateRealBuildStall(divergentVenture(), { now: NOW, lastStageAdvanceAt: null });
    expect(r.alarm).toBe(false);
    expect(r.reason).toBe('no-stall-signal');
  });

  it('early-stage simulated venture (not divergent) => alarm:false regardless of idle time', () => {
    const r = evaluateRealBuildStall(divergentVenture({ current_lifecycle_stage: 10 }), { now: NOW, lastStageAdvanceAt: daysAgo(90) });
    expect(r.alarm).toBe(false);
    expect(r.reason).toBe('real-build-or-not-divergent');
  });

  it('boundary: elapsed exactly at the clock alarms; one day under does not', () => {
    const atClock = evaluateRealBuildStall(divergentVenture(), { now: NOW, lastStageAdvanceAt: daysAgo(DEFAULT_STALL_CLOCK_DAYS) });
    const underClock = evaluateRealBuildStall(divergentVenture(), { now: NOW, lastStageAdvanceAt: daysAgo(DEFAULT_STALL_CLOCK_DAYS - 1) });
    expect(atClock.alarm).toBe(true);
    expect(underClock.alarm).toBe(false);
  });

  it('never throws on malformed input', () => {
    expect(() => evaluateRealBuildStall(undefined, {})).not.toThrow();
    expect(() => evaluateRealBuildStall({}, { now: 'nonsense', lastStageAdvanceAt: 'nonsense' })).not.toThrow();
    expect(evaluateRealBuildStall({}, {}).alarm).toBe(false);
  });
});

describe('resolveStallClockDays / resolveStallClockTier — tiered clock with fail-safe to default', () => {
  it('no metadata.stall_clock_tier => DEFAULT', () => {
    expect(resolveStallClockDays({})).toBe(DEFAULT_STALL_CLOCK_DAYS);
    expect(resolveStallClockDays({ metadata: {} })).toBe(DEFAULT_STALL_CLOCK_DAYS);
    expect(resolveStallClockTier({}).tier).toBe('default');
  });

  it('valid shorter clock as a bare number => that shorter value (alarms sooner)', () => {
    expect(resolveStallClockDays({ metadata: { stall_clock_tier: 7 } })).toBe(7);
    expect(resolveStallClockTier({ metadata: { stall_clock_tier: 7 } }).tier).toBe('flagship');
  });

  it('valid shorter clock as an object => that shorter value, tier label honored', () => {
    expect(resolveStallClockDays({ metadata: { stall_clock_tier: { clock_days: 5 } } })).toBe(5);
    const t = resolveStallClockTier({ metadata: { stall_clock_tier: { tier: 'flagship', clock_days: 3 } } });
    expect(t.clock_days).toBe(3);
    expect(t.tier).toBe('flagship');
  });

  it('malformed / negative / zero / longer-than-default => DEFAULT (fail-safe, never accidentally stricter)', () => {
    expect(resolveStallClockDays({ metadata: { stall_clock_tier: 'soon' } })).toBe(DEFAULT_STALL_CLOCK_DAYS);
    expect(resolveStallClockDays({ metadata: { stall_clock_tier: -5 } })).toBe(DEFAULT_STALL_CLOCK_DAYS);
    expect(resolveStallClockDays({ metadata: { stall_clock_tier: 0 } })).toBe(DEFAULT_STALL_CLOCK_DAYS);
    expect(resolveStallClockDays({ metadata: { stall_clock_tier: DEFAULT_STALL_CLOCK_DAYS + 30 } })).toBe(DEFAULT_STALL_CLOCK_DAYS);
    expect(resolveStallClockDays({ metadata: { stall_clock_tier: { clock_days: -1 } } })).toBe(DEFAULT_STALL_CLOCK_DAYS);
  });

  it('a shorter flagship clock makes a venture alarm sooner than the default would', () => {
    const venture = divergentVenture({ metadata: { stall_clock_tier: 7 } });
    // Idle 8 days: under the 14-day default (no alarm) but over the 7-day flagship clock (alarm).
    expect(evaluateRealBuildStall(divergentVenture(), { now: NOW, lastStageAdvanceAt: daysAgo(8) }).alarm).toBe(false);
    const r = evaluateRealBuildStall(venture, { now: NOW, lastStageAdvanceAt: daysAgo(8) });
    expect(r.alarm).toBe(true);
    expect(r.clock_days).toBe(7);
    expect(r.tier).toBe('flagship');
  });
});

// --- Integration: the real checkVentureTraversalStalls surfaces the DISTINCT real_build_stall
// class without regressing class-1. Mirrors the sibling adam-quiet-tick-venture-stall harness. ---
function ventureBuilder(rows) {
  const filters = [];
  const b = {
    select: () => b,
    eq: (col, val) => { filters.push((r) => r[col] === val); return b; },
    lt: (col, val) => { filters.push((r) => r[col] < val); return b; },
    is: (col, val) => { filters.push((r) => r[col] == val); return b; },
    order: () => b,
    range: () => Promise.resolve({ data: rows.filter((r) => filters.every((f) => f(r))), error: null }),
    then: (resolve, reject) => Promise.resolve({ data: rows.filter((r) => filters.every((f) => f(r))), error: null }).then(resolve, reject),
  };
  return b;
}

function makeSupabase({ ventures = [], staleStageExecutions = new Set() } = {}) {
  return {
    from(table) {
      if (table === 'ventures') return ventureBuilder(ventures);
      if (table === 'stage_executions') {
        let lastVentureId = null;
        const b = {
          select: () => b,
          eq: (col, val) => { if (col === 'venture_id') lastVentureId = val; return b; },
          gte: () => b,
          limit: () => b,
          then: (resolve, reject) => {
            const data = staleStageExecutions.has(lastVentureId) ? [] : [{ id: 'se-1' }];
            return Promise.resolve({ data, error: null }).then(resolve, reject);
          },
        };
        return b;
      }
      return { select: () => ({ then: (res) => Promise.resolve({ data: [], error: null }).then(res) }) };
    },
  };
}

describe('checkVentureTraversalStalls — real_build_stall class (integration)', () => {
  it('surfaces a divergent + stalled venture as the DISTINCT real_build_stall class', async () => {
    const sb = makeSupabase({
      ventures: [divergentVenture({
        id: 'rb1', name: 'ApexNiche AI', status: 'active', orchestrator_state: 'blocked',
        is_demo: false, deleted_at: null, updated_at: daysAgo(20, Date.now()),
      })],
      staleStageExecutions: new Set(['rb1']), // no fresh stage row => stalled
    });
    const result = await checkVentureTraversalStalls(sb, {}, {});
    expect(result.realBuildStalled).toHaveLength(1);
    expect(result.realBuildStalled[0]).toMatchObject({ id: 'rb1', class: 'real_build_stall', reason: 'divergent-and-stalled', escalated: false });
    expect(result.realBuildSnapshot.rb1).toBeTruthy();
  });

  it('escalates a real_build_stall venture already present in the prior real-build snapshot', async () => {
    const sb = makeSupabase({
      ventures: [divergentVenture({
        id: 'rb1', name: 'ApexNiche AI', status: 'active', orchestrator_state: 'blocked',
        is_demo: false, deleted_at: null, updated_at: daysAgo(20, Date.now()),
      })],
      staleStageExecutions: new Set(['rb1']),
    });
    const result = await checkVentureTraversalStalls(sb, {}, { rb1: Date.now() - 60_000 });
    expect(result.realBuildStalled[0].escalated).toBe(true);
  });

  it('does NOT surface real_build_stall for a divergent-but-progressing venture (gate working, not a stall)', async () => {
    const sb = makeSupabase({
      ventures: [divergentVenture({
        id: 'rb2', name: 'Progressing Venture', status: 'active', orchestrator_state: 'blocked',
        is_demo: false, deleted_at: null, updated_at: daysAgo(2, Date.now()),
      })],
      staleStageExecutions: new Set(), // fresh stage row => actively progressing
    });
    const result = await checkVentureTraversalStalls(sb, {}, {});
    expect(result.realBuildStalled).toHaveLength(0);
  });

  it('does NOT surface real_build_stall for a stalled but non-divergent (real-build-started) venture', async () => {
    const sb = makeSupabase({
      ventures: [divergentVenture({
        id: 'rb3', name: 'Real Build Venture', status: 'active', orchestrator_state: 'blocked',
        is_demo: false, deleted_at: null, updated_at: daysAgo(40, Date.now()),
        deployment_url: 'https://app.example.com',
      })],
      staleStageExecutions: new Set(['rb3']),
    });
    const result = await checkVentureTraversalStalls(sb, {}, {});
    expect(result.realBuildStalled).toHaveLength(0);
    // class-1 (orchestrator-blocked) still fires — the two classes are independent, no regression.
    expect(result.alerted).toHaveLength(1);
  });

  it('is fail-soft: a throwing client returns empty real_build_stall + the prior real-build snapshot', async () => {
    const sb = { from: () => { throw new Error('boom'); } };
    const priorRb = { rb9: 123 };
    await expect(checkVentureTraversalStalls(sb, {}, priorRb)).resolves.toMatchObject({
      alerted: [], realBuildStalled: [], realBuildSnapshot: priorRb,
    });
  });
});
