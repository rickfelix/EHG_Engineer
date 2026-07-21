// SD-LEO-INFRA-GOVERNING-REPRESENTATION-FAITHFULNESS-001 — the naming-tier contract + shared detector.
import { describe, it, expect } from 'vitest';
import {
  INSTANCE_REGISTRY,
  assessFaithfulness,
  assessRegistry,
  divergenceAge,
  isActionClosureFaithful,
} from '../../../lib/governance/representation-faithfulness.js';

const NOW = 1_750_000_000_000;
const daysAgo = (d) => new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString();

describe('assessFaithfulness — the single mechanical predicate (F2)', () => {
  it('faithful iff R2 derives-from-R1-at-action-time AND alarms-on-divergence', () => {
    const r = assessFaithfulness({ name: 'ok', derives_at_action_time: true, alarms_on_divergence: true });
    expect(r.faithful).toBe(true);
    expect(r.remediation).toEqual([]);
  });
  it('hand-derived R2 (not derived at action time) is flagged unfaithful', () => {
    const r = assessFaithfulness({ name: 'hand', derives_at_action_time: false, alarms_on_divergence: true });
    expect(r.faithful).toBe(false);
    expect(r.remediation.join(' ')).toMatch(/action.?time/);
  });
  it('silent-default (no loud alarm) is unfaithful EVEN WHEN R2 currently matches R1', () => {
    // divergence_detected_at null => R2 currently agrees with R1, but no alarm => still unfaithful
    const r = assessFaithfulness({ name: 'silent', derives_at_action_time: true, alarms_on_divergence: false, divergence_detected_at: null });
    expect(r.divergent).toBe(false);
    expect(r.faithful).toBe(false);
    expect(r.remediation.join(' ')).toMatch(/alarm/i);
  });
});

describe('registry generalization (F2) — predicate spans >=3 sites', () => {
  it('shipped instances (count/acceptance/comms) are faithful; planned divergences are flagged', () => {
    const { assessed, unfaithful, total } = assessRegistry();
    expect(total).toBeGreaterThanOrEqual(6);
    const byName = Object.fromEntries(assessed.map((a) => [a.name, a]));
    for (const site of ['count-integrity', 'acceptance-integrity', 'comms-capBody']) {
      expect(byName[site].faithful).toBe(true); // >=3 sites proven mechanically
    }
    // the two completed siblings are registered as shipped instances
    expect(byName['acceptance-integrity'].status).toBe('shipped');
    expect(byName['role-measurement-integrity'].status).toBe('shipped');
    // known-unbuilt sites surface as unfaithful (the divergence exists, not yet fixed)
    expect(unfaithful.map((u) => u.name)).toEqual(expect.arrayContaining(['fence-classification-view', 'review-loop-action-closure']));
  });
  it('a seeded divergence at any site is caught by the shared predicate', () => {
    const seeded = { name: 'seeded', derives_at_action_time: false, alarms_on_divergence: false, divergence_detected_at: daysAgo(1) };
    const r = assessFaithfulness(seeded);
    expect(r.faithful).toBe(false);
    expect(r.divergent).toBe(true);
    expect(r.remediation.length).toBe(2); // both failure modes
  });
});

describe('divergenceAge — health metric (F3)', () => {
  it('reports oldest undetected-divergence + oldest unclosed-flagged; no-divergence => null contribution', () => {
    const registry = [
      { name: 'fresh', divergence_detected_at: null }, // excluded
      { name: 'div-old', divergence_detected_at: daysAgo(10) },
      { name: 'div-new', divergence_detected_at: daysAgo(2) },
      { name: 'flagged', divergence_detected_at: daysAgo(5), due_cycle_ms: 1000 },
    ];
    const m = divergenceAge(registry, { nowMs: NOW });
    expect(m.oldest_undetected_divergence_ms).toBe(10 * 24 * 60 * 60 * 1000);
    expect(m.oldest_unclosed_flagged_ms).toBe(5 * 24 * 60 * 60 * 1000);
    expect(m.offenders.map((o) => o.instance)).not.toContain('fresh');
    expect(m.offenders[0].instance).toBe('div-old'); // sorted oldest-first
  });
  it('empty / all-clean registry => null ages, no offenders', () => {
    const m = divergenceAge([{ name: 'a', divergence_detected_at: null }], { nowMs: NOW });
    expect(m.oldest_undetected_divergence_ms).toBeNull();
    expect(m.oldest_unclosed_flagged_ms).toBeNull();
    expect(m.offenders).toEqual([]);
  });
});

describe('isActionClosureFaithful — review-loop action-closure (F4)', () => {
  const DUE = 24 * 60 * 60 * 1000;
  it('closed item is faithful (not flagged)', () => {
    expect(isActionClosureFaithful({ closed: true }, { nowMs: NOW, dueCycleMs: DUE }).faithful).toBe(true);
  });
  it('unclosed item within its due cycle is faithful (not yet due)', () => {
    const r = isActionClosureFaithful({ flagged_at: new Date(NOW - DUE / 2).toISOString() }, { nowMs: NOW, dueCycleMs: DUE });
    expect(r.faithful).toBe(true);
    expect(r.past_due).toBe(false);
  });
  it('unclosed item past its due cycle is flagged (would auto-escalate) — 4-cycle-zombie caught', () => {
    const r = isActionClosureFaithful({ flagged_at: daysAgo(4) }, { nowMs: NOW, dueCycleMs: DUE });
    expect(r.faithful).toBe(false);
    expect(r.past_due).toBe(true);
    expect(r.remediation).toMatch(/escalate/);
  });
});
