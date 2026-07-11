import { describe, it, expect } from 'vitest';
import {
  isWaveExclusionClass,
  computeCoverage,
  computeDispatchMix,
  isDriftBreach,
  COVERAGE_FLOOR_PCT,
} from '../../lib/governance/plan-drift-detectors.js';

describe('plan-drift-detectors', () => {
  describe('isWaveExclusionClass', () => {
    it('excludes QF keys', () => {
      expect(isWaveExclusionClass('QF-20260711-001')).toBe(true);
    });
    it('excludes harness/meta SD prefixes', () => {
      expect(isWaveExclusionClass('SD-LEO-INFRA-FOO-001')).toBe(true);
      expect(isWaveExclusionClass('SD-LEARN-FIX-BAR-001')).toBe(true);
      expect(isWaveExclusionClass('SD-MAN-INFRA-BAZ-001')).toBe(true);
    });
    it('does not exclude product SD keys', () => {
      expect(isWaveExclusionClass('SD-EHG-PRODUCT-FOO-001')).toBe(false);
    });
  });

  describe('computeCoverage (honest-gauge rule)', () => {
    it('reports STARVED on zero claimable leaves (divide-by-zero edge, TS-3)', () => {
      const result = computeCoverage([], {});
      expect(result.starved).toBe(true);
      expect(result.coveragePct).toBeNull();
      expect(result.total).toBe(0);
    });

    it('reports STARVED when coverage is below the floor (TS-2)', () => {
      const claimable = [{ sd_key: 'SD-A-001' }, { sd_key: 'SD-B-001' }, { sd_key: 'SD-C-001' }, { sd_key: 'SD-D-001' }, { sd_key: 'SD-E-001' }];
      // 3/5 = 60% < 80% floor
      const sdRungMap = { 'SD-A-001': 'now', 'SD-B-001': 'next', 'SD-C-001': 'now' };
      const result = computeCoverage(claimable, sdRungMap);
      expect(result.coveragePct).toBe(60);
      expect(result.starved).toBe(true);
    });

    it('reports aligned when coverage is at/above the floor (TS-1)', () => {
      const claimable = [{ sd_key: 'SD-A-001' }, { sd_key: 'SD-B-001' }, { sd_key: 'SD-C-001' }, { sd_key: 'SD-D-001' }, { sd_key: 'SD-E-001' }];
      // 4/5 = 80% >= 80% floor
      const sdRungMap = { 'SD-A-001': 'now', 'SD-B-001': 'next', 'SD-C-001': 'now', 'SD-D-001': 'later' };
      const result = computeCoverage(claimable, sdRungMap);
      expect(result.coveragePct).toBe(80);
      expect(result.starved).toBe(false);
    });

    it('respects a custom floor', () => {
      const claimable = [{ sd_key: 'SD-A-001' }, { sd_key: 'SD-B-001' }];
      const sdRungMap = { 'SD-A-001': 'now' };
      const result = computeCoverage(claimable, sdRungMap, { floorPct: 40 });
      expect(result.coveragePct).toBe(50);
      expect(result.starved).toBe(false);
    });
  });

  describe('computeDispatchMix', () => {
    it('reports STARVED on a zero post-exclusion denominator (all excluded)', () => {
      const result = computeDispatchMix(['QF-20260711-001', 'SD-LEO-INFRA-FOO-001'], {}, 'now');
      expect(result.starved).toBe(true);
      expect(result.total).toBe(0);
      expect(result.excluded).toBe(2);
    });

    it('excludes QF/harness classes from the denominator (TS-7)', () => {
      const dispatched = ['SD-EHG-PRODUCT-A-001', 'QF-20260711-001', 'SD-EHG-PRODUCT-B-001'];
      const sdRungMap = { 'SD-EHG-PRODUCT-A-001': 'now', 'SD-EHG-PRODUCT-B-001': 'now' };
      const withExclusion = computeDispatchMix(dispatched, sdRungMap, 'now');
      expect(withExclusion.total).toBe(2);
      expect(withExclusion.excluded).toBe(1);

      const withoutExclusionSd = ['SD-EHG-PRODUCT-A-001', 'SD-EHG-PRODUCT-B-001'];
      const noExclusionPresent = computeDispatchMix(withoutExclusionSd, sdRungMap, 'now');
      expect(noExclusionPresent.total).toBe(2);
      expect(noExclusionPresent.excluded).toBe(0);
    });

    it('buckets by rung and computes active-rung share', () => {
      const dispatched = ['SD-A-001', 'SD-B-001', 'SD-C-001', 'SD-D-001'];
      // SD-D-001 is intentionally absent from sdRungMap -- exercises the 'unlinked' fallback.
      const sdRungMap = { 'SD-A-001': 'now', 'SD-B-001': 'now', 'SD-C-001': 'next' };
      const result = computeDispatchMix(dispatched, sdRungMap, 'now');
      expect(result.total).toBe(4);
      expect(result.mix.now).toBe(2);
      expect(result.mix.next).toBe(1);
      expect(result.mix.unlinked).toBe(1);
      expect(result.activeRungCount).toBe(2);
      expect(result.activeRungPct).toBe(50);
    });
  });

  describe('isDriftBreach', () => {
    it('treats STARVED as a breach (never a false pass)', () => {
      expect(isDriftBreach({ starved: true, activeRungPct: 100 })).toBe(true);
    });

    it('is a breach when active-rung share is below the minimum', () => {
      expect(isDriftBreach({ starved: false, activeRungPct: 10 }, { minActiveRungPct: 25 })).toBe(true);
    });

    it('is not a breach when active-rung share meets the minimum', () => {
      expect(isDriftBreach({ starved: false, activeRungPct: 40 }, { minActiveRungPct: 25 })).toBe(false);
    });
  });

  it('COVERAGE_FLOOR_PCT matches the fold-seam SD acceptance floor', () => {
    expect(COVERAGE_FLOOR_PCT).toBe(80);
  });
});
