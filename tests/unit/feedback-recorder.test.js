import { describe, it, expect } from 'vitest';
import {
  computeDecay,
  computeBoost,
  HALF_LIFE_WEEKS,
  CONFIDENCE_FLOOR,
  BOOST_FACTOR,
  BOOST_CAP,
  BASELINE_WEIGHT
} from '../../lib/eva/consultant/feedback-recorder.js';

describe('feedback-recorder', () => {
  describe('computeDecay', () => {
    it('reduces weight from baseline', () => {
      const result = computeDecay(BASELINE_WEIGHT);
      expect(result).toBeLessThan(BASELINE_WEIGHT);
      expect(result).toBeGreaterThan(CONFIDENCE_FLOOR);
    });

    it('applies 4-week half-life formula', () => {
      // After 4 dismissals (one per week), weight should be approximately halved
      let weight = BASELINE_WEIGHT;
      for (let i = 0; i < HALF_LIFE_WEEKS; i++) {
        weight = computeDecay(weight);
      }
      // Should be close to 0.5 (half of baseline)
      expect(weight).toBeCloseTo(0.5, 1);
    });

    it('never goes below CONFIDENCE_FLOOR', () => {
      let weight = BASELINE_WEIGHT;
      // Apply decay 100 times
      for (let i = 0; i < 100; i++) {
        weight = computeDecay(weight);
      }
      expect(weight).toBeGreaterThanOrEqual(CONFIDENCE_FLOOR);
    });

    it('floors at exactly 0.1 for very small weights', () => {
      const result = computeDecay(0.05);
      expect(result).toBe(CONFIDENCE_FLOOR);
    });
  });

  describe('computeBoost', () => {
    it('increases weight from baseline', () => {
      const result = computeBoost(BASELINE_WEIGHT);
      expect(result).toBeGreaterThan(BASELINE_WEIGHT);
    });

    it('applies 0.25 boost factor', () => {
      const result = computeBoost(BASELINE_WEIGHT);
      expect(result).toBe(1.25);
    });

    it('caps at BOOST_CAP', () => {
      const result = computeBoost(1.9);
      expect(result).toBeLessThanOrEqual(BOOST_CAP);
    });

    it('never exceeds 2.0', () => {
      let weight = BASELINE_WEIGHT;
      for (let i = 0; i < 50; i++) {
        weight = computeBoost(weight);
      }
      expect(weight).toBeLessThanOrEqual(BOOST_CAP);
    });
  });

  describe('decay and boost interaction', () => {
    it('boost followed by decay moves back toward baseline', () => {
      const boosted = computeBoost(BASELINE_WEIGHT);
      const decayed = computeDecay(boosted);
      // Should be less than boosted but more than a raw decay from baseline
      expect(decayed).toBeLessThan(boosted);
      expect(decayed).toBeGreaterThan(CONFIDENCE_FLOOR);
    });

    it('multiple decays followed by boost partially recovers', () => {
      let weight = BASELINE_WEIGHT;
      // 3 dismissals
      for (let i = 0; i < 3; i++) {
        weight = computeDecay(weight);
      }
      const afterDecay = weight;
      // 1 acceptance
      weight = computeBoost(weight);
      expect(weight).toBeGreaterThan(afterDecay);
    });
  });
});
