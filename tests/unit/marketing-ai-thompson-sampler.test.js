/**
 * Unit Tests: Thompson Sampling Multi-Armed Bandit
 * SD-EVA-FEAT-MARKETING-AI-001 (US-001)
 */

import { describe, test, expect } from 'vitest';
import { createSampler, sampleBeta, MIN_IMPRESSIONS_FOR_DECLARATION, EXPLORATION_FLOOR } from '../../lib/marketing/ai/thompson-sampler.js';

describe('ThompsonSampler', () => {
  describe('createSampler', () => {
    test('returns object with selectVariant and canDeclareChampion', () => {
      const sampler = createSampler();
      expect(sampler.selectVariant).toBeTypeOf('function');
      expect(sampler.canDeclareChampion).toBeTypeOf('function');
    });
  });

  describe('selectVariant', () => {
    test('throws on empty variants array', () => {
      const sampler = createSampler();
      expect(() => sampler.selectVariant([])).toThrow('At least one variant');
    });

    test('returns single variant when only one provided', () => {
      const sampler = createSampler();
      const result = sampler.selectVariant([{ id: 'A', successes: 10, failures: 5 }]);
      expect(result.variantId).toBe('A');
      expect(result.selectionReason).toBe('single_variant');
      expect(result.posteriorMean).toBeCloseTo(11 / 17, 5);
    });

    test('returns a valid selection from multiple variants', () => {
      const sampler = createSampler();
      const variants = [
        { id: 'A', successes: 100, failures: 50 },
        { id: 'B', successes: 80, failures: 70 },
        { id: 'C', successes: 30, failures: 20 }
      ];
      const result = sampler.selectVariant(variants);
      expect(['A', 'B', 'C']).toContain(result.variantId);
      expect(result.posteriorMean).toBeGreaterThan(0);
      expect(result.posteriorMean).toBeLessThan(1);
      expect(result.posteriorVariance).toBeGreaterThan(0);
      expect(result.sampleValue).toBeGreaterThan(0);
    });

    test('favors higher-performing variant over many trials', () => {
      const sampler = createSampler();
      const variants = [
        { id: 'winner', successes: 500, failures: 100 },
        { id: 'loser', successes: 50, failures: 500 }
      ];

      let winnerCount = 0;
      for (let i = 0; i < 200; i++) {
        const result = sampler.selectVariant(variants);
        if (result.variantId === 'winner') winnerCount++;
      }

      // Winner should be selected the vast majority of the time
      expect(winnerCount).toBeGreaterThan(150);
    });

    test('selectionReason is thompson_sampling for well-explored variants', () => {
      const sampler = createSampler();
      const variants = [
        { id: 'A', successes: 200, failures: 100 },
        { id: 'B', successes: 150, failures: 150 }
      ];

      // Run enough times to get a thompson_sampling result
      let gotThompson = false;
      for (let i = 0; i < 50; i++) {
        const result = sampler.selectVariant(variants);
        if (result.selectionReason === 'thompson_sampling') {
          gotThompson = true;
          break;
        }
      }
      expect(gotThompson).toBe(true);
    });
  });

  describe('canDeclareChampion', () => {
    test('returns false when impressions below threshold', () => {
      const sampler = createSampler();
      expect(sampler.canDeclareChampion({ successes: 30, failures: 20 })).toBe(false);
    });

    test('returns true when impressions at threshold', () => {
      const sampler = createSampler();
      expect(sampler.canDeclareChampion({ successes: 60, failures: 40 })).toBe(true);
    });

    test('returns true when impressions above threshold', () => {
      const sampler = createSampler();
      expect(sampler.canDeclareChampion({ successes: 200, failures: 100 })).toBe(true);
    });
  });

  describe('sampleBeta', () => {
    test('returns value between 0 and 1', () => {
      for (let i = 0; i < 100; i++) {
        const val = sampleBeta(2, 5);
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    });

    test('mean converges to alpha/(alpha+beta)', () => {
      const alpha = 10;
      const beta = 5;
      const expectedMean = alpha / (alpha + beta);
      let sum = 0;
      const n = 5000;
      for (let i = 0; i < n; i++) {
        sum += sampleBeta(alpha, beta);
      }
      const sampleMean = sum / n;
      expect(sampleMean).toBeCloseTo(expectedMean, 1);
    });
  });

  describe('constants', () => {
    test('MIN_IMPRESSIONS_FOR_DECLARATION is 100', () => {
      expect(MIN_IMPRESSIONS_FOR_DECLARATION).toBe(100);
    });

    test('EXPLORATION_FLOOR is 0.20', () => {
      expect(EXPLORATION_FLOOR).toBe(0.20);
    });
  });
});
