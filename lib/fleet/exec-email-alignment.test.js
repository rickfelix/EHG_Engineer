// SD-LEO-INFRA-EXEC-EMAIL-STRATEGY-ALIGNED-001 (FR-2): unit tests for the ALIGNMENT helpers —
// the meta-to-product taper ratio + the dormant-until-revenue distance-to-quit line.
import { describe, it, expect } from 'vitest';
import {
  isMetaSd,
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
  it('counts meta vs product and computes the ratio', () => {
    const rows = [
      { sd_key: 'SD-LEO-INFRA-A-001' },
      { sd_key: 'SD-LEO-INFRA-B-001' },
      { sd_key: 'SD-EHG-PRODUCT-C-001' },
      { sd_key: 'SD-EHG-UIUX-RM-D-001' },
    ];
    const r = computeMetaToProductRatio(rows, { windowDays: 30 });
    expect(r.meta).toBe(2);
    expect(r.product).toBe(2);
    expect(r.ratio).toBe(1);
    expect(r.line).toContain('1.0 : 1');
    expect(r.line).toContain('2 meta vs 2 product');
    expect(r.line).toContain('last 30d');
  });
  it('avoids divide-by-zero when there are no product items', () => {
    const r = computeMetaToProductRatio([{ sd_key: 'SD-LEO-INFRA-A-001' }]);
    expect(r.ratio).toBeNull();
    expect(r.line).toContain('1 meta / 0 product');
  });
  it('honours the windowDays label', () => {
    const r = computeMetaToProductRatio([{ sd_key: 'QF-1' }, { sd_key: 'SD-EHG-X-1' }], { windowDays: 7 });
    expect(r.line).toContain('last 7d');
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
