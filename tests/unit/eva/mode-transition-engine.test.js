import { describe, it, expect } from 'vitest';
import { evaluateTransition, TRANSITION_THRESHOLDS } from '../../../lib/eva/operations/mode-transition-engine.js';

describe('ModeTransitionEngine', () => {
  describe('TRANSITION_THRESHOLDS', () => {
    it('defines 7 transition paths', () => {
      expect(Object.keys(TRANSITION_THRESHOLDS)).toHaveLength(7);
    });
  });

  describe('operations → growth', () => {
    it('qualifies when all thresholds met', () => {
      const result = evaluateTransition('operations', {
        mom_growth_pct: 25,
        consecutive_growth_months: 4,
        customer_count: 150,
        churn_pct: 3,
      });
      expect(result.eligible).toBe(true);
      expect(result.targetMode).toBe('growth');
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it('rejects when growth insufficient', () => {
      const result = evaluateTransition('operations', {
        mom_growth_pct: 10, // below 20%
        consecutive_growth_months: 4,
        customer_count: 150,
        churn_pct: 3,
      });
      expect(result.eligible).toBe(false);
    });

    it('rejects when churn too high', () => {
      const result = evaluateTransition('operations', {
        mom_growth_pct: 25,
        consecutive_growth_months: 4,
        customer_count: 150,
        churn_pct: 8, // above 5%
      });
      expect(result.eligible).toBe(false);
    });

    it('rejects when customers insufficient', () => {
      const result = evaluateTransition('operations', {
        mom_growth_pct: 25,
        consecutive_growth_months: 4,
        customer_count: 50, // below 100
        churn_pct: 3,
      });
      expect(result.eligible).toBe(false);
    });
  });

  describe('growth → scaling', () => {
    it('qualifies when ARR, LTV:CAC, and duration met', () => {
      const result = evaluateTransition('growth', {
        arr: 120000,
        ltv_cac_ratio: 3.5,
        min_months_sustained: 7,
      });
      expect(result.eligible).toBe(true);
      expect(result.targetMode).toBe('scaling');
    });

    it('rejects when ARR too low', () => {
      const result = evaluateTransition('growth', {
        arr: 50000,
        ltv_cac_ratio: 3.5,
      });
      expect(result.eligible).toBe(false);
    });
  });

  describe('scaling → exit_prep', () => {
    it('qualifies when exit readiness sustained', () => {
      const result = evaluateTransition('scaling', {
        exit_readiness_score: 75,
        quarters_above_exit_threshold: 3,
      });
      expect(result.eligible).toBe(true);
      expect(result.targetMode).toBe('exit_prep');
    });

    it('rejects when score below threshold', () => {
      const result = evaluateTransition('scaling', {
        exit_readiness_score: 60,
        quarters_above_exit_threshold: 3,
      });
      expect(result.eligible).toBe(false);
    });
  });

  describe('chairman-only transitions', () => {
    it('does not auto-qualify exit_prep→divesting', () => {
      const result = evaluateTransition('exit_prep', {});
      expect(result.eligible).toBe(false);
    });

    it('does not auto-qualify any→parked', () => {
      const result = evaluateTransition('operations', {});
      expect(result.eligible).toBe(false);
    });
  });

  describe('no valid transition', () => {
    it('returns not eligible for unknown mode', () => {
      const result = evaluateTransition('sold', {});
      expect(result.eligible).toBe(false);
      expect(result.targetMode).toBeNull();
    });

    it('handles missing metrics gracefully', () => {
      const result = evaluateTransition('operations', {});
      expect(result.eligible).toBe(false);
    });
  });
});
