/**
 * QF-20260831-127: the retire-check census (Solomon). Post-fix acceptance: no single standing
 * condition should account for a dominant share of NEW rows in the affected tables.
 */
import { describe, it, expect } from 'vitest';
import { computeTop1Share } from '../../../scripts/audit/level-vs-edge-top1-share.mjs';

const row = (dedupKey) => ({ metadata: { dedup_key: dedupKey } });

describe('computeTop1Share', () => {
  it('excludes one-off keys (count 1) from the denominator entirely -- they are edge events, not standing conditions', () => {
    const rows = [row('a'), row('b'), row('c')]; // each appears once
    const res = computeTop1Share(rows, (r) => r.metadata?.dedup_key);
    expect(res.total).toBe(0);
    expect(res.groups).toEqual([]);
    expect(res.top1Share).toBe(0);
  });

  it('THE INCIDENT SHAPE: a repeatedly-re-asserted condition dominates the repeating-key share', () => {
    const rows = [
      ...Array(99).fill(null).map(() => row('WAVE_LINKAGE_STARVATION')),
      row('other-recurring'), row('other-recurring'),
      row('one-off-1'), row('one-off-2'), // excluded: count 1
    ];
    const res = computeTop1Share(rows, (r) => r.metadata?.dedup_key);
    expect(res.total).toBe(101); // 99 + 2, one-offs excluded
    expect(res.groups[0]).toEqual({ key: 'WAVE_LINKAGE_STARVATION', count: 99, share: 99 / 101 });
    expect(res.top1Share).toBeCloseTo(99 / 101);
  });

  it('POST-FIX shape: many small repeating conditions, none dominant', () => {
    const rows = [
      row('cond-a'), row('cond-a'),
      row('cond-b'), row('cond-b'),
      row('cond-c'), row('cond-c'),
    ];
    const res = computeTop1Share(rows, (r) => r.metadata?.dedup_key);
    expect(res.top1Share).toBeCloseTo(1 / 3);
    expect(res.top1Share).toBeLessThan(0.5);
  });

  it('minRepeats is configurable', () => {
    const rows = [row('a'), row('a'), row('a'), row('b'), row('b'), row('b'), row('b')];
    const res = computeTop1Share(rows, (r) => r.metadata?.dedup_key, { minRepeats: 4 });
    expect(res.total).toBe(4); // only 'b' (4x) qualifies at minRepeats=4
    expect(res.groups.map((g) => g.key)).toEqual(['b']);
  });

  it('rows with no groupable key are skipped, never crash', () => {
    const rows = [{ metadata: {} }, { metadata: null }, {}, row('x'), row('x')];
    const res = computeTop1Share(rows, (r) => r.metadata?.dedup_key || null);
    expect(res.total).toBe(2);
    expect(res.groups[0].key).toBe('x');
  });

  it('ADVERSARIAL-REVIEW: the 2-group boundary mechanically yields >=50% for the larger group -- documented interpretation caveat, not a bug', () => {
    // Regardless of the SIZE gap between the two groups, top1Share is pushed to/past 50% purely
    // by having only 2 surviving repeating-key groups -- pins the documented caveat so a future
    // caller wiring this into a hard gate is not surprised by it.
    const rows = [row('a'), row('a'), row('b'), row('b')]; // even split
    const res = computeTop1Share(rows, (r) => r.metadata?.dedup_key);
    expect(res.groups.length).toBe(2);
    expect(res.top1Share).toBeGreaterThanOrEqual(0.5);
  });
});
