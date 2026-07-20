/**
 * SD-LEO-INFRA-PROGRESS-ROLLUP-NEEDLE-PRIORITIZATION-001-F (FR-5) — tests for the
 * feedback-loop convergence indicator (catch-rate trend from adam_adherence_ledger).
 */
import { describe, it, expect } from 'vitest';
import {
  computeCatchRateConvergence,
  formatConvergenceLine,
  loadAdherenceLedger,
} from '../../../lib/vision/rung-health-convergence.mjs';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-06-20T12:00:00.000Z');
// helper: build N fail rows on the day that is `daysAgo` before NOW
const failsOn = (daysAgo, n) => Array.from({ length: n }, () => ({ created_at: new Date(NOW - daysAgo * DAY).toISOString(), verdict: 'fail' }));
// FR-6 batch 8: loadAdherenceLedger now paginates via fetchAllPaginated, which appends .order()
// and awaits .range(). Terminate the mock chain with a builder that is chainable through .order()
// and resolves the same { data, error } on .range().
const pageable = (result) => { const b = { order: () => b, range: async () => result }; return b; };

describe('computeCatchRateConvergence', () => {
  it('requires nowMs', () => {
    expect(() => computeCatchRateConvergence([], {})).toThrow(/nowMs/);
  });

  it('0 catches → converging, trend=converging, daysToZero=0 (mature/quiet)', () => {
    const c = computeCatchRateConvergence([], { nowMs: NOW, windowDays: 14 });
    expect(c.totalCatches).toBe(0);
    expect(c.converging).toBe(true);
    expect(c.trend).toBe('converging');
    expect(c.daysToZero).toBe(0);
  });

  it('downward trend (5→1 over days) → converging with a positive daysToZero', () => {
    const rows = [
      ...failsOn(6, 5), ...failsOn(5, 4), ...failsOn(4, 3),
      ...failsOn(3, 2), ...failsOn(2, 1), ...failsOn(1, 1),
    ];
    const c = computeCatchRateConvergence(rows, { nowMs: NOW, windowDays: 8 });
    expect(c.converging).toBe(true);
    expect(c.trend).toBe('converging');
    expect(c.slopePerDay).toBeLessThan(0);
    expect(c.daysToZero).toBeGreaterThan(0);
  });

  it('rising trend (1→5) → diverging/churning', () => {
    const rows = [
      ...failsOn(6, 1), ...failsOn(5, 2), ...failsOn(4, 3),
      ...failsOn(3, 4), ...failsOn(2, 5), ...failsOn(1, 6),
    ];
    const c = computeCatchRateConvergence(rows, { nowMs: NOW, windowDays: 8 });
    expect(c.converging).toBe(false);
    expect(c.trend).toBe('diverging');
    expect(c.slopePerDay).toBeGreaterThan(0);
    expect(c.daysToZero).toBeNull();
  });

  it('flat trend (constant per day) → flat/churning, no ETA', () => {
    const rows = [...failsOn(5, 2), ...failsOn(4, 2), ...failsOn(3, 2), ...failsOn(2, 2), ...failsOn(1, 2)];
    const c = computeCatchRateConvergence(rows, { nowMs: NOW, windowDays: 7 });
    expect(c.trend).toBe('flat');
    expect(c.converging).toBe(false);
    expect(c.daysToZero).toBeNull();
  });

  it('single active day → insufficient_data (cannot call a trend)', () => {
    const c = computeCatchRateConvergence(failsOn(2, 4), { nowMs: NOW, windowDays: 14 });
    expect(c.trend).toBe('insufficient_data');
    expect(c.converging).toBeNull();
    expect(c.totalCatches).toBe(4);
  });

  it('ignores non-fail verdicts and out-of-window rows', () => {
    const rows = [
      { created_at: new Date(NOW - 2 * DAY).toISOString(), verdict: 'pass' },
      { created_at: new Date(NOW - 99 * DAY).toISOString(), verdict: 'fail' }, // out of window
      ...failsOn(3, 1), ...failsOn(1, 1),
    ];
    const c = computeCatchRateConvergence(rows, { nowMs: NOW, windowDays: 7 });
    expect(c.totalCatches).toBe(2); // only the 2 in-window fails
  });
});

describe('formatConvergenceLine', () => {
  it('renders the mature/quiet case', () => {
    const c = computeCatchRateConvergence([], { nowMs: NOW, windowDays: 14 });
    expect(formatConvergenceLine(c)).toMatch(/CONVERGING — 0 catches/);
  });
  it('renders churning for a diverging trend', () => {
    const rows = [...failsOn(4, 1), ...failsOn(3, 3), ...failsOn(2, 5), ...failsOn(1, 7)];
    const line = formatConvergenceLine(computeCatchRateConvergence(rows, { nowMs: NOW, windowDays: 6 }));
    expect(line).toMatch(/DIVERGING|churning/);
  });
  it('handles null', () => {
    expect(formatConvergenceLine(null)).toMatch(/unknown/);
  });
});

describe('loadAdherenceLedger (fail-soft)', () => {
  it('returns [] with no supabase client', async () => {
    expect(await loadAdherenceLedger(null, { nowMs: NOW })).toEqual([]);
  });
  it('returns [] when the query errors (table absent) — never throws', async () => {
    const supabase = { from: () => ({ select: () => ({ gte: () => ({ eq: () => pageable({ data: null, error: { message: 'relation does not exist' } }) }) }) }) };
    expect(await loadAdherenceLedger(supabase, { nowMs: NOW })).toEqual([]);
  });
  it('returns rows on success', async () => {
    const fixture = failsOn(1, 2);
    const supabase = { from: () => ({ select: () => ({ gte: () => ({ eq: () => pageable({ data: fixture, error: null }) }) }) }) };
    expect(await loadAdherenceLedger(supabase, { nowMs: NOW })).toEqual(fixture);
  });
});
