/**
 * Unit tests for Stage 05 - Profitability Kill Gate template (v2.0.0)
 * Phase: THE TRUTH (Stages 1-5)
 * Part of SD-EVA-FEAT-TEMPLATES-TRUTH-001
 *
 * Tests: banded ROI gate (pass/conditional_pass/kill), unit economics validation,
 *        supplementary metrics for conditional pass, remediationRoute
 *
 * @module tests/unit/eva/stage-templates/stage-05.test
 */

import { describe, it, expect } from 'vitest';
import stage05, {
  evaluateKillGate,
  ROI_PASS_THRESHOLD,
  ROI_CONDITIONAL_THRESHOLD,
  MAX_BREAKEVEN_MONTHS,
  LTV_CAC_THRESHOLD,
  PAYBACK_THRESHOLD,
  CONDITIONAL_LTV_CAC_THRESHOLD,
  CONDITIONAL_PAYBACK_THRESHOLD,
  ROBUSTNESS_LEVELS,
} from '../../../../lib/eva/stage-templates/stage-05.js';

describe('stage-05.js - Profitability Kill Gate template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage05.id).toBe('stage-05');
      expect(stage05.slug).toBe('profitability');
      expect(stage05.title).toBe('Kill Gate (Financial)');
      expect(stage05.version).toBe('2.0.0');
    });

    it('should have correct banded thresholds', () => {
      expect(ROI_PASS_THRESHOLD).toBe(0.25);
      expect(ROI_CONDITIONAL_THRESHOLD).toBe(0.15);
      expect(MAX_BREAKEVEN_MONTHS).toBe(24);
      expect(LTV_CAC_THRESHOLD).toBe(2);
      expect(PAYBACK_THRESHOLD).toBe(18);
      expect(CONDITIONAL_LTV_CAC_THRESHOLD).toBe(3);
      expect(CONDITIONAL_PAYBACK_THRESHOLD).toBe(12);
    });

    it('should export ROBUSTNESS_LEVELS', () => {
      expect(ROBUSTNESS_LEVELS).toEqual(['fragile', 'normal', 'resilient']);
    });

    it('should have defaultData with unitEconomics', () => {
      expect(stage05.defaultData.unitEconomics).toBeDefined();
      expect(stage05.defaultData.unitEconomics.cac).toBe(0);
      expect(stage05.defaultData.unitEconomics.ltv).toBe(0);
      expect(stage05.defaultData.scenarioAnalysis).toBeNull();
      expect(stage05.defaultData.remediationRoute).toBeNull();
    });
  });

  const makeValidData = (overrides = {}) => ({
    initialInvestment: 100000,
    year1: { revenue: 150000, cogs: 50000, opex: 40000 },
    year2: { revenue: 300000, cogs: 100000, opex: 80000 },
    year3: { revenue: 500000, cogs: 150000, opex: 120000 },
    unitEconomics: {
      cac: 100, ltv: 500, churnRate: 0.05, paybackMonths: 6, grossMargin: 0.7,
    },
    ...overrides,
  });

  describe('validate() - Financial inputs', () => {
    it('should pass for valid data', () => {
      const result = stage05.validate(makeValidData());
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for missing initialInvestment', () => {
      const data = makeValidData();
      delete data.initialInvestment;
      const result = stage05.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('initialInvestment');
    });

    it('should fail for initialInvestment <= 0', () => {
      const result = stage05.validate(makeValidData({ initialInvestment: 0 }));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('initialInvestment');
    });

    it('should pass for initialInvestment = 0.01 (minimum)', () => {
      const result = stage05.validate(makeValidData({ initialInvestment: 0.01 }));
      expect(result.valid).toBe(true);
    });

    it('should fail for missing year1', () => {
      const data = makeValidData();
      delete data.year1;
      const result = stage05.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('year1');
    });

    it('should fail for negative revenue', () => {
      const result = stage05.validate(makeValidData({
        year1: { revenue: -1000, cogs: 50000, opex: 40000 },
      }));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('year1.revenue');
    });
  });

  describe('validate() - Unit economics', () => {
    it('should fail for missing unitEconomics', () => {
      const data = makeValidData();
      delete data.unitEconomics;
      const result = stage05.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('unitEconomics');
    });

    it('should fail for churnRate > 1', () => {
      const result = stage05.validate(makeValidData({
        unitEconomics: { cac: 100, ltv: 500, churnRate: 1.5, paybackMonths: 6, grossMargin: 0.7 },
      }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('churnRate'))).toBe(true);
    });

    it('should fail for churnRate < 0', () => {
      const result = stage05.validate(makeValidData({
        unitEconomics: { cac: 100, ltv: 500, churnRate: -0.1, paybackMonths: 6, grossMargin: 0.7 },
      }));
      expect(result.valid).toBe(false);
    });

    it('should fail for grossMargin > 1', () => {
      const result = stage05.validate(makeValidData({
        unitEconomics: { cac: 100, ltv: 500, churnRate: 0.05, paybackMonths: 6, grossMargin: 1.5 },
      }));
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('grossMargin'))).toBe(true);
    });

    it('should pass for boundary values (churnRate 0, grossMargin 1)', () => {
      const result = stage05.validate(makeValidData({
        unitEconomics: { cac: 100, ltv: 500, churnRate: 0, paybackMonths: 6, grossMargin: 1 },
      }));
      expect(result.valid).toBe(true);
    });
  });

  describe('computeDerived() - Financial calculations', () => {
    it('should compute gross and net profit correctly', () => {
      const result = stage05.computeDerived(makeValidData());
      expect(result.grossProfitY1).toBe(100000);
      expect(result.grossProfitY2).toBe(200000);
      expect(result.grossProfitY3).toBe(350000);
      expect(result.netProfitY1).toBe(60000);
      expect(result.netProfitY2).toBe(120000);
      expect(result.netProfitY3).toBe(230000);
    });

    it('should compute ROI correctly', () => {
      const result = stage05.computeDerived(makeValidData());
      // Total net: 60k + 120k + 230k = 410k. ROI: (410k - 100k) / 100k = 3.1
      expect(result.roi3y).toBeCloseTo(3.1, 2);
    });

    it('should compute break-even month correctly', () => {
      const result = stage05.computeDerived(makeValidData({ initialInvestment: 120000 }));
      // Monthly net: 60000/12 = 5000. Break-even: 120000/5000 = 24
      expect(result.breakEvenMonth).toBe(24);
    });

    it('should compute ltvCacRatio', () => {
      const result = stage05.computeDerived(makeValidData());
      // ltv=500, cac=100 → ratio=5
      expect(result.unitEconomics.ltvCacRatio).toBe(5);
    });

    it('should return null ltvCacRatio when cac is 0', () => {
      const result = stage05.computeDerived(makeValidData({
        unitEconomics: { cac: 0, ltv: 500, churnRate: 0.05, paybackMonths: 6, grossMargin: 0.7 },
      }));
      expect(result.unitEconomics.ltvCacRatio).toBeNull();
    });
  });

  describe('computeDerived() - Non-profitable Y1', () => {
    it('should return null breakEvenMonth when netProfitY1 is zero', () => {
      const data = makeValidData({
        year1: { revenue: 100000, cogs: 50000, opex: 50000 },
      });
      const result = stage05.computeDerived(data);
      expect(result.netProfitY1).toBe(0);
      expect(result.breakEvenMonth).toBeNull();
    });

    it('should return null breakEvenMonth when netProfitY1 is negative', () => {
      const data = makeValidData({
        year1: { revenue: 50000, cogs: 30000, opex: 30000 },
      });
      const result = stage05.computeDerived(data);
      expect(result.netProfitY1).toBe(-10000);
      expect(result.breakEvenMonth).toBeNull();
    });
  });

  describe('evaluateKillGate() - Banded ROI gate', () => {
    it('should pass when ROI >= 0.25, breakEven <= 24, ltvCac >= 2, payback <= 18', () => {
      const result = evaluateKillGate({
        roi3y: 0.30, breakEvenMonth: 20, ltvCacRatio: 3, paybackMonths: 12,
      });
      expect(result.decision).toBe('pass');
      expect(result.blockProgression).toBe(false);
      expect(result.reasons).toEqual([]);
      expect(result.remediationRoute).toBeNull();
    });

    it('should pass at exact thresholds (0.25 ROI, 24 months, 2 ltvCac, 18 payback)', () => {
      const result = evaluateKillGate({
        roi3y: 0.25, breakEvenMonth: 24, ltvCacRatio: 2, paybackMonths: 18,
      });
      expect(result.decision).toBe('pass');
    });

    it('should conditional_pass when 0.15 <= ROI < 0.25 with strong supplementary', () => {
      const result = evaluateKillGate({
        roi3y: 0.20, breakEvenMonth: 20, ltvCacRatio: 3, paybackMonths: 12,
      });
      expect(result.decision).toBe('conditional_pass');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons[0].type).toBe('roi_in_conditional_band');
    });

    it('should kill when ROI in conditional band but supplementary metrics weak', () => {
      const result = evaluateKillGate({
        roi3y: 0.20, breakEvenMonth: 20, ltvCacRatio: 2, paybackMonths: 15,
      });
      expect(result.decision).toBe('kill');
      expect(result.reasons[0].type).toBe('roi_conditional_supplementary_fail');
      expect(result.remediationRoute).toContain('unit economics');
    });

    it('should kill when ROI < 0.15', () => {
      const result = evaluateKillGate({
        roi3y: 0.14, breakEvenMonth: 20, ltvCacRatio: 5, paybackMonths: 6,
      });
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons[0].type).toBe('roi_below_kill_threshold');
    });

    it('should kill when breakEvenMonth > 24', () => {
      const result = evaluateKillGate({
        roi3y: 0.30, breakEvenMonth: 25, ltvCacRatio: 3, paybackMonths: 12,
      });
      expect(result.decision).toBe('kill');
      expect(result.reasons[0].type).toBe('break_even_too_late');
    });

    it('should kill when breakEvenMonth is null', () => {
      const result = evaluateKillGate({
        roi3y: 0.30, breakEvenMonth: null, ltvCacRatio: 3, paybackMonths: 12,
      });
      expect(result.decision).toBe('kill');
      expect(result.reasons[0].type).toBe('no_break_even_year1');
    });

    it('should kill when ROI passes but ltvCacRatio < 2', () => {
      const result = evaluateKillGate({
        roi3y: 0.30, breakEvenMonth: 20, ltvCacRatio: 1.5, paybackMonths: 12,
      });
      expect(result.decision).toBe('kill');
      expect(result.reasons[0].type).toBe('ltv_cac_below_threshold');
    });

    it('should kill when ROI passes but paybackMonths > 18', () => {
      const result = evaluateKillGate({
        roi3y: 0.30, breakEvenMonth: 20, ltvCacRatio: 3, paybackMonths: 19,
      });
      expect(result.decision).toBe('kill');
      expect(result.reasons[0].type).toBe('payback_too_long');
    });

    it('should include remediationRoute for kills', () => {
      const result = evaluateKillGate({
        roi3y: -0.1, breakEvenMonth: null, ltvCacRatio: 1, paybackMonths: 24,
      });
      expect(result.decision).toBe('kill');
      expect(result.remediationRoute).toBeDefined();
      expect(result.remediationRoute).toContain('Stage 1');
    });

    it('should be pure (no side effects)', () => {
      const input = { roi3y: 0.30, breakEvenMonth: 20, ltvCacRatio: 3, paybackMonths: 12 };
      const original = { ...input };
      evaluateKillGate(input);
      expect(input).toEqual(original);
    });
  });

  describe('Integration: validate + computeDerived + kill gate', () => {
    it('should work together for passing scenario', () => {
      const data = makeValidData();
      const validation = stage05.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage05.computeDerived(data);
      expect(computed.decision).toBe('pass');
      expect(computed.blockProgression).toBe(false);
      expect(computed.roi3y).toBeGreaterThan(ROI_PASS_THRESHOLD);
      expect(computed.unitEconomics.ltvCacRatio).toBeGreaterThanOrEqual(LTV_CAC_THRESHOLD);
    });

    it('should work together for kill scenario (non-profitable Y1)', () => {
      const data = makeValidData({
        year1: { revenue: 50000, cogs: 30000, opex: 30000 },
      });
      const validation = stage05.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage05.computeDerived(data);
      expect(computed.decision).toBe('kill');
      expect(computed.breakEvenMonth).toBeNull();
    });

    it('should preserve original input fields', () => {
      const data = makeValidData();
      const computed = stage05.computeDerived(data);
      expect(computed.initialInvestment).toBe(100000);
      expect(computed.year1).toEqual(data.year1);
      expect(computed.unitEconomics.cac).toBe(100);
    });

    it('should not mutate original data', () => {
      const data = makeValidData();
      const original = JSON.parse(JSON.stringify(data));
      stage05.computeDerived(data);
      expect(data).toEqual(original);
    });
  });
});
