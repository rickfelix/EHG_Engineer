import { describe, it, expect } from 'vitest';
import { calculateComposite, WEIGHTS } from '../../../scripts/design-quality-scorecard.js';

describe('Design Quality Scorecard', () => {
  describe('WEIGHTS', () => {
    it('weights sum to 1.0', () => {
      const sum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0);
    });

    it('has correct weight values per PRD', () => {
      expect(WEIGHTS.accessibility).toBe(0.35);
      expect(WEIGHTS.token_compliance).toBe(0.25);
      expect(WEIGHTS.component_reuse).toBe(0.20);
      expect(WEIGHTS.visual_polish).toBe(0.20);
    });
  });

  describe('calculateComposite', () => {
    it('calculates weighted composite from all dimensions', () => {
      const result = calculateComposite(100, 100, 100, 100);
      expect(result).toBe(100);
    });

    it('calculates zero when all dimensions are zero', () => {
      const result = calculateComposite(0, 0, 0, 0);
      expect(result).toBe(0);
    });

    it('handles null dimensions by treating as 0', () => {
      const result = calculateComposite(null, null, null, null);
      expect(result).toBe(0);
    });

    it('calculates correct weighted average', () => {
      // 80*0.35 + 60*0.25 + 70*0.20 + 90*0.20 = 28 + 15 + 14 + 18 = 75
      const result = calculateComposite(80, 60, 70, 90);
      expect(result).toBe(75);
    });

    it('handles mixed null and non-null dimensions', () => {
      // 100*0.35 + 0*0.25 + 0*0.20 + 100*0.20 = 35 + 0 + 0 + 20 = 55
      const result = calculateComposite(100, null, null, 100);
      expect(result).toBe(55);
    });

    it('returns integer (rounds)', () => {
      // 73*0.35 + 51*0.25 + 89*0.20 + 42*0.20 = 25.55 + 12.75 + 17.8 + 8.4 = 64.5
      const result = calculateComposite(73, 51, 89, 42);
      expect(result).toBe(Math.round(25.55 + 12.75 + 17.8 + 8.4));
    });
  });
});
