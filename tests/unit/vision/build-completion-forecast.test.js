/**
 * SD-LEO-INFRA-BUILD-COMPLETION-FORECAST-001 — tests for the pure forecast core
 * (FR-1 forecast + FR-3 self-correction).
 */
import { describe, it, expect } from 'vitest';
import {
  computeForecast, scoreForecastError, adjustLearnedRate, formatForecastLine,
} from '../../../lib/vision/build-completion-forecast.mjs';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-06-20T12:00:00.000Z');

describe('computeForecast (FR-1)', () => {
  it('requires nowMs', () => {
    expect(() => computeForecast({ buildableRemaining: 3 })).toThrow(/nowMs/);
  });

  it('100% build → done, eta 0', () => {
    const f = computeForecast({ buildPct: 100, buildableRemaining: 0, nowMs: NOW });
    expect(f.etaDays).toBe(0);
    expect(f.bindingConstraint).toBe('none');
  });

  it('queue covers remaining + healthy velocity → velocity-bound date, high confidence', () => {
    const f = computeForecast({ buildPct: 60, buildableRemaining: 4, velocityPerDay: 2, sourcingPerDay: 0, queueDepth: 6, capsPerCompletion: 1, nowMs: NOW });
    expect(f.plateau).toBe(false);
    expect(f.bindingConstraint).toBe('velocity');
    expect(f.etaDays).toBeCloseTo(2, 5); // 4 caps / 2 per day
    expect(f.etaDateIso).toBe(new Date(NOW + 2 * DAY).toISOString());
    expect(f.confidence).toBe('high');
  });

  it('PLATEAU when queue empty AND sourcing ~0 → no false date', () => {
    const f = computeForecast({ buildPct: 55, buildableRemaining: 5, velocityPerDay: 2, sourcingPerDay: 0, queueDepth: 0, nowMs: NOW });
    expect(f.plateau).toBe(true);
    expect(f.bindingConstraint).toBe('plateau');
    expect(f.etaDays).toBeNull();
    expect(f.etaDateIso).toBeNull();
    expect(f.note).toMatch(/plateau at 55%/);
  });

  it('partial queue + sourcing → sourcing-bound tail, lower confidence', () => {
    const f = computeForecast({ buildPct: 40, buildableRemaining: 10, velocityPerDay: 3, sourcingPerDay: 0.5, queueDepth: 2, capsPerCompletion: 1, nowMs: NOW });
    expect(f.plateau).toBe(false);
    expect(f.bindingConstraint).toBe('sourcing');
    expect(f.etaDays).toBeGreaterThan(0);
    expect(['low', 'medium']).toContain(f.confidence);
  });

  it('partial queue but sourcing ~0 → plateau after burning the queue (no false date)', () => {
    const f = computeForecast({ buildPct: 40, buildableRemaining: 10, velocityPerDay: 3, sourcingPerDay: 0, queueDepth: 2, capsPerCompletion: 1, nowMs: NOW });
    expect(f.plateau).toBe(true);
    expect(f.bindingConstraint).toBe('sourcing');
    expect(f.etaDays).toBeNull();
  });

  it('no completion velocity but work exists → unknown, low confidence (not a false date)', () => {
    const f = computeForecast({ buildPct: 50, buildableRemaining: 5, velocityPerDay: 0, sourcingPerDay: 1, queueDepth: 5, nowMs: NOW });
    expect(f.etaDays).toBeNull();
    expect(f.confidence).toBe('low');
  });
});

describe('confidence is horizon-capped (ADV-2)', () => {
  it('a far-out queue-covered ETA does NOT report high confidence', () => {
    // 1 completion/14d window projected far out: queue covers it, but the horizon is long.
    const f = computeForecast({ buildPct: 20, buildableRemaining: 20, velocityPerDay: 0.1, sourcingPerDay: 0, queueDepth: 50, capsPerCompletion: 1, nowMs: NOW });
    expect(f.etaDays).toBeGreaterThan(120);
    expect(f.confidence).not.toBe('high');
  });
});

