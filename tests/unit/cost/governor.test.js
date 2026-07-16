/**
 * Unit tests for the pure cost-governor decision core.
 * SD-LEO-INFRA-COST-TOKEN-GOVERNANCE-001 (FR-5)
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_THRESHOLDS, TIER_LADDER,
  evaluateRegen, decideTier, classifyAnomaly, tuneThresholds,
} from '../../../lib/cost/governor.js';

describe('evaluateRegen (FR-1a — regen-storm throttle)', () => {
  const now = 1_000_000_000_000;
  const cfg = { windowMs: 3_600_000, maxPerWindow: 10 };

  it('THROTTLES a burst at/over the threshold with a measured reason', () => {
    const events = Array.from({ length: 25 }, (_, i) => ({ at: now - i * 1000, targetKey: 'eva:artifact' }));
    const d = evaluateRegen('eva:artifact', events, cfg, now);
    expect(d.action).toBe('throttle');
    expect(d.measured.count).toBe(25);
    expect(d.measured.threshold).toBe(10);
    expect(d.measured.windowMs).toBe(3_600_000);
    expect(d.reason).toMatch(/25/);
    expect(d.reason).toMatch(/throttl/i);
  });

  it('ALLOWS a below-threshold count', () => {
    const events = Array.from({ length: 4 }, (_, i) => ({ at: now - i * 1000 }));
    const d = evaluateRegen('eva:artifact', events, cfg, now);
    expect(d.action).toBe('allow');
    expect(d.measured.count).toBe(4);
  });

  it('excludes events outside the window (anchored to newest event, pure)', () => {
    const events = [
      { at: now }, { at: now - 100 }, // 2 inside
      { at: now - 4_000_000 }, { at: now - 5_000_000 }, // 2 outside a 1h window
    ];
    const d = evaluateRegen('t', events, cfg); // no `now` → anchors to max event
    expect(d.measured.count).toBe(2);
    expect(d.action).toBe('allow');
  });

  it('accepts ISO strings and raw numbers as event timestamps', () => {
    const iso = new Date(now).toISOString();
    const d = evaluateRegen('t', [iso, now, now - 500], { windowMs: 3_600_000, maxPerWindow: 2 }, now);
    expect(d.action).toBe('throttle');
    expect(d.measured.count).toBe(3);
  });

  it('is total on empty input (no throw, count 0, allow)', () => {
    const d = evaluateRegen('t', [], cfg);
    expect(d.action).toBe('allow');
    expect(d.measured.count).toBe(0);
  });
});

describe('decideTier (FR-1b — down-tier router, fail-open)', () => {
  const clearingRule = { clears: () => true };
  const holdingRule = { clears: () => false };

  it('FAILS OPEN when the eval rule is null (dependency not live) — never guesses', () => {
    const d = decideTier('claude-opus', { calls: 100 }, null);
    expect(d.downTiered).toBe(false);
    expect(d.tier).toBe('claude-opus');
    expect(d.reason).toMatch(/fail-open/i);
  });

  it('FAILS OPEN when the rule lacks a clears() function', () => {
    const d = decideTier('claude-opus', {}, { notARule: true });
    expect(d.downTiered).toBe(false);
    expect(d.reason).toMatch(/fail-open/i);
  });

  it('down-tiers when the rule says the cheaper tier clears the bar', () => {
    const d = decideTier('claude-opus', { calls: 100 }, clearingRule);
    expect(d.downTiered).toBe(true);
    expect(d.tier).toBe('claude-sonnet');
    expect(d.tier).toBe(TIER_LADDER['claude-opus']);
  });

  it('holds when the rule says the cheaper tier does NOT clear the bar', () => {
    const d = decideTier('claude-opus', {}, holdingRule);
    expect(d.downTiered).toBe(false);
    expect(d.tier).toBe('claude-opus');
  });

  it('holds at the bottom of the ladder (no cheaper tier)', () => {
    const d = decideTier('gpt-5.4-nano', {}, clearingRule);
    expect(d.downTiered).toBe(false);
  });

  it('FAILS OPEN (no down-tier) when the rule throws', () => {
    const d = decideTier('claude-opus', {}, { clears: () => { throw new Error('boom'); } });
    expect(d.downTiered).toBe(false);
    expect(d.reason).toMatch(/fail-open/i);
  });
});

describe('classifyAnomaly (FR-1c — fail-loud)', () => {
  it('flags a day over the absolute USD threshold', () => {
    const series = [{ day: '2026-07-14', usd: 5, calls: 100 }, { day: '2026-07-15', usd: 40, calls: 200 }];
    const r = classifyAnomaly(series, { maxDailyUsd: 12, maxDailyCalls: 3000, spike: 2.0 });
    expect(r.anomaly).toBe(true);
    expect(r.breaches.join(' ')).toMatch(/40/);
  });

  it('flags a spend spike vs trailing average', () => {
    const series = [
      { day: '2026-07-10', usd: 2, calls: 10 }, { day: '2026-07-11', usd: 2, calls: 10 },
      { day: '2026-07-12', usd: 2, calls: 10 }, { day: '2026-07-13', usd: 10, calls: 50 },
    ];
    const r = classifyAnomaly(series, { maxDailyUsd: 100, maxDailyCalls: 100000, spike: 2.0 });
    expect(r.anomaly).toBe(true);
    expect(r.breaches.join(' ')).toMatch(/trailing avg/);
  });

  it('stays quiet on a healthy day', () => {
    const series = [{ day: '2026-07-14', usd: 3, calls: 100 }, { day: '2026-07-15', usd: 4, calls: 120 }];
    const r = classifyAnomaly(series, { maxDailyUsd: 12, maxDailyCalls: 3000, spike: 2.0 });
    expect(r.anomaly).toBe(false);
    expect(r.severity).toBe('none');
  });

  it('is total on empty series', () => {
    expect(classifyAnomaly([]).anomaly).toBe(false);
  });
});

describe('tuneThresholds (FR-1d — self-improving)', () => {
  it('TIGHTENS the regen budget when regen was not reduced', () => {
    const next = tuneThresholds(DEFAULT_THRESHOLDS, { regenReduced: false, gateRateHeld: true });
    expect(next.regen.maxPerWindow).toBeLessThan(DEFAULT_THRESHOLDS.regen.maxPerWindow);
  });

  it('TIGHTENS when the gate rate dropped', () => {
    const next = tuneThresholds(DEFAULT_THRESHOLDS, { regenReduced: true, gateRateHeld: false });
    expect(next.regen.maxPerWindow).toBeLessThan(DEFAULT_THRESHOLDS.regen.maxPerWindow);
  });

  it('LOOSENS (bounded) on a fully healthy outcome', () => {
    const next = tuneThresholds(DEFAULT_THRESHOLDS, { regenReduced: true, gateRateHeld: true });
    expect(next.regen.maxPerWindow).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.regen.maxPerWindow);
    expect(next.regen.maxPerWindow).toBeLessThanOrEqual(DEFAULT_THRESHOLDS.tune.maxPerWindow);
  });

  it('is idempotent for identical inputs', () => {
    const a = tuneThresholds(DEFAULT_THRESHOLDS, { regenReduced: false, gateRateHeld: true });
    const b = tuneThresholds(DEFAULT_THRESHOLDS, { regenReduced: false, gateRateHeld: true });
    expect(a.regen.maxPerWindow).toBe(b.regen.maxPerWindow);
  });

  it('does not mutate the input thresholds', () => {
    const before = DEFAULT_THRESHOLDS.regen.maxPerWindow;
    tuneThresholds(DEFAULT_THRESHOLDS, { regenReduced: false, gateRateHeld: false });
    expect(DEFAULT_THRESHOLDS.regen.maxPerWindow).toBe(before);
  });

  it('respects the tightening floor', () => {
    const tight = { regen: { windowMs: 3_600_000, maxPerWindow: 3 }, anomaly: DEFAULT_THRESHOLDS.anomaly, tune: DEFAULT_THRESHOLDS.tune };
    const next = tuneThresholds(tight, { regenReduced: false, gateRateHeld: false });
    expect(next.regen.maxPerWindow).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.tune.minPerWindow);
  });
});
