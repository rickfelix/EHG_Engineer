/**
 * resolveWorkerCount unit tests — SD-LEO-INFRA-WORKER-COUNT-PULSE-RESILIENCE-001.
 *
 * The defect: a single pulse in the 1h window was labeled a confident "hourly avg".
 * These tests pin the honest behavior across all branches (pure, no DB/network).
 */
import { describe, it, expect } from 'vitest';
import { resolveWorkerCount, SPARSE_THRESHOLD } from '../../lib/fleet/worker-count-source.mjs';

const pulse = (active, total, idle) => ({ active_count: active, total_count: total, idle_count: idle });

describe('resolveWorkerCount (SD-LEO-INFRA-WORKER-COUNT-PULSE-RESILIENCE-001)', () => {
  it('SPARSE_THRESHOLD default is 2', () => {
    expect(SPARSE_THRESHOLD).toBe(2);
  });

  it('>= threshold primary pulses → confident "hourly avg" with the rounded average', () => {
    const r = resolveWorkerCount({ primaryPulses: [pulse(3, 4, 1), pulse(5, 6, 1)], threshold: 2 });
    expect(r.source).toBe('hourly avg');
    expect(r.sparse).toBe(false);
    expect(r.label).toBe('hourly avg');
    expect(r.active).toBe(4); // round((3+5)/2)
    expect(r.idle).toBe(1);
  });

  it('THE FIX: a single pulse is NOT a confident hourly avg — prefers live, sparse-labeled', () => {
    const r = resolveWorkerCount({ primaryPulses: [pulse(2, 3, 1)], live: { active: 5, idle: 0 }, threshold: 2 });
    expect(r.source).toBe('live');
    expect(r.sparse).toBe(true);
    expect(r.active).toBe(5);
    expect(r.label).toMatch(/live \(sparse: 1 pulse in 1h\)/);
    expect(r.label).not.toBe('hourly avg');
  });

  it('sparse primary + healthy wider window + NO live → wide avg, sparse-labeled', () => {
    const r = resolveWorkerCount({ primaryPulses: [pulse(2, 3, 1)], widePulses: [pulse(2, 3, 1), pulse(4, 5, 1), pulse(6, 7, 1)], live: null, threshold: 2, wideHours: 3 });
    expect(r.source).toBe('wide avg');
    expect(r.sparse).toBe(true);
    expect(r.active).toBe(4); // round((2+4+6)/3)
    expect(r.label).toBe('3h avg, sparse');
  });

  it('honesty/recency: a FRESH live read is preferred over a stale wider-window average', () => {
    // adversarial review MED: 1 fresh pulse=8 + live=8 must NOT be reported as a 3h mean of ~3.
    const r = resolveWorkerCount({ primaryPulses: [pulse(8, 9, 1)], widePulses: [pulse(8, 9, 1), pulse(1, 2, 1), pulse(1, 2, 1)], live: { active: 8, idle: 0 }, threshold: 2 });
    expect(r.source).toBe('live');
    expect(r.active).toBe(8);
    expect(r.label).toMatch(/live \(sparse/);
  });

  it('sparse primary + no wide + no live → sparse-labeled average of the few samples (honest, not confident)', () => {
    const r = resolveWorkerCount({ primaryPulses: [pulse(3, 4, 1)], threshold: 2 });
    expect(r.sparse).toBe(true);
    expect(r.active).toBe(3);
    expect(r.label).toBe('hourly avg, sparse: 1 sample');
  });

  it('zero pulses + live available → live, no sparse-count suffix', () => {
    const r = resolveWorkerCount({ primaryPulses: [], live: { active: 7, idle: 2 }, threshold: 2 });
    expect(r.source).toBe('live');
    expect(r.active).toBe(7);
    expect(r.idle).toBe(2);
    expect(r.label).toBe('live');
  });

  it('zero pulses + no live → unavailable (a missing measurement is never a confident 0)', () => {
    const r = resolveWorkerCount({ primaryPulses: [], live: null, threshold: 2 });
    expect(r.source).toBe('unavailable');
    expect(r.active).toBeNull();
    expect(r.label).toBe('unavailable');
  });

  it('idle derives from total_count - active_count when idle_count is absent (never negative)', () => {
    const r = resolveWorkerCount({ primaryPulses: [{ active_count: 2, total_count: 5 }, { active_count: 4, total_count: 6 }], threshold: 2 });
    // idle = round(((5-2)+(6-4))/2) = round((3+2)/2) = round(2.5) = 3 (banker-agnostic Math.round)
    expect(r.idle).toBe(3);
    // negative guard: active > total must not yield a negative idle
    const r2 = resolveWorkerCount({ primaryPulses: [{ active_count: 9, total_count: 3 }, { active_count: 9, total_count: 3 }], threshold: 2 });
    expect(r2.idle).toBe(0);
  });

  it('a non-finite live.active is treated as no-live (falls through honestly)', () => {
    const r = resolveWorkerCount({ primaryPulses: [pulse(2, 3, 1)], live: { active: NaN }, threshold: 2 });
    expect(r.source).not.toBe('live');
    expect(r.label).toMatch(/sparse/);
  });

  it('defensive: undefined args do not throw → unavailable', () => {
    expect(() => resolveWorkerCount()).not.toThrow();
    expect(resolveWorkerCount().source).toBe('unavailable');
  });

  it('LOW fix: threshold=0 with an empty primary window never yields a confident NaN', () => {
    const r = resolveWorkerCount({ primaryPulses: [], threshold: 0 });
    // clamped thr>=1 + empty-guard: must route to unavailable, NOT a confident "hourly avg" of NaN
    expect(r.source).toBe('unavailable');
    expect(r.active).toBeNull();
    expect(Number.isNaN(r.active)).toBe(false);
  });

  it('LOW fix: a negative explicit idle_count is clamped to 0 (never a negative idle)', () => {
    const r = resolveWorkerCount({ primaryPulses: [{ active_count: 3, total_count: 4, idle_count: -5 }, { active_count: 3, total_count: 4, idle_count: -5 }], threshold: 2 });
    expect(r.idle).toBe(0);
  });
});
