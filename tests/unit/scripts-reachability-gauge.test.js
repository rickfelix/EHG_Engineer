// SD-LEO-INFRA-SCRIPTS-ESTATE-RECONCILIATION-001 (FR-1) — pure-core tests for the
// weekly scripts-estate reachability gauge. No DB, no network: the delta/alert
// decisions are tested with mocked snapshot rows; cron wiring parity is pinned
// statically against STANDARD_LOOPS and the teardown inventory.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import {
  computeDeltas,
  shouldAlert,
  isSnapshotDue,
  SNAPSHOT_EVENT_TYPE,
  GAUGE_DUE_MS,
  ORPHAN_GROWTH_ALERT_THRESHOLD,
  LIST_CAP,
} from '../../scripts/scripts-reachability-gauge.mjs';
import { STANDARD_LOOPS } from '../../scripts/coordinator-startup-check.mjs';

const require = createRequire(import.meta.url);

describe('computeDeltas', () => {
  it('first baseline (no prev) yields null delta and empty lists', () => {
    const d = computeDeltas(null, { orphan_count: 700, orphans_full: ['a.js'] });
    expect(d.orphan_delta).toBeNull();
    expect(d.new_orphans).toEqual([]);
    expect(d.resolved_orphans).toEqual([]);
  });

  it('computes new/resolved orphans and the count delta', () => {
    const prev = { orphan_count: 3, orphans_full: ['scripts/a.js', 'scripts/b.js', 'scripts/c.js'] };
    const curr = { orphan_count: 4, orphans_full: ['scripts/b.js', 'scripts/c.js', 'scripts/d.js', 'scripts/e.js'] };
    const d = computeDeltas(prev, curr);
    expect(d.orphan_delta).toBe(1);
    expect(d.new_orphans).toEqual(['scripts/d.js', 'scripts/e.js']);
    expect(d.resolved_orphans).toEqual(['scripts/a.js']);
    expect(d.new_orphans_total).toBe(2);
    expect(d.resolved_orphans_total).toBe(1);
  });

  it('caps the new/resolved lists at LIST_CAP but keeps the true totals', () => {
    const curr = {
      orphan_count: LIST_CAP + 20,
      orphans_full: Array.from({ length: LIST_CAP + 20 }, (_, i) => `scripts/n${i}.js`),
    };
    const d = computeDeltas({ orphan_count: 0, orphans_full: [] }, curr);
    expect(d.new_orphans).toHaveLength(LIST_CAP);
    expect(d.new_orphans_total).toBe(LIST_CAP + 20);
  });
});

describe('shouldAlert — growth-only alerting', () => {
  const clean = { broken_npm_aliases: [] };

  it(`alerts at orphan growth >= ${ORPHAN_GROWTH_ALERT_THRESHOLD}`, () => {
    expect(shouldAlert({ orphan_delta: ORPHAN_GROWTH_ALERT_THRESHOLD }, clean).alert).toBe(true);
  });

  it('does NOT alert below the growth threshold, on shrink, or on first baseline', () => {
    expect(shouldAlert({ orphan_delta: ORPHAN_GROWTH_ALERT_THRESHOLD - 1 }, clean).alert).toBe(false);
    expect(shouldAlert({ orphan_delta: -200 }, clean).alert).toBe(false);
    expect(shouldAlert({ orphan_delta: null }, clean).alert).toBe(false);
  });

  it('alerts on any broken npm alias regardless of growth', () => {
    const v = shouldAlert({ orphan_delta: null }, { broken_npm_aliases: [{ alias: 'x', file: 'scripts/x.mjs' }] });
    expect(v.alert).toBe(true);
    expect(v.reasons.join(' ')).toContain('npm alias');
  });
});

describe('isSnapshotDue (weekly cadence)', () => {
  const now = Date.parse('2026-06-11T12:00:00Z');
  it('due with no prior snapshot or unparseable timestamp', () => {
    expect(isSnapshotDue(null, now)).toBe(true);
    expect(isSnapshotDue('not-a-date', now)).toBe(true);
  });
  it('not due within the ~6d window; due after it', () => {
    expect(isSnapshotDue(new Date(now - GAUGE_DUE_MS + 60_000).toISOString(), now)).toBe(false);
    expect(isSnapshotDue(new Date(now - GAUGE_DUE_MS - 60_000).toISOString(), now)).toBe(true);
  });
});

describe('cron wiring parity (arm + teardown both know the gauge)', () => {
  it('STANDARD_LOOPS arms the weekly gauge with the canonical prompt', () => {
    const loop = STANDARD_LOOPS.find((l) => l.key === 'scripts-reachability');
    expect(loop).toBeDefined();
    expect(loop.cron).toBe('40 9 * * 1');
    expect(loop.prompt).toBe('node scripts/scripts-reachability-gauge.mjs');
  });

  it('teardown inventory lists the same cron (cadence + command parity)', () => {
    const { COORDINATOR_CRONS } = require('../../lib/coordinator/teardown-coordinator.cjs');
    const cron = COORDINATOR_CRONS.find((c) => c.key === 'scripts-reachability');
    expect(cron).toBeDefined();
    expect(cron.cadence).toBe('40 9 * * 1');
    expect(cron.command).toBe('node scripts/scripts-reachability-gauge.mjs');
    expect(cron.re_asserts_pointer).toBe(false);
  });

  it('event type is the canonical series name', () => {
    expect(SNAPSHOT_EVENT_TYPE).toBe('SCRIPTS_REACHABILITY_SNAPSHOT');
  });
});
