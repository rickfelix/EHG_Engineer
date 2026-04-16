/**
 * Unit + performance tests for fleet-liveness-mc.cjs (PRD-SD-LEO-INFRA-FLEET-LIVENESS-MONTE-001).
 *
 * Covers:
 *   TS-1 LARGE EXEC 15m pid+port alive → P ≥ 0.80 (integration — synthetic input)
 *   TS-2 recent-commit short-circuit → P ≥ 0.95
 *   TS-3 sub-agent in flight → P ≥ 0.85
 *   TS-6 10-worker fleet performance < 100ms median
 *   TS-7 sparse-bucket fallback to phase-level prior
 *   TS-9 regression: hb<5m still active, no behavior change
 *   TS-10 JSON shape valid via module return
 *
 * Plus lower-level unit tests for scope classification, joint confusion matrix
 * structure, Box-Muller sample sanity, and beta CI bracketing.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { performance } from 'node:perf_hooks';

const require = createRequire(import.meta.url);
const mc = require('../../scripts/fleet-liveness-mc.cjs');

const PRIORS = mc.FALLBACK_PRIORS;

describe('fleet-liveness-mc — helpers', () => {
  it('classifyScope buckets by word + change count', () => {
    expect(mc.classifyScope({ description_words: 50, key_changes_len: 1 })).toBe('SMALL');
    expect(mc.classifyScope({ description_words: 200, key_changes_len: 4 })).toBe('MEDIUM');
    expect(mc.classifyScope({ description_words: 350, key_changes_len: 8, sd_type: 'infrastructure' })).toBe('LARGE');
    // Children bias smaller — same raw metrics should drop one bucket.
    expect(mc.classifyScope({ description_words: 200, key_changes_len: 4, is_child: true })).toBe('SMALL');
  });

  it('sampleNormal returns finite numeric with target mean', () => {
    const samples = Array.from({ length: 5000 }, () => mc.sampleNormal(10, 2));
    for (const s of samples) expect(Number.isFinite(s)).toBe(true);
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(Math.abs(mean - 10)).toBeLessThan(0.25); // within 0.25 of true mean at N=5000
  });

  it('sampleGapDistribution clamps at zero', () => {
    // Very negative mean + small stddev → always clamped to 0.
    const samples = Array.from({ length: 200 }, () => mc.sampleGapDistribution({ mean: -100, stddev: 1 }));
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(0);
  });

  it('betaCredibleInterval brackets the observed proportion', () => {
    // 90/100 successes → point estimate ~0.9, CI must bracket that.
    const ci = mc.betaCredibleInterval(90, 100);
    expect(ci.low).toBeLessThan(0.9);
    expect(ci.high).toBeGreaterThan(0.9);
    expect(ci.low).toBeGreaterThan(0.75);
    expect(ci.high).toBeLessThan(0.97);
  });

  it('JOINT_CONFUSION rows (alive, dead) each sum to 1', () => {
    for (const row of [mc.JOINT_CONFUSION.alive, mc.JOINT_CONFUSION.dead]) {
      const sum = Object.values(row).reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
    }
  });
});

describe('fleet-liveness-mc — computeLiveness scenarios', () => {
  // TS-2: recent commit short-circuits to P ≥ 0.95 regardless of heartbeat.
  it('TS-2: recent-commit (<3m) short-circuits to P ≥ 0.95', () => {
    const r = mc.computeLiveness(
      { session_id: 's-commit', heartbeat_age_sec: 1200, phase: 'EXEC', scope_bucket: 'MEDIUM', pid_alive: false, port_open: false },
      { recent_commit_sec: 120 },
      PRIORS,
    );
    expect(r.pAlive).toBeGreaterThanOrEqual(0.95);
    expect(r.samples).toBe(0);
    expect(r.signals.short_circuit).toBe('recent_commit');
  });

  // TS-1: LARGE EXEC 15m with pid+port alive → P ≥ 0.80.
  it('TS-1: LARGE EXEC 15m heartbeat with pid+port alive ⇒ P ≥ 0.80', () => {
    const r = mc.computeLiveness(
      { session_id: 's-large', heartbeat_age_sec: 900, phase: 'EXEC', scope_bucket: 'LARGE', pid_alive: true, port_open: true },
      {},
      PRIORS,
      { draws: 2000 },
    );
    expect(r.pAlive).toBeGreaterThanOrEqual(0.80);
    expect(r.ci_low).toBeLessThanOrEqual(r.pAlive);
    expect(r.ci_high).toBeGreaterThanOrEqual(r.pAlive);
  });

  // TS-3: sub-agent in flight → P ≥ 0.85 even with 12m heartbeat.
  it('TS-3: sub-agent in flight + 12m heartbeat ⇒ P ≥ 0.85', () => {
    const r = mc.computeLiveness(
      { session_id: 's-agent', heartbeat_age_sec: 720, phase: 'EXEC', scope_bucket: 'MEDIUM', pid_alive: true, port_open: true },
      { in_sub_agent_window: true, sub_agent_wall_time_p95_min: 6 },
      PRIORS,
      { draws: 2000 },
    );
    expect(r.pAlive).toBeGreaterThanOrEqual(0.85);
  });

  // TS-9 regression: fresh heartbeat (<5m) worker still reads active.
  it('TS-9 regression: hb<5m ⇒ P ≥ 0.90 regardless of pid/port', () => {
    const r = mc.computeLiveness(
      { session_id: 's-fresh', heartbeat_age_sec: 120, phase: 'PLAN', scope_bucket: 'SMALL', pid_alive: false, port_open: false },
      {},
      PRIORS,
      { draws: 2000 },
    );
    expect(r.pAlive).toBeGreaterThanOrEqual(0.90);
  });

  // Dead: 30m heartbeat, no signals → P should be very low.
  it('30m heartbeat with no supporting signals ⇒ P ≤ 0.2', () => {
    const r = mc.computeLiveness(
      { session_id: 's-dead', heartbeat_age_sec: 1800, phase: 'EXEC', scope_bucket: 'SMALL', pid_alive: false, port_open: false },
      {},
      PRIORS,
      { draws: 2000 },
    );
    expect(r.pAlive).toBeLessThanOrEqual(0.2);
  });

  // CI always bracket p_alive (invariant).
  it('CI invariant: ci_low ≤ p_alive ≤ ci_high for a sweep of inputs', () => {
    const inputs = [
      { hb: 60,   pid: true,  port: true,  phase: 'EXEC', bucket: 'SMALL' },
      { hb: 300,  pid: false, port: true,  phase: 'PLAN', bucket: 'MEDIUM' },
      { hb: 900,  pid: true,  port: false, phase: 'EXEC', bucket: 'LARGE' },
      { hb: 1500, pid: false, port: false, phase: 'EXEC', bucket: 'LARGE' },
    ];
    for (const inp of inputs) {
      const r = mc.computeLiveness(
        { session_id: 'x', heartbeat_age_sec: inp.hb, phase: inp.phase, scope_bucket: inp.bucket, pid_alive: inp.pid, port_open: inp.port },
        {},
        PRIORS,
        { draws: 1500 },
      );
      expect(r.ci_low).toBeLessThanOrEqual(r.pAlive + 1e-6);
      expect(r.ci_high).toBeGreaterThanOrEqual(r.pAlive - 1e-6);
      expect(r.pAlive).toBeGreaterThanOrEqual(0);
      expect(r.pAlive).toBeLessThanOrEqual(1);
    }
  });
});

describe('fleet-liveness-mc — runFleetMC', () => {
  // TS-6: 10-worker, N=1000 fleet run under 100ms (5-iteration median).
  it('TS-6: runFleetMC 10-worker N=1000 median <100ms', async () => {
    const sessions = Array.from({ length: 10 }, (_, i) => ({
      session_id: 'w-' + i,
      heartbeat_age_sec: 120 + i * 60,
      phase: 'EXEC',
      scope_bucket: i % 3 === 0 ? 'LARGE' : i % 3 === 1 ? 'MEDIUM' : 'SMALL',
      pid_alive: i % 2 === 0,
      port_open: i % 3 === 0,
    }));
    const runs = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      await mc.runFleetMC({ sessions, cycles: 1000, priors: PRIORS });
      runs.push(performance.now() - t0);
    }
    runs.sort((a, b) => a - b);
    const median = runs[2];
    expect(median).toBeLessThan(100);
  });

  // TS-10: JSON shape.
  it('TS-10: runFleetMC returns {workers[], etaDistribution} JSON shape', async () => {
    const sessions = [
      { session_id: 'a', heartbeat_age_sec: 120, phase: 'EXEC', scope_bucket: 'MEDIUM', pid_alive: true, port_open: true },
      { session_id: 'b', heartbeat_age_sec: 600, phase: 'PLAN', scope_bucket: 'SMALL', pid_alive: false, port_open: false },
    ];
    const out = await mc.runFleetMC({ sessions, cycles: 500, priors: PRIORS });
    expect(Array.isArray(out.workers)).toBe(true);
    expect(out.workers).toHaveLength(2);
    for (const w of out.workers) {
      expect(w).toHaveProperty('session_id');
      expect(w).toHaveProperty('p_alive');
      expect(w).toHaveProperty('ci_low');
      expect(w).toHaveProperty('ci_high');
      expect(w).toHaveProperty('samples');
      expect(w).toHaveProperty('signals');
    }
    expect(out.etaDistribution).toHaveProperty('p50');
    expect(out.etaDistribution).toHaveProperty('p80');
    expect(out.etaDistribution).toHaveProperty('p95');
    expect(Array.isArray(out.etaDistribution.probability_table)).toBe(true);
    // ETA times are valid ISO strings
    for (const key of ['p50', 'p80', 'p95']) {
      const date = new Date(out.etaDistribution[key]);
      expect(Number.isFinite(date.getTime())).toBe(true);
    }
  });
});

describe('fleet-liveness-mc — bootstrapPriors sparse-bucket fallback (TS-7)', () => {
  it('returns fallback source when no supabase client supplied', async () => {
    const { priors, source } = await mc.bootstrapPriors(null);
    expect(source).toBe('fallback');
    for (const phase of ['LEAD', 'PLAN', 'EXEC']) {
      for (const bucket of ['SMALL', 'MEDIUM', 'LARGE']) {
        expect(priors[phase][bucket]).toHaveProperty('mean');
        expect(priors[phase][bucket]).toHaveProperty('stddev');
        expect(Number.isFinite(priors[phase][bucket].mean)).toBe(true);
        expect(Number.isFinite(priors[phase][bucket].stddev)).toBe(true);
      }
    }
  });

  it('honors FLEET_MC_PRIOR_FILE override when valid', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const custom = {
      LEAD:  { SMALL: { mean: 1, stddev: 1 }, MEDIUM: { mean: 2, stddev: 1 }, LARGE: { mean: 3, stddev: 1 } },
      PLAN:  { SMALL: { mean: 4, stddev: 1 }, MEDIUM: { mean: 5, stddev: 1 }, LARGE: { mean: 6, stddev: 1 } },
      EXEC:  { SMALL: { mean: 7, stddev: 1 }, MEDIUM: { mean: 8, stddev: 1 }, LARGE: { mean: 9, stddev: 1 } },
    };
    const tmp = path.join(os.tmpdir(), 'mc-prior-' + Date.now() + '.json');
    fs.writeFileSync(tmp, JSON.stringify(custom));
    process.env.FLEET_MC_PRIOR_FILE = tmp;
    try {
      const { priors, source } = await mc.bootstrapPriors(null);
      expect(source).toBe('file_override');
      expect(priors.EXEC.LARGE.mean).toBe(9);
      expect(priors.LEAD.SMALL.mean).toBe(1);
    } finally {
      delete process.env.FLEET_MC_PRIOR_FILE;
      try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    }
  });
});
