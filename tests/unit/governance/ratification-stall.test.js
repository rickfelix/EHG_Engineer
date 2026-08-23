/**
 * SD-LEO-INFRA-CHAIRMAN-RATIFICATION-LEDGER-001 FR-3 — TS-1, TS-3, TS-14: the pure
 * encoding-staleness predicate (lib/governance/ratification-stall.mjs). No DB, no live data.
 */
import { describe, it, expect } from 'vitest';
import { isStaleRatification, formatRatificationStaleLine, DEFAULT_STALE_RATIFICATION_HOURS } from '../../../lib/governance/ratification-stall.mjs';

describe('isStaleRatification', () => {
  it('default threshold is 24 hours', () => {
    expect(DEFAULT_STALE_RATIFICATION_HOURS).toBe(24);
  });

  it('TS-1: true for a 25h-old unencoded row', () => {
    expect(isStaleRatification(25, null)).toBe(true);
  });

  it('TS-14: true at exactly the 24h threshold (inclusive, >=)', () => {
    expect(isStaleRatification(24, null)).toBe(true);
  });

  it('TS-3: false for a 23h-old unencoded row (under threshold)', () => {
    expect(isStaleRatification(23, null)).toBe(false);
  });

  it('false for an already-encoded row regardless of age', () => {
    expect(isStaleRatification(1000, '2026-08-01T00:00:00Z')).toBe(false);
  });

  it('treats undefined encodedAt the same as null', () => {
    expect(isStaleRatification(25, undefined)).toBe(true);
  });

  it('respects a custom threshold', () => {
    expect(isStaleRatification(2, null, 1)).toBe(true);
    expect(isStaleRatification(0.5, null, 1)).toBe(false);
  });

  it('is defensive against non-finite input', () => {
    expect(isStaleRatification(NaN, null)).toBe(false);
    expect(isStaleRatification(undefined, null)).toBe(false);
    expect(isStaleRatification(25, null, NaN)).toBe(false);
  });
});

describe('formatRatificationStaleLine', () => {
  it('emits the QUIET_TICK_RATIFICATION_STALE token with id, age, and target_contracts', () => {
    const line = formatRatificationStaleLine('adam', { id: 'row-1', target_contracts: ['adam', 'coordinator'] }, 25);
    expect(line).toMatch(/^QUIET_TICK_RATIFICATION_STALE=adam /);
    expect(line).toContain('id=row-1');
    expect(line).toContain('age=1500m');
    expect(line).toContain('target=adam,coordinator');
  });
});
