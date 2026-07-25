// SD-LEO-INFRA-EXEC-EMAIL-STRATEGY-ALIGNED-001 (FR-2): unit tests for the ALIGNMENT helpers —
// the meta-to-product taper ratio + the dormant-until-revenue distance-to-quit line.
import { describe, it, expect } from 'vitest';
import {
  isMetaSd,
  classifySdRow,
  computeMetaToProductRatio,
  formatDistanceToQuitLine,
} from './exec-email-alignment.mjs';

describe('isMetaSd', () => {
  it('classifies harness/meta prefixes as meta', () => {
    expect(isMetaSd('SD-LEO-INFRA-FOO-001')).toBe(true);
    expect(isMetaSd('SD-LEARN-FIX-BAR-001')).toBe(true);
    expect(isMetaSd('SD-MAN-INFRA-BAZ-001')).toBe(true);
    expect(isMetaSd('QF-20260624-001')).toBe(true);
  });
  it('classifies product/venture SDs as not-meta', () => {
    expect(isMetaSd('SD-EHG-PRODUCT-FOO-001')).toBe(false);
    expect(isMetaSd('SD-EHG-UIUX-RM-BAR-001')).toBe(false);
    expect(isMetaSd('SD-REFILL-00ABCDEF')).toBe(false);
    expect(isMetaSd(null)).toBe(false);
    expect(isMetaSd(undefined)).toBe(false);
  });
});

describe('computeMetaToProductRatio', () => {
  it('returns null for an empty window', () => {
    expect(computeMetaToProductRatio([])).toBeNull();
    expect(computeMetaToProductRatio(null)).toBeNull();
  });
  it('counts meta vs product and computes the ratio (durable target_application)', () => {
    const rows = [
      { sd_key: 'SD-LEO-INFRA-A-001', target_application: 'EHG_Engineer' },
      { sd_key: 'SD-LEO-INFRA-B-001', target_application: 'EHG_Engineer' },
      { sd_key: 'SD-EHG-PRODUCT-C-001', target_application: 'MarketLens' },
      { sd_key: 'SD-EHG-UIUX-RM-D-001', target_application: 'DemandSense' },
    ];
    const r = computeMetaToProductRatio(rows, { windowDays: 30 });
    expect(r.meta).toBe(2);
    expect(r.product).toBe(2);
    expect(r.unclassified).toBe(0);
    expect(r.ratio).toBe(1);
    expect(r.line).toContain('1.0 : 1');
    expect(r.line).toContain('2 meta vs 2 product');
    expect(r.line).not.toContain('unclassified'); // omitted entirely when zero
    expect(r.line).toContain('last 30d');
  });
  it('avoids divide-by-zero when there are no product items', () => {
    const r = computeMetaToProductRatio([{ sd_key: 'SD-LEO-INFRA-A-001', target_application: 'EHG_Engineer' }]);
    expect(r.ratio).toBeNull();
    expect(r.line).toContain('1 meta / 0 product');
  });
  it('honours the windowDays label', () => {
    const r = computeMetaToProductRatio(
      [{ sd_key: 'QF-1', target_application: 'EHG_Engineer' }, { sd_key: 'SD-EHG-X-1', target_application: 'EHG' }],
      { windowDays: 7 });
    expect(r.line).toContain('last 7d');
  });

  // QF-20260725-141 regression guards.
  it('a row with NO durable field and no meta prefix is UNCLASSIFIED, never product', () => {
    // The exact live shapes the prefix regex silently counted as product: feedback, belt-refill,
    // and test fixtures. Inflating product is what made the taper unusable as a chairman input.
    const rows = [
      { sd_key: 'SD-FDBK-ENH-FOO-001' },
      { sd_key: 'SD-REFILL-00ABCDEF' },
      { sd_key: 'SD-TEST-FIXTURE-001' },
    ];
    const r = computeMetaToProductRatio(rows);
    expect(r.product).toBe(0);
    expect(r.unclassified).toBe(3);
    expect(r.line).toContain('3 unclassified');
  });
  it('the durable field OVERRIDES the key prefix in both directions', () => {
    // A meta-prefixed key targeting a venture repo is product work; a product-looking key targeting
    // the harness is meta. Classifying on the key alone gets both of these backwards.
    expect(classifySdRow({ sd_key: 'QF-20260725-141', target_application: 'MarketLens' })).toBe('product');
    expect(classifySdRow({ sd_key: 'SD-EHG-PRODUCT-X-001', target_application: 'EHG_Engineer' })).toBe('meta');
  });
  it('classifySdRow is three-valued and treats blank/whitespace app as absent', () => {
    expect(classifySdRow({ sd_key: 'SD-LEO-INFRA-A-001' })).toBe('meta');
    expect(classifySdRow({ sd_key: 'SD-WHATEVER-1', target_application: '   ' })).toBe('unclassified');
    expect(classifySdRow({})).toBe('unclassified');
    expect(classifySdRow(null)).toBe('unclassified');
  });
});

describe('formatDistanceToQuitLine', () => {
  it('returns null when the chairman threshold is absent', () => {
    expect(formatDistanceToQuitLine({ ventureNetMonthlyUsd: 0, thresholdPresent: false })).toBeNull();
  });
  it('renders the dormant state when there is no realized venture income', () => {
    const line = formatDistanceToQuitLine({ ventureNetMonthlyUsd: 0, thresholdPresent: true });
    expect(line).toContain('dormant');
    expect(line).toContain('no realized venture income');
  });
  it('treats non-finite / negative net as dormant (never a fabricated distance)', () => {
    expect(formatDistanceToQuitLine({ ventureNetMonthlyUsd: NaN, thresholdPresent: true })).toContain('dormant');
    expect(formatDistanceToQuitLine({ ventureNetMonthlyUsd: -50, thresholdPresent: true })).toContain('dormant');
  });
  it('renders a realized distance once venture net is positive', () => {
    const line = formatDistanceToQuitLine({ ventureNetMonthlyUsd: 1200, thresholdPresent: true });
    expect(line).toContain('1200');
    expect(line).toContain('quit-threshold');
    expect(line).not.toContain('dormant');
  });
});
