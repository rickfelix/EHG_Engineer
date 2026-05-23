/**
 * SD-FDBK-INFRA-VITEST-PROJECT-SPLIT-001 FR-5 (QF-20260523-727) — unit coverage
 * for the bounded skip-count drift detector that guards the no-DB unit delta
 * gates against vacuous green.
 *
 * Pure, no-DB: asserts on the band math only (this file belongs to the default
 * `unit` vitest project and must never touch a connection).
 */
import { describe, it, expect } from 'vitest';
import { skipDriftStatus, DEFAULT_TOLERANCE, DEFAULT_ABS_FLOOR } from '../../scripts/lib/skip-drift.cjs';

describe('skipDriftStatus — cold start', () => {
  it('returns NEW when baselineSkipped is null (no recorded baseline)', () => {
    const r = skipDriftStatus({ baselineSkipped: null, currentSkipped: 500 });
    expect(r.status).toBe('NEW');
    expect(r.baselineSkipped).toBe(null);
    expect(r.currentSkipped).toBe(500);
  });

  it('returns NEW when baselineSkipped is undefined (missing field on old snapshot)', () => {
    expect(skipDriftStatus({ currentSkipped: 12 }).status).toBe('NEW');
  });

  it('returns NEW when baselineSkipped is non-finite', () => {
    expect(skipDriftStatus({ baselineSkipped: NaN, currentSkipped: 12 }).status).toBe('NEW');
  });
});

describe('skipDriftStatus — within band (OK)', () => {
  it('exact match is OK with zero drift', () => {
    const r = skipDriftStatus({ baselineSkipped: 100, currentSkipped: 100 });
    expect(r.status).toBe('OK');
    expect(r.drift).toBe(0);
    expect(r.lowerBound).toBe(90);
    expect(r.upperBound).toBe(110);
  });

  it('is OK at the +10% edge', () => {
    expect(skipDriftStatus({ baselineSkipped: 100, currentSkipped: 110 }).status).toBe('OK');
  });

  it('is OK at the -10% edge', () => {
    expect(skipDriftStatus({ baselineSkipped: 100, currentSkipped: 90 }).status).toBe('OK');
  });
});

describe('skipDriftStatus — out of band (SKIP_DRIFT)', () => {
  it('flags the vacuous-green cliff: all DB suites suddenly skip', () => {
    const r = skipDriftStatus({ baselineSkipped: 100, currentSkipped: 400 });
    expect(r.status).toBe('SKIP_DRIFT');
    expect(r.drift).toBe(300);
  });

  it('flags a large drop (skip guard removed → DB tests now run/fail elsewhere)', () => {
    const r = skipDriftStatus({ baselineSkipped: 100, currentSkipped: 50 });
    expect(r.status).toBe('SKIP_DRIFT');
    expect(r.drift).toBe(-50);
  });

  it('coerces a non-finite current count to 0 and flags drift vs a real baseline', () => {
    const r = skipDriftStatus({ baselineSkipped: 100, currentSkipped: NaN });
    expect(r.currentSkipped).toBe(0);
    expect(r.status).toBe('SKIP_DRIFT');
  });
});

describe('skipDriftStatus — absolute floor absorbs small-baseline churn', () => {
  it('does NOT flag ±a-few on a small baseline (band widened by abs floor)', () => {
    // base=20, %band would be [18,22]; abs floor 10 widens it to [10,30].
    const r = skipDriftStatus({ baselineSkipped: 20, currentSkipped: 23 });
    expect(r.status).toBe('OK');
    expect(r.lowerBound).toBe(10);
    expect(r.upperBound).toBe(30);
  });

  it('still flags a genuine cliff on a small baseline', () => {
    expect(skipDriftStatus({ baselineSkipped: 20, currentSkipped: 400 }).status).toBe('SKIP_DRIFT');
  });

  it('baseline 0 / current 0 is OK; current beyond the floor is SKIP_DRIFT', () => {
    expect(skipDriftStatus({ baselineSkipped: 0, currentSkipped: 0 }).status).toBe('OK');
    expect(skipDriftStatus({ baselineSkipped: 0, currentSkipped: 5 }).status).toBe('OK'); // within floor band [0,10]
    expect(skipDriftStatus({ baselineSkipped: 0, currentSkipped: 15 }).status).toBe('SKIP_DRIFT');
  });

  it('clamps the lower bound at 0 (never negative)', () => {
    const r = skipDriftStatus({ baselineSkipped: 5, currentSkipped: 5 });
    expect(r.lowerBound).toBe(0); // max(0, 5 - 10)
  });
});

describe('skipDriftStatus — configurable tolerance', () => {
  it('honors a custom tolerance', () => {
    expect(skipDriftStatus({ baselineSkipped: 100, currentSkipped: 140, tolerance: 0.5 }).status).toBe('OK'); // band [50,150]
    expect(skipDriftStatus({ baselineSkipped: 100, currentSkipped: 160, tolerance: 0.5 }).status).toBe('SKIP_DRIFT');
  });

  it('falls back to the default tolerance/floor on garbage input', () => {
    const r = skipDriftStatus({ baselineSkipped: 100, currentSkipped: 100, tolerance: -1, absFloor: -1 });
    expect(r.tolerance).toBe(DEFAULT_TOLERANCE);
    expect(r.absFloor).toBe(DEFAULT_ABS_FLOOR);
  });
});

describe('skipDriftStatus — exported constants', () => {
  it('exposes default tolerance (±10%) and floor (10)', () => {
    expect(DEFAULT_TOLERANCE).toBe(0.10);
    expect(DEFAULT_ABS_FLOOR).toBe(10);
  });
});
