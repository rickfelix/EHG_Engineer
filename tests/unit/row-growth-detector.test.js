// SD-LEO-INFRA-STANDING-ROW-GROWTH-001 — pure row-growth anomaly detection.
// Motivating incidents: management_reviews hit 45k duplicate rows and
// sd_baseline_items 13k orphans before anyone noticed. These pin the detector
// semantics: growth-factor + absolute-spike triggers, shrink never matches,
// small tables exempt from factor noise, due-gating ~22h.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  detectRowGrowthAnomalies,
  confirmRowGrowthAnomaly,
  isSnapshotDue,
  GOVERNANCE_TABLES,
  DEFAULT_OPTS,
  EXACT_COUNT_CEILING,
  SNAPSHOT_DUE_MS,
} = require('../../lib/coordinator/row-growth.cjs');

const snap = (tables, captured_at = '2026-06-10T00:00:00Z') => ({ captured_at, tables });

describe('detectRowGrowthAnomalies (pure)', () => {
  it('flags an absolute spike regardless of factor (the management_reviews-45k class)', () => {
    const out = detectRowGrowthAnomalies(
      snap({ management_reviews: 1000 }),
      snap({ management_reviews: 46000 })
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ table: 'management_reviews', delta: 45000, trigger: 'abs_spike' });
  });

  it('flags a growth factor on a table above minRowsForFactor (the sd_baseline_items class)', () => {
    const out = detectRowGrowthAnomalies(
      snap({ sd_baseline_items: 2000 }),
      snap({ sd_baseline_items: 3500 }) // x1.75 >= 1.5, delta 1500 < absSpike
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ table: 'sd_baseline_items', trigger: 'growth_factor' });
    expect(out[0].factor).toBeCloseTo(1.75);
  });

  it('does NOT flag factor noise on small tables (below minRowsForFactor)', () => {
    const out = detectRowGrowthAnomalies(
      snap({ tiny_table: 10 }),
      snap({ tiny_table: 100 }) // x10 but tiny — daily churn, not an anomaly
    );
    expect(out).toHaveLength(0);
  });

  it('never flags shrink or steady state (cleanups are not anomalies)', () => {
    const out = detectRowGrowthAnomalies(
      snap({ a: 45000, b: 500 }),
      snap({ a: 1, b: 500 })
    );
    expect(out).toHaveLength(0);
  });

  it('skips tables absent from either snapshot (inventory changes are not growth)', () => {
    const out = detectRowGrowthAnomalies(
      snap({ old_table: 100 }),
      snap({ new_table: 99999 })
    );
    expect(out).toHaveLength(0);
  });

  it('returns [] with no previous snapshot (first baseline)', () => {
    expect(detectRowGrowthAnomalies(null, snap({ a: 1 }))).toEqual([]);
  });

  it('sorts multiple anomalies by delta descending', () => {
    const out = detectRowGrowthAnomalies(
      snap({ a: 1000, b: 1000 }),
      snap({ a: 7000, b: 90000 })
    );
    expect(out.map((x) => x.table)).toEqual(['b', 'a']);
  });

  it('threshold overrides are honored', () => {
    const out = detectRowGrowthAnomalies(
      snap({ a: 1000 }),
      snap({ a: 1200 }),
      { growthFactor: 1.1, minRowsForFactor: 100 }
    );
    expect(out).toHaveLength(1);
    expect(out[0].trigger).toBe('growth_factor');
  });
});

