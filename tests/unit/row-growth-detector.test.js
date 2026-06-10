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
  isSnapshotDue,
  GOVERNANCE_TABLES,
  DEFAULT_OPTS,
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
