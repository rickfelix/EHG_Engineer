/**
 * Unit tests for Stage 05 - Profitability template
 * Part of SD-LEO-FEAT-TMPL-TRUTH-001
 *
 * Test Scenario TS-4: Stage 05 break-even handles non-profitable Year 1 (netProfitY1 <= 0)
 * Test Scenario TS-5: Kill gate boundary tests (ROI 0.49 vs 0.50, breakEvenMonth 24 vs 25)
 *
 * @module tests/unit/eva/stage-templates/stage-05.test
 */

import { describe, it, expect } from 'vitest';
import stage05, {
  evaluateKillGate,
  ROI_THRESHOLD,
  MAX_BREAKEVEN_MONTHS,
} from '../../../../lib/eva/stage-templates/stage-05.js';

describe('stage-05.js - Profitability template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage05.id).toBe('stage-05');
      expect(stage05.slug).toBe('profitability');
      expect(stage05.title).toBe('Profitability');
      expect(stage05.version).toBe('1.0.0');
    });

    it('should have correct thresholds', () => {
      expect(ROI_THRESHOLD).toBe(0.5);
      expect(MAX_BREAKEVEN_MONTHS).toBe(24);
    });

    it('should have defaultData', () => {
      expect(stage05.defaultData).toMatchObject({
        initialInvestment: null,
        year1: { revenue: 0, cogs: 0, opex: 0 },
        year2: { revenue: 0, cogs: 0, opex: 0 },
        year3: { revenue: 0, cogs: 0, opex: 0 },
      });
    });
  });

  describe('validate() - Financial inputs validation', () => {
    const validData = {
      initialInvestment: 100000,
      year1: { revenue: 150000, cogs: 50000, opex: 40000 },
      year2: { revenue: 300000, cogs: 100000, opex: 80000 },
      year3: { revenue: 500000, cogs: 150000, opex: 120000 },
    };

    it('should pass for valid data', () => {
      const result = stage05.validate(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for missing initialInvestment', () => {
      const data = { ...validData };
      delete data.initialInvestment;
      const result = stage05.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('initialInvestment');
      expect(result.errors[0]).toContain('is required');
    });

    it('should fail for initialInvestment <= 0', () => {
      const data = { ...validData, initialInvestment: 0 };
      const result = stage05.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('initialInvestment');
      expect(result.errors[0]).toContain('must be >= 0.01');
    });

    it('should pass for initialInvestment = 0.01 (minimum)', () => {
      const data = { ...validData, initialInvestment: 0.01 };
      const result = stage05.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should fail for missing year1 object', () => {
      const data = { ...validData };
      delete data.year1;
      const result = stage05.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('year1');
      expect(result.errors[0]).toContain('is required and must be an object');
    });

    it('should fail for year1 with missing revenue', () => {
      const data = {
        ...validData,
        year1: { cogs: 50000, opex: 40000 },
      };
      const result = stage05.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('year1.revenue');
      expect(result.errors[0]).toContain('is required');
    });

    it('should fail for negative revenue', () => {
      const data = {
        ...validData,
        year1: { revenue: -1000, cogs: 50000, opex: 40000 },
      };
      const result = stage05.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('year1.revenue');
      expect(result.errors[0]).toContain('must be >= 0');
    });

    it('should pass for zero revenue (valid business case)', () => {
      const data = {
        ...validData,
        year1: { revenue: 0, cogs: 0, opex: 40000 },
      };
      const result = stage05.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should fail for non-number cogs', () => {
      const data = {
        ...validData,
        year2: { revenue: 300000, cogs: '100000', opex: 80000 },
      };
      const result = stage05.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('year2.cogs');
      expect(result.errors[0]).toContain('must be a finite number');
    });

    it('should collect errors across all years', () => {
      const data = {
        initialInvestment: -100,
        year1: { revenue: -1000, cogs: 50000, opex: 40000 },
        year2: { revenue: 300000, cogs: -100, opex: 80000 },
        year3: { revenue: 500000, cogs: 150000, opex: -50 },
      };
      const result = stage05.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('computeDerived() - Financial calculations', () => {
    it('should compute gross and net profit correctly', () => {
      const data = {
        initialInvestment: 100000,
        year1: { revenue: 150000, cogs: 50000, opex: 40000 },
        year2: { revenue: 300000, cogs: 100000, opex: 80000 },
        year3: { revenue: 500000, cogs: 150000, opex: 120000 },
      };
      const result = stage05.computeDerived(data);

      expect(result.grossProfitY1).toBe(100000); // 150k - 50k
      expect(result.grossProfitY2).toBe(200000); // 300k - 100k
      expect(result.grossProfitY3).toBe(350000); // 500k - 150k

      expect(result.netProfitY1).toBe(60000); // 100k - 40k
      expect(result.netProfitY2).toBe(120000); // 200k - 80k
      expect(result.netProfitY3).toBe(230000); // 350k - 120k
    });

    it('should compute ROI correctly', () => {
      const data = {
        initialInvestment: 100000,
        year1: { revenue: 150000, cogs: 50000, opex: 40000 },
        year2: { revenue: 300000, cogs: 100000, opex: 80000 },
        year3: { revenue: 500000, cogs: 150000, opex: 120000 },
      };
      const result = stage05.computeDerived(data);
      // Total net profit: 60k + 120k + 230k = 410k
      // ROI: (410k - 100k) / 100k = 3.1
      expect(result.roi3y).toBeCloseTo(3.1, 2);
    });

    it('should compute break-even month correctly', () => {
      const data = {
        initialInvestment: 120000,
        year1: { revenue: 150000, cogs: 50000, opex: 40000 },
        year2: { revenue: 300000, cogs: 100000, opex: 80000 },
        year3: { revenue: 500000, cogs: 150000, opex: 120000 },
      };
      const result = stage05.computeDerived(data);
      // Net profit Y1: 60000
      // Monthly: 5000
      // Break-even: 120000 / 5000 = 24 months
      expect(result.breakEvenMonth).toBe(24);
    });

    it('should round up break-even month (Math.ceil)', () => {
      const data = {
        initialInvestment: 100000,
        year1: { revenue: 150000, cogs: 50000, opex: 40000 },
        year2: { revenue: 300000, cogs: 100000, opex: 80000 },
        year3: { revenue: 500000, cogs: 150000, opex: 120000 },
      };
      const result = stage05.computeDerived(data);
      // Net profit Y1: 60000
      // Monthly: 5000
      // Break-even: 100000 / 5000 = 20 months (exact)
      expect(result.breakEvenMonth).toBe(20);
    });

    it('should round up partial months', () => {
      const data = {
        initialInvestment: 110000,
        year1: { revenue: 150000, cogs: 50000, opex: 40000 },
        year2: { revenue: 300000, cogs: 100000, opex: 80000 },
        year3: { revenue: 500000, cogs: 150000, opex: 120000 },
      };
      const result = stage05.computeDerived(data);
      // Net profit Y1: 60000
      // Monthly: 5000
      // Break-even: 110000 / 5000 = 22 months (rounds up from 22.0)
      expect(result.breakEvenMonth).toBe(22);
    });
  });

  describe('computeDerived() - TS-4: Non-profitable Year 1 handling', () => {
    it('should return null breakEvenMonth when netProfitY1 is zero', () => {
      const data = {
        initialInvestment: 100000,
        year1: { revenue: 100000, cogs: 50000, opex: 50000 },
        year2: { revenue: 300000, cogs: 100000, opex: 80000 },
        year3: { revenue: 500000, cogs: 150000, opex: 120000 },
      };
      const result = stage05.computeDerived(data);
      expect(result.netProfitY1).toBe(0);
      expect(result.breakEvenMonth).toBeNull();
    });

    it('should return null breakEvenMonth when netProfitY1 is negative', () => {
      const data = {
        initialInvestment: 100000,
        year1: { revenue: 100000, cogs: 50000, opex: 60000 },
        year2: { revenue: 300000, cogs: 100000, opex: 80000 },
        year3: { revenue: 500000, cogs: 150000, opex: 120000 },
      };
      const result = stage05.computeDerived(data);
      expect(result.netProfitY1).toBe(-10000);
      expect(result.breakEvenMonth).toBeNull();
    });

    it('should compute breakEvenMonth when netProfitY1 is positive', () => {
      const data = {
        initialInvestment: 100000,
        year1: { revenue: 150000, cogs: 50000, opex: 40000 },
        year2: { revenue: 300000, cogs: 100000, opex: 80000 },
        year3: { revenue: 500000, cogs: 150000, opex: 120000 },
      };
      const result = stage05.computeDerived(data);
      expect(result.netProfitY1).toBe(60000);
      expect(result.breakEvenMonth).toBe(20);
    });
  });

  describe('evaluateKillGate() - Kill gate logic', () => {
    it('should pass when ROI >= 0.5 and breakEvenMonth <= 24', () => {
      const result = evaluateKillGate({
        roi3y: 0.6,
        breakEvenMonth: 20,
      });
      expect(result.decision).toBe('pass');
      expect(result.blockProgression).toBe(false);
      expect(result.reasons).toEqual([]);
    });

    it('should pass at exact threshold boundaries (ROI 0.5, breakEven 24)', () => {
      const result = evaluateKillGate({
        roi3y: 0.5,
        breakEvenMonth: 24,
      });
      expect(result.decision).toBe('pass');
      expect(result.blockProgression).toBe(false);
      expect(result.reasons).toEqual([]);
    });

    it('should kill when ROI is 0.49 (just below threshold)', () => {
      const result = evaluateKillGate({
        roi3y: 0.49,
        breakEvenMonth: 20,
      });
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0].type).toBe('roi_below_threshold');
      expect(result.reasons[0].actual).toBe(0.49);
      expect(result.reasons[0].threshold).toBe(0.5);
    });

    it('should kill when breakEvenMonth is 25 (just above threshold)', () => {
      const result = evaluateKillGate({
        roi3y: 0.6,
        breakEvenMonth: 25,
      });
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0].type).toBe('break_even_too_late');
      expect(result.reasons[0].actual).toBe(25);
      expect(result.reasons[0].threshold).toBe(24);
    });

    it('should kill when breakEvenMonth is null (non-profitable Y1)', () => {
      const result = evaluateKillGate({
        roi3y: 0.6,
        breakEvenMonth: null,
      });
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0].type).toBe('no_break_even_year1');
      expect(result.reasons[0].message).toContain('Year 1 net profit is non-positive');
    });

    it('should kill with multiple reasons when both ROI and breakEven fail', () => {
      const result = evaluateKillGate({
        roi3y: 0.49,
        breakEvenMonth: 25,
      });
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons).toHaveLength(2);
      expect(result.reasons.some(r => r.type === 'break_even_too_late')).toBe(true);
      expect(result.reasons.some(r => r.type === 'roi_below_threshold')).toBe(true);
    });

    it('should kill when all criteria fail', () => {
      const result = evaluateKillGate({
        roi3y: 0.3,
        breakEvenMonth: null,
      });
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons.length).toBeGreaterThanOrEqual(2);
    });

    it('should provide detailed reason messages', () => {
      const result = evaluateKillGate({
        roi3y: 0.4,
        breakEvenMonth: 30,
      });
      expect(result.reasons[0].message).toContain('Break-even at month 30 exceeds maximum 24 months');
      expect(result.reasons[1].message).toContain('3-year ROI of 40.0% is below threshold 50%');
    });

    it('should be pure (no side effects)', () => {
      const input = { roi3y: 0.6, breakEvenMonth: 20 };
      const original = { ...input };
      evaluateKillGate(input);
      expect(input).toEqual(original);
    });
  });

  describe('Integration: validate + computeDerived + kill gate', () => {
    it('should work together for passing scenario', () => {
      const data = {
        initialInvestment: 100000,
        year1: { revenue: 150000, cogs: 50000, opex: 40000 },
        year2: { revenue: 300000, cogs: 100000, opex: 80000 },
        year3: { revenue: 500000, cogs: 150000, opex: 120000 },
      };
      const validation = stage05.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage05.computeDerived(data);
      expect(computed.decision).toBe('pass');
      expect(computed.blockProgression).toBe(false);
      expect(computed.roi3y).toBeGreaterThan(0.5);
      expect(computed.breakEvenMonth).toBeLessThanOrEqual(24);
    });

    it('should work together for kill scenario (low ROI)', () => {
      const data = {
        initialInvestment: 500000,
        year1: { revenue: 150000, cogs: 100000, opex: 40000 },
        year2: { revenue: 180000, cogs: 120000, opex: 50000 },
        year3: { revenue: 200000, cogs: 130000, opex: 60000 },
      };
      const validation = stage05.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage05.computeDerived(data);
      expect(computed.decision).toBe('kill');
      expect(computed.blockProgression).toBe(true);
      expect(computed.roi3y).toBeLessThan(0.5);
    });

    it('should work together for kill scenario (non-profitable Y1)', () => {
      const data = {
        initialInvestment: 100000,
        year1: { revenue: 50000, cogs: 30000, opex: 30000 },
        year2: { revenue: 300000, cogs: 100000, opex: 80000 },
        year3: { revenue: 500000, cogs: 150000, opex: 120000 },
      };
      const validation = stage05.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage05.computeDerived(data);
      expect(computed.decision).toBe('kill');
      expect(computed.blockProgression).toBe(true);
      expect(computed.netProfitY1).toBeLessThanOrEqual(0);
      expect(computed.breakEvenMonth).toBeNull();
    });

    it('should preserve original input fields in computed output', () => {
      const data = {
        initialInvestment: 100000,
        year1: { revenue: 150000, cogs: 50000, opex: 40000 },
        year2: { revenue: 300000, cogs: 100000, opex: 80000 },
        year3: { revenue: 500000, cogs: 150000, opex: 120000 },
      };
      const computed = stage05.computeDerived(data);
      expect(computed.initialInvestment).toBe(100000);
      expect(computed.year1).toEqual(data.year1);
      expect(computed.year2).toEqual(data.year2);
      expect(computed.year3).toEqual(data.year3);
    });
  });
});
