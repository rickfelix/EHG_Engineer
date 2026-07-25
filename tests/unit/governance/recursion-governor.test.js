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
  // QF-20260725-112: these previously fed {key} rows with NO durable field and asserted the
  // key-prefix regex outcome — i.e. they encoded the very behaviour that made this gauge
  // misinform. The discriminant is now target_application via classifySdRow, so the rows
  // must carry it. Measured justification on the live 30d cohort (1076 rows): the regex read
  // meta=951 product=125 ratio=7.608; the durable field reads meta=987 product=89
  // unclassified=0 ratio=11.09, against a declared band max of 3.
  it('classifies by the DURABLE target_application field, not the key prefix', () => {
    const items = [
      { sd_key: 'SD-LEO-INFRA-FOO-001', target_application: 'EHG_Engineer' },
      { sd_key: 'SD-LEARN-FIX-BAR-001', target_application: 'EHG_Engineer' },
      // The regex called these PRODUCT because the prefix is unrecognised; the durable field
      // says EHG_Engineer, i.e. harness work. This is the 88-row spread the QF is about.
      { sd_key: 'SD-FDBK-ENH-SOMETHING-001', target_application: 'EHG_Engineer' },
      { sd_key: 'SD-REFILL-WHATEVER-001', target_application: 'EHG_Engineer' },
      { sd_key: 'SD-MARKETLENS-VENTURE-001', target_application: 'marketlens' },
    ];
    const result = computeRecursionRatio(items, { windowDays: 30 });
    expect(result.meta).toBe(4);
    expect(result.product).toBe(1);
    expect(result.unclassified).toBe(0);
    expect(result.ratio).toBe(4);
    expect(result.windowDays).toBe(30);
  });

  it('reports a row with NO durable field as unclassified, never as product', () => {
    // The whole point of the three-valued classifier: absence of the field proves nothing,
    // so it must NOT inflate product (which is what silently understated the taper).
    const result = computeRecursionRatio([
      { sd_key: 'SD-MARKETLENS-VENTURE-001' },          // unknown prefix, no durable field
      { sd_key: 'SD-LEO-INFRA-FOO-001' },               // meta prefix still positively identifies
      { sd_key: 'SD-SOMETHING-ELSE-001', target_application: 'ehg' },
    ]);
    expect(result.meta).toBe(1);
    expect(result.product).toBe(1);
    expect(result.unclassified).toBe(1);
    expect(result.ratio).toBe(1); // unclassified excluded from the denominator
  });

  it('accepts a legacy {key} row by aliasing it onto sd_key', () => {
    // Back-compat for any un-widened caller: prefix META detection still works, and an
    // unrecognised legacy row lands in unclassified rather than being counted as product.
    const result = computeRecursionRatio([{ key: 'QF-20260703-001' }, { key: 'SD-MARKETLENS-VENTURE-001' }]);
    expect(result.meta).toBe(1);
    expect(result.product).toBe(0);
    expect(result.unclassified).toBe(1);
  });

  it('returns ratio=null (not a divide-by-zero) when product=0 and meta>0', () => {
    const items = [
      { sd_key: 'QF-1', target_application: 'EHG_Engineer' },
      { sd_key: 'QF-2', target_application: 'EHG_Engineer' },
    ];
    const result = computeRecursionRatio(items);
    expect(result.meta).toBe(2);
    expect(result.product).toBe(0);
    expect(result.ratio).toBeNull();
  });

  it('handles an empty item list defensively', () => {
    expect(computeRecursionRatio([])).toMatchObject({ meta: 0, product: 0, unclassified: 0, ratio: null });
    expect(computeRecursionRatio(undefined)).toMatchObject({ meta: 0, product: 0, unclassified: 0, ratio: null });
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
