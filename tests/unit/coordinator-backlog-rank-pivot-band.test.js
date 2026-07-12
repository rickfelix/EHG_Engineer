import { describe, it, expect } from 'vitest';
import {
  isProductClass,
  isHarnessClass,
  productPivotRank,
  productPivotCompare,
  isFleetCritical,
} from '../../scripts/coordinator-backlog-rank.mjs';

// SD-LEO-INFRA-BELT-RANKER-PIVOT-AWARENESS-001: unit-test the pivot-aware product-priority band
// against the REAL exported comparator helpers (not a re-implementation).
const product = { sd_key: 'SD-EHG-PRODUCT-DASHBOARD-001' };
const harnessInfra = { sd_key: 'SD-LEO-INFRA-FOO-001' };
const harnessMan = { sd_key: 'SD-MAN-INFRA-BAR-001' };
const harnessLearn = { sd_key: 'SD-LEARN-FIX-BAZ-001' };
const harnessQf = { sd_key: 'QF-20260626-001' };
const neutral = { sd_key: 'SD-EHG-VENTURE1-MARKET-MODELING-001' };

describe('class detection (FR-3)', () => {
  it('classifies product-class by SD-EHG-PRODUCT prefix', () => {
    expect(isProductClass(product)).toBe(true);
    expect(isProductClass(harnessInfra)).toBe(false);
    expect(isProductClass(neutral)).toBe(false);
  });

  it('classifies harness-class by SD-LEO-INFRA / SD-MAN-INFRA / SD-LEARN-FIX / QF prefixes', () => {
    for (const h of [harnessInfra, harnessMan, harnessLearn, harnessQf]) {
      expect(isHarnessClass(h)).toBe(true);
    }
    expect(isHarnessClass(product)).toBe(false);
    expect(isHarnessClass(neutral)).toBe(false);
  });

  it('ranks product(0) < neutral(1) < harness(2)', () => {
    expect(productPivotRank(product)).toBe(0);
    expect(productPivotRank(neutral)).toBe(1);
    expect(productPivotRank(harnessInfra)).toBe(2);
  });
});

describe('productPivotCompare band (FR-1, graduated always-active per QF-20260712-716)', () => {
  it('product sorts before harness', () => {
    expect(productPivotCompare(product, harnessInfra)).toBeLessThan(0);
    expect(productPivotCompare(harnessInfra, product)).toBeGreaterThan(0);
  });

  it('product sorts before neutral and neutral before harness', () => {
    expect(productPivotCompare(product, neutral)).toBeLessThan(0);
    expect(productPivotCompare(neutral, harnessInfra)).toBeLessThan(0);
  });

  it('same-class is a tie (0) — defers to downstream comparators', () => {
    expect(productPivotCompare(harnessInfra, harnessMan)).toBe(0);
    expect(productPivotCompare(product, { sd_key: 'SD-EHG-PRODUCT-OTHER-001' })).toBe(0);
  });
});

describe('band composes below the higher-precedence bands', () => {
  // The product band runs AFTER unlock and the fleet_critical/quarantine/bare-shell gates in the
  // real comparator. This asserts the band itself never claims to outrank those (it only breaks ties
  // at its own level): a fleet_critical harness SD is still fleet_critical regardless of class.
  it('class detection does not alter fleet_critical detection', () => {
    const fcHarness = { sd_key: 'SD-LEO-INFRA-FC-001', metadata: { fleet_critical: true } };
    expect(isFleetCritical(fcHarness)).toBe(true);
    expect(isHarnessClass(fcHarness)).toBe(true);
    // The comparator applies fleet_critical BEFORE productPivotCompare, so this harness SD still
    // wins its fleet_critical tier — the band cannot demote it below product at that earlier stage.
  });
});