describe('learned caps-per-completion is clamped (ADV-1 drift guard)', () => {
  it('EWMA never drifts above the band over many up-nudges', () => {
    let c = 1;
    for (let n = 0; n < 200; n++) c = adjustLearnedRate(c, c * 1.1, 0.3); // sustained "faster than forecast"
    expect(c).toBeLessThanOrEqual(5);
    expect(c).toBeGreaterThanOrEqual(0.2);
  });
  it('EWMA never drifts below the band over many down-nudges', () => {
    let c = 1;
    for (let n = 0; n < 200; n++) c = adjustLearnedRate(c, c * 0.9, 0.3);
    expect(c).toBeGreaterThanOrEqual(0.2);
  });
  it('computeForecast clamps an absurd injected capsPerCompletion', () => {
    const f = computeForecast({ buildPct: 50, buildableRemaining: 10, velocityPerDay: 1, queueDepth: 50, capsPerCompletion: 999, nowMs: NOW });
    // clamped to 5 → 10 caps / (1×5)/day = 2 days, not ~0.
    expect(f.etaDays).toBeCloseTo(2, 5);
  });
});

describe('scoreForecastError (FR-3)', () => {
  it('no prior → no_prior kind', () => {
    expect(scoreForecastError(null, { nowMs: NOW, buildPct: 50 }).kind).toBe('no_prior');
  });
  it('scores a prior date forecast vs actual progress', () => {
    const prior = { etaDays: 10, buildPct: 50, measuredAtMs: NOW - 5 * DAY };
    const s = scoreForecastError(prior, { nowMs: NOW, buildPct: 60 });
    expect(s.kind).toBe('scored');
    expect(s.actualDaysElapsed).toBeCloseTo(5, 5);
    // expected rise over 5/10 of a 50-pt gap = 25; actual 10 → signed error negative (slower)
    expect(s.signedErrorDays).toBeLessThan(0);
  });
  it('plateau prior that broke → plateau_broke', () => {
    const prior = { etaDays: null, buildPct: 55, measuredAtMs: NOW - 2 * DAY };
    expect(scoreForecastError(prior, { nowMs: NOW, buildPct: 60 }).kind).toBe('plateau_broke');
  });
});

describe('adjustLearnedRate (FR-3 EWMA)', () => {
  it('returns observed when no prior', () => {
    expect(adjustLearnedRate(null, 2)).toBe(2);
  });
  it('EWMA blends toward observed', () => {
    expect(adjustLearnedRate(1, 2, 0.5)).toBe(1.5);
  });
  it('keeps prior on bad observed', () => {
    expect(adjustLearnedRate(1.2, NaN)).toBe(1.2);
  });
});

describe('formatForecastLine (FR-4)', () => {
  it('renders a dated forecast with delta vs prior', () => {
    const f = computeForecast({ buildPct: 60, buildableRemaining: 4, velocityPerDay: 2, queueDepth: 6, nowMs: NOW });
    const prev = { plateau: false, etaDays: 5 };
    const line = formatForecastLine(f, prev);
    expect(line).toMatch(/Estimated completion \(infra-build scope\)/);
    expect(line).toMatch(/Δ -3d vs last/);
  });
  it('renders plateau', () => {
    const f = computeForecast({ buildPct: 55, buildableRemaining: 5, velocityPerDay: 1, sourcingPerDay: 0, queueDepth: 0, nowMs: NOW });
    expect(formatForecastLine(f, null)).toMatch(/PLATEAU at 55%/);
  });
  it('renders broke-plateau delta', () => {
    const f = computeForecast({ buildPct: 60, buildableRemaining: 4, velocityPerDay: 2, queueDepth: 6, nowMs: NOW });
    expect(formatForecastLine(f, { plateau: true, etaDays: null })).toMatch(/broke plateau/);
  });
  it('handles null forecast', () => {
    expect(formatForecastLine(null)).toMatch(/unavailable/);
  });
});
