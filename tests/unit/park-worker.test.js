/**
 * park-worker — Unit Tests
 * SD-FDBK-ENH-PARKED-WORKER-FALSE-001
 *
 * Covers the pure helpers (cap math, wake-interval resolution, arg parsing).
 * The DB persist path (writeTelemetryAwait) is intentionally NOT exercised here —
 * it is the already-tested shared writer; these tests pin the new logic: the
 * hard-cap that bounds a parked-then-dead worker's protection window, and the
 * fail-safe defaults.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  computeSilenceMinutes,
  resolveWakeMinutes,
  parseArgs,
  DEFAULT_MINUTES,
  BUFFER_MIN,
} = require('../../scripts/park-worker.cjs');

describe('park-worker computeSilenceMinutes (cap math) — SD-FDBK-ENH-PARKED-WORKER-FALSE-001', () => {
  it('adds the buffer to a normal wake interval', () => {
    expect(computeSilenceMinutes(20, { hardCap: 60, buffer: 5 })).toBe(25);
  });

  it('clamps to the hard cap when wake + buffer exceeds it', () => {
    expect(computeSilenceMinutes(100, { hardCap: 60, buffer: 5 })).toBe(60);
    // Boundary: exactly at the cap.
    expect(computeSilenceMinutes(55, { hardCap: 60, buffer: 5 })).toBe(60);
  });

  it('falls back to DEFAULT_MINUTES for non-positive / non-finite input', () => {
    const expected = DEFAULT_MINUTES + BUFFER_MIN;
    expect(computeSilenceMinutes(0)).toBe(expected);
    expect(computeSilenceMinutes(-5)).toBe(expected);
    expect(computeSilenceMinutes(NaN)).toBe(expected);
    expect(computeSilenceMinutes(undefined)).toBe(expected);
  });

  it('uses the module defaults (hard cap is finite and >= buffer)', () => {
    // With defaults, a huge wake interval is still capped to a finite window.
    const v = computeSilenceMinutes(10000);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeLessThanOrEqual(120); // sane upper bound regardless of env override
    expect(v).toBeGreaterThan(0);
  });
});

describe('park-worker resolveWakeMinutes', () => {
  const now = 1_000_000_000_000; // fixed nowMs for determinism

  it('prefers an explicit --minutes value', () => {
    expect(resolveWakeMinutes({ minutes: '30' }, now)).toBe(30);
  });

  it('derives minutes from a future --wake-eta', () => {
    const eta = new Date(now + 10 * 60000).toISOString();
    expect(resolveWakeMinutes({ wakeEta: eta }, now)).toBeCloseTo(10, 5);
  });

  it('falls back to DEFAULT_MINUTES for missing / invalid input', () => {
    expect(resolveWakeMinutes({}, now)).toBe(DEFAULT_MINUTES);
    expect(resolveWakeMinutes({ minutes: '-5' }, now)).toBe(DEFAULT_MINUTES);
    expect(resolveWakeMinutes({ minutes: 'abc' }, now)).toBe(DEFAULT_MINUTES);
    // A wake-eta in the past is ignored -> default.
    const past = new Date(now - 60000).toISOString();
    expect(resolveWakeMinutes({ wakeEta: past }, now)).toBe(DEFAULT_MINUTES);
  });
});

describe('park-worker parseArgs', () => {
  it('parses space-separated and = forms', () => {
    expect(parseArgs(['--minutes', '20'])).toEqual({ minutes: '20', wakeEta: null });
    expect(parseArgs(['--minutes=15'])).toEqual({ minutes: '15', wakeEta: null });
    expect(parseArgs(['-m', '5'])).toEqual({ minutes: '5', wakeEta: null });
    expect(parseArgs(['--wake-eta=2026-06-07T01:30:00Z'])).toEqual({
      minutes: null,
      wakeEta: '2026-06-07T01:30:00Z',
    });
  });

  it('returns nulls for no args', () => {
    expect(parseArgs([])).toEqual({ minutes: null, wakeEta: null });
  });
});
