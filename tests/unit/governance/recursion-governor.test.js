/**
 * Unit tests for lib/governance/recursion-governor.js's pure detectors.
 *
 * SD-LEO-INFRA-009-LEAF-RECURSION-001 (C-009 leaf 4): recursion governor - self-improvement
 * throughput as a KPI-owned ratio of product throughput (the chairman taper rule formalized).
 *
 * @module tests/unit/governance/recursion-governor.test.js
 */

import { describe, it, expect } from 'vitest';
import {
  computeRecursionRatio,
  isBandBreach,
  detectSustainedBreach,
} from '../../../lib/governance/recursion-governor.js';

describe('computeRecursionRatio', () => {
  it('classifies SD-LEO-*, SD-LEARN-FIX-*, SD-MAN-INFRA-*, QF-* as meta and everything else as product', () => {
    const items = [
      { key: 'SD-LEO-INFRA-FOO-001' },
      { key: 'SD-LEARN-FIX-BAR-001' },
      { key: 'SD-MAN-INFRA-BAZ-001' },
      { key: 'QF-20260703-001' },
      { key: 'SD-MARKETLENS-VENTURE-001' },
    ];
    const result = computeRecursionRatio(items, { windowDays: 30 });
    expect(result.meta).toBe(4);
    expect(result.product).toBe(1);
    expect(result.ratio).toBe(4);
    expect(result.windowDays).toBe(30);
  });

  it('returns ratio=null (not a divide-by-zero) when product=0 and meta>0', () => {
    const items = [{ key: 'QF-1' }, { key: 'QF-2' }];
    const result = computeRecursionRatio(items);
    expect(result.meta).toBe(2);
    expect(result.product).toBe(0);
    expect(result.ratio).toBeNull();
  });

  it('handles an empty item list defensively', () => {
    expect(computeRecursionRatio([])).toMatchObject({ meta: 0, product: 0, ratio: null });
    expect(computeRecursionRatio(undefined)).toMatchObject({ meta: 0, product: 0, ratio: null });
  });
});

describe('isBandBreach', () => {
  it('breaches when ratio exceeds maxRatio', () => {
    expect(isBandBreach({ meta: 4, product: 1, ratio: 4 }, { maxRatio: 3 })).toBe(true);
  });

  it('does not breach when ratio is at or below maxRatio', () => {
    expect(isBandBreach({ meta: 3, product: 1, ratio: 3 }, { maxRatio: 3 })).toBe(false);
    expect(isBandBreach({ meta: 1, product: 1, ratio: 1 }, { maxRatio: 3 })).toBe(false);
  });

  it('breaches on the all-meta/zero-product edge case even though ratio is null', () => {
    expect(isBandBreach({ meta: 2, product: 0, ratio: null }, { maxRatio: 3 })).toBe(true);
  });

  it('does not breach when there are zero items at all', () => {
    expect(isBandBreach({ meta: 0, product: 0, ratio: null }, { maxRatio: 3 })).toBe(false);
  });

  it('uses the default maxRatio when no options are supplied', () => {
    expect(isBandBreach({ meta: 10, product: 1, ratio: 10 })).toBe(true);
    expect(isBandBreach({ meta: 2, product: 1, ratio: 2 })).toBe(false);
  });
});

describe('detectSustainedBreach', () => {
  it('is sustained only after an unbroken streak of exactly requiredConsecutive breaches from newest', () => {
    const snapshots = [{ breach: true }, { breach: true }, { breach: true }, { breach: false }];
    const result = detectSustainedBreach(snapshots, { requiredConsecutive: 3 });
    expect(result.sustained).toBe(true);
    expect(result.streak).toBe(3);
  });

  it('is NOT sustained on a single blip (one breach then a pass)', () => {
    const snapshots = [{ breach: true }, { breach: false }, { breach: true }, { breach: true }];
    const result = detectSustainedBreach(snapshots, { requiredConsecutive: 3 });
    expect(result.sustained).toBe(false);
    expect(result.streak).toBe(1);
  });

  it('is NOT sustained when the streak breaks partway through', () => {
    const snapshots = [{ breach: true }, { breach: true }, { breach: false }, { breach: true }];
    const result = detectSustainedBreach(snapshots, { requiredConsecutive: 3 });
    expect(result.sustained).toBe(false);
    expect(result.streak).toBe(2);
  });

  it('handles a snapshot history shorter than requiredConsecutive defensively (never sustains)', () => {
    const snapshots = [{ breach: true }, { breach: true }];
    const result = detectSustainedBreach(snapshots, { requiredConsecutive: 3 });
    expect(result.sustained).toBe(false);
    expect(result.streak).toBe(2);
  });

  it('handles an empty/undefined snapshot history defensively', () => {
    expect(detectSustainedBreach([])).toEqual({ sustained: false, streak: 0 });
    expect(detectSustainedBreach(undefined)).toEqual({ sustained: false, streak: 0 });
  });
});
