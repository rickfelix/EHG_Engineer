/**
 * SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-C — lib/adam/duration-baseline-gauge.js.
 */
import { describe, it, expect } from 'vitest';
import {
  computeDurationStats,
  buildBaselines,
  classifyDurationBreach,
  nextEscalationTier,
  MIN_SAMPLE_SIZE,
} from '../../../lib/adam/duration-baseline-gauge.js';

describe('computeDurationStats', () => {
  it('returns nulls for an empty sample', () => {
    expect(computeDurationStats([])).toEqual({ median: null, p95: null, n: 0 });
    expect(computeDurationStats(undefined)).toEqual({ median: null, p95: null, n: 0 });
  });

  it('filters out non-finite / negative values before computing', () => {
    const r = computeDurationStats([10, NaN, -5, Infinity, 20, 30]);
    expect(r.n).toBe(3);
  });

  it('computes median and p95 (nearest-rank) for a known sample', () => {
    const durations = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    const r = computeDurationStats(durations);
    expect(r.n).toBe(100);
    expect(r.median).toBe(50);
    expect(r.p95).toBe(95);
  });

  it('a single-element sample reports that value for both median and p95', () => {
    const r = computeDurationStats([42]);
    expect(r).toEqual({ median: 42, p95: 42, n: 1 });
  });
});

describe('buildBaselines', () => {
  it('computes stats per type independently', () => {
    const r = buildBaselines({ infrastructure: [10, 20, 30], feature: [100] });
    expect(r.infrastructure.n).toBe(3);
    expect(r.feature).toEqual({ median: 100, p95: 100, n: 1 });
  });

  it('handles an empty map', () => {
    expect(buildBaselines({})).toEqual({});
    expect(buildBaselines(undefined)).toEqual({});
  });
});

describe('classifyDurationBreach', () => {
  const goodBaseline = computeDurationStats([10, 20, 30, 40, 50]);

  it('never breaches with no baseline', () => {
    expect(classifyDurationBreach({ elapsedMs: 999999, baseline: undefined })).toEqual({ breached: false, ratio: null });
  });

  it('never breaches on an undersized sample (< MIN_SAMPLE_SIZE)', () => {
    const thin = computeDurationStats([10, 20]);
    expect(thin.n).toBeLessThan(MIN_SAMPLE_SIZE);
    expect(classifyDurationBreach({ elapsedMs: 999999, baseline: thin }).breached).toBe(false);
  });

  it('breaches when elapsed exceeds p95', () => {
    const r = classifyDurationBreach({ elapsedMs: goodBaseline.p95 + 1, baseline: goodBaseline });
    expect(r.breached).toBe(true);
    expect(r.ratio).toBeGreaterThan(1);
  });

  it('does NOT breach at or under p95', () => {
    expect(classifyDurationBreach({ elapsedMs: goodBaseline.p95, baseline: goodBaseline }).breached).toBe(false);
    expect(classifyDurationBreach({ elapsedMs: goodBaseline.p95 - 1, baseline: goodBaseline }).breached).toBe(false);
  });
});

describe('nextEscalationTier', () => {
  it('no breach -> tier none, resets state', () => {
    expect(nextEscalationTier({ breached: false, priorBreached: true })).toEqual({ tier: 'none', nextBreached: false });
  });

  it('first breach (no prior) -> tier first', () => {
    expect(nextEscalationTier({ breached: true, priorBreached: false })).toEqual({ tier: 'first', nextBreached: true });
  });

  it('second consecutive breach -> tier second (Solomon escalation)', () => {
    expect(nextEscalationTier({ breached: true, priorBreached: true })).toEqual({ tier: 'second', nextBreached: true });
  });
});