describe('confirmRowGrowthAnomaly (pure, QF-20260905-880)', () => {
  // Fixture of record: the 11:53Z anomaly ecc4198f — validation_audit_log estimate jumped
  // 12314 -> 21853 (factor 1.77, abs_spike by the estimate-only detector), but a real exact
  // count moments later read 13324 (146 rows/24h) — a planner re-estimate, not real growth.
  it('estimate jump with exact flat emits nothing (the real ecc4198f fixture)', () => {
    const candidate = { table: 'validation_audit_log', prev: 12314, curr: 21853, delta: 9539, factor: 1.77, trigger: 'growth_factor' };
    const result = confirmRowGrowthAnomaly(candidate, 13324, null);
    expect(result.status).toBe('refuted');
    expect(result.measurement).toBe('exact');
    expect(result.comparedAgainst).toBe('prior_estimate');
    expect(result.exact).toBe(13324);
  });

  it('genuine growth confirms with both estimate and exact figures', () => {
    const candidate = { table: 't', prev: 1000, curr: 8000, delta: 7000, factor: 8, trigger: 'abs_spike' };
    const result = confirmRowGrowthAnomaly(candidate, 7000, null); // real +6000 vs the prior estimate
    expect(result).toMatchObject({ status: 'confirmed', measurement: 'exact', comparedAgainst: 'prior_estimate', baseline: 1000, exact: 7000, delta: 6000, trigger: 'abs_spike' });
  });

  it('compares against the prior EXACT-confirmed value when one exists, not the prior estimate', () => {
    const candidate = { table: 't', prev: 1000, curr: 8000, delta: 7000, factor: 8, trigger: 'abs_spike' };
    // prior exact-confirmed was 6000 (higher than the prior estimate 1000) -> real delta is only 2000
    const result = confirmRowGrowthAnomaly(candidate, 8000, 6000);
    expect(result).toMatchObject({ status: 'refuted', comparedAgainst: 'exact', baseline: 6000, delta: 2000 });
  });

  it('estimate_only when the exact count query fails (null) — never treated as measured', () => {
    const candidate = { table: 't', prev: 1000, curr: 8000, delta: 7000, factor: 8, trigger: 'abs_spike' };
    const result = confirmRowGrowthAnomaly(candidate, null, null);
    expect(result.status).toBe('estimate_only');
    expect(result.measurement).toBe('estimate_only');
    expect(result.exact).toBeNull();
  });

  it('estimate_only when the estimate exceeds EXACT_COUNT_CEILING — exact count never taken', () => {
    const candidate = { table: 't', prev: 100000, curr: EXACT_COUNT_CEILING + 1, delta: 900000, factor: 3, trigger: 'abs_spike' };
    const result = confirmRowGrowthAnomaly(candidate, 999999, null); // even if a caller had one, it's ignored
    expect(result.status).toBe('estimate_only');
  });
});

describe('isSnapshotDue (pure)', () => {
  const now = Date.parse('2026-06-10T12:00:00Z');
  it('due when no prior snapshot', () => {
    expect(isSnapshotDue(null, now)).toBe(true);
  });
  it('not due within the window; due after it', () => {
    expect(isSnapshotDue('2026-06-10T11:00:00Z', now)).toBe(false);
    expect(isSnapshotDue('2026-06-09T10:00:00Z', now)).toBe(true);
  });
  it('treats naive timestamps as UTC and garbage as due (fail-toward-snapshot)', () => {
    expect(isSnapshotDue('2026-06-09 10:00:00', now)).toBe(true);
    expect(isSnapshotDue('not-a-date', now)).toBe(true);
  });
  it('window constant is ~22h (daily cron with jitter tolerance)', () => {
    expect(SNAPSHOT_DUE_MS).toBe(22 * 60 * 60 * 1000);
  });
});

describe('GOVERNANCE_TABLES inventory', () => {
  it('covers both motivating-incident tables and the core governance set', () => {
    expect(GOVERNANCE_TABLES).toContain('management_reviews');
    expect(GOVERNANCE_TABLES).toContain('sd_baseline_items');
    expect(GOVERNANCE_TABLES).toContain('strategic_directives_v2');
    expect(GOVERNANCE_TABLES).toContain('session_coordination');
    expect(GOVERNANCE_TABLES.length).toBeGreaterThanOrEqual(20);
  });
  it('default thresholds are the documented ones', () => {
    expect(DEFAULT_OPTS).toMatchObject({ growthFactor: 1.5, minRowsForFactor: 500, absSpike: 5000 });
  });
});
