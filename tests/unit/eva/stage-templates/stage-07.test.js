/**
 * Unit tests for Stage 07 - Pricing template
 * Part of SD-LEO-FEAT-TMPL-ENGINE-001
 *
 * Test Scenario TS-2: Stage 07 churn=0 triggers null LTV with warning
 *
 * @module tests/unit/eva/stage-templates/stage-07.test
 */

import { describe, it, expect } from 'vitest';
import stage07, { BILLING_PERIODS } from '../../../../lib/eva/stage-templates/stage-07.js';

describe('stage-07.js - Pricing template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage07.id).toBe('stage-07');
      expect(stage07.slug).toBe('pricing');
      expect(stage07.title).toBe('Pricing');
      expect(stage07.version).toBe('2.0.0');
    });

    it('should export BILLING_PERIODS', () => {
      expect(BILLING_PERIODS).toEqual(['monthly', 'quarterly', 'annual']);
    });

    it('should have defaultData', () => {
      expect(stage07.defaultData).toMatchObject({
        currency: 'USD',
        tiers: [],
        gross_margin_pct: null,
        churn_rate_monthly: null,
        cac: null,
        arpa: null,
        ltv: null,
        cac_ltv_ratio: null,
        payback_months: null,
        warnings: [],
      });
    });

    it('should have validate function', () => {
      expect(typeof stage07.validate).toBe('function');
    });

    it('should have computeDerived function', () => {
      expect(typeof stage07.computeDerived).toBe('function');
    });
  });

  describe('validate() - Pricing inputs validation', () => {
    const validTier = {
      name: 'Starter',
      price: 29,
      billing_period: 'monthly',
      included_units: '10 users',
      target_segment: 'SMB',
    };

    const validData = {
      currency: 'USD',
      pricing_model: 'subscription',
      tiers: [validTier],
      gross_margin_pct: 70,
      churn_rate_monthly: 5,
      cac: 100,
      arpa: 50,
    };

    it('should pass for valid data', () => {
      const result = stage07.validate(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for missing currency', () => {
      const data = { ...validData };
      delete data.currency;
      const result = stage07.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('currency');
      expect(result.errors[0]).toContain('is required');
    });

    it('should fail for empty tiers array', () => {
      const data = { ...validData, tiers: [] };
      const result = stage07.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('tiers');
      expect(result.errors[0]).toContain('must have at least 1 item(s)');
    });

    it('should fail for tier with missing name', () => {
      const data = {
        ...validData,
        tiers: [{ ...validTier }],
      };
      delete data.tiers[0].name;
      const result = stage07.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('tiers[0].name');
      expect(result.errors[0]).toContain('is required');
    });

    it('should fail for tier with negative price', () => {
      const data = {
        ...validData,
        tiers: [{ ...validTier, price: -10 }],
      };
      const result = stage07.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('tiers[0].price');
      expect(result.errors[0]).toContain('must be >= 0');
    });

    it('should pass for tier with price = 0 (free tier)', () => {
      const data = {
        ...validData,
        tiers: [{ ...validTier, price: 0 }],
      };
      const result = stage07.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should fail for tier with invalid billing_period', () => {
      const data = {
        ...validData,
        tiers: [{ ...validTier, billing_period: 'weekly' }],
      };
      const result = stage07.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('tiers[0].billing_period');
      expect(result.errors[0]).toContain('must be one of');
    });

    it('should pass for all valid billing periods', () => {
      for (const period of BILLING_PERIODS) {
        const data = {
          ...validData,
          tiers: [{ ...validTier, billing_period: period }],
        };
        const result = stage07.validate(data);
        expect(result.valid).toBe(true);
      }
    });

    it('should fail for missing gross_margin_pct', () => {
      const data = { ...validData };
      delete data.gross_margin_pct;
      const result = stage07.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('gross_margin_pct');
    });

    it('should fail for gross_margin_pct > 100', () => {
      const data = { ...validData, gross_margin_pct: 120 };
      const result = stage07.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('gross_margin_pct');
      expect(result.errors[0]).toContain('must be <= 100');
    });

    it('should pass for gross_margin_pct = 100', () => {
      const data = { ...validData, gross_margin_pct: 100 };
      const result = stage07.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should fail for churn_rate_monthly > 100', () => {
      const data = { ...validData, churn_rate_monthly: 150 };
      const result = stage07.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('churn_rate_monthly');
      expect(result.errors[0]).toContain('must be <= 100');
    });

    it('should fail for negative cac', () => {
      const data = { ...validData, cac: -50 };
      const result = stage07.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('cac');
      expect(result.errors[0]).toContain('must be >= 0');
    });

    it('should fail for negative arpa', () => {
      const data = { ...validData, arpa: -100 };
      const result = stage07.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('arpa');
      expect(result.errors[0]).toContain('must be >= 0');
    });

    it('should collect multiple validation errors across tiers', () => {
      const data = {
        ...validData,
        tiers: [
          { ...validTier, price: -10 },
          { ...validTier, name: 'Pro', billing_period: 'invalid' },
        ],
        gross_margin_pct: 120,
      };
      const result = stage07.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('computeDerived() - Unit economics formulas', () => {
    it('should compute LTV = (ARPA * margin%) / churn_decimal', () => {
      const data = {
        currency: 'USD',
        tiers: [{ name: 'Pro', price: 99, billing_period: 'monthly', target_segment: 'SMB' }],
        gross_margin_pct: 70,
        churn_rate_monthly: 5, // 0.05 decimal
        cac: 200,
        arpa: 100,
      };
      const result = stage07.computeDerived(data);
      // LTV = (100 * 0.70) / 0.05 = 70 / 0.05 = 1400
      expect(result.ltv).toBeCloseTo(1400, 2);
    });

    it('should compute CAC:LTV ratio = CAC / LTV', () => {
      const data = {
        currency: 'USD',
        tiers: [{ name: 'Pro', price: 99, billing_period: 'monthly', target_segment: 'SMB' }],
        gross_margin_pct: 70,
        churn_rate_monthly: 5,
        cac: 200,
        arpa: 100,
      };
      const result = stage07.computeDerived(data);
      // LTV = 1400, CAC:LTV = 200 / 1400 = 0.142857
      expect(result.ltv).toBeCloseTo(1400, 2);
      expect(result.cac_ltv_ratio).toBeCloseTo(0.142857, 5);
    });

    it('should compute payback_months = CAC / (ARPA * margin%)', () => {
      const data = {
        currency: 'USD',
        tiers: [{ name: 'Pro', price: 99, billing_period: 'monthly', target_segment: 'SMB' }],
        gross_margin_pct: 70,
        churn_rate_monthly: 5,
        cac: 200,
        arpa: 100,
      };
      const result = stage07.computeDerived(data);
      // Payback = 200 / (100 * 0.70) = 200 / 70 = 2.857 months
      expect(result.payback_months).toBeCloseTo(2.857, 2);
    });
  });

  describe('computeDerived() - TS-2: Zero churn edge case', () => {
    it('should return null LTV when churn_rate_monthly is 0', () => {
      const data = {
        currency: 'USD',
        tiers: [{ name: 'Pro', price: 99, billing_period: 'monthly', target_segment: 'SMB' }],
        gross_margin_pct: 70,
        churn_rate_monthly: 0, // Zero churn
        cac: 200,
        arpa: 100,
      };
      const result = stage07.computeDerived(data);
      expect(result.ltv).toBeNull();
    });

    it('should return null cac_ltv_ratio when churn is 0', () => {
      const data = {
        currency: 'USD',
        tiers: [{ name: 'Pro', price: 99, billing_period: 'monthly', target_segment: 'SMB' }],
        gross_margin_pct: 70,
        churn_rate_monthly: 0,
        cac: 200,
        arpa: 100,
      };
      const result = stage07.computeDerived(data);
      expect(result.cac_ltv_ratio).toBeNull();
    });

    it('should still compute payback_months when churn is 0', () => {
      const data = {
        currency: 'USD',
        tiers: [{ name: 'Pro', price: 99, billing_period: 'monthly', target_segment: 'SMB' }],
        gross_margin_pct: 70,
        churn_rate_monthly: 0,
        cac: 200,
        arpa: 100,
      };
      const result = stage07.computeDerived(data);
      expect(result.payback_months).toBeCloseTo(2.857, 2);
    });

    it('should add churn_zero warning when churn is 0', () => {
      const data = {
        currency: 'USD',
        tiers: [{ name: 'Pro', price: 99, billing_period: 'monthly', target_segment: 'SMB' }],
        gross_margin_pct: 70,
        churn_rate_monthly: 0,
        cac: 200,
        arpa: 100,
      };
      const result = stage07.computeDerived(data);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('churn_zero');
      expect(result.warnings[0].message).toContain('Monthly churn rate is 0%');
      expect(result.warnings[0].message).toContain('LTV cannot be calculated');
    });
  });

  describe('computeDerived() - High churn warning', () => {
    it('should add high_churn warning when churn > 30%', () => {
      const data = {
        currency: 'USD',
        tiers: [{ name: 'Pro', price: 99, billing_period: 'monthly', target_segment: 'SMB' }],
        gross_margin_pct: 70,
        churn_rate_monthly: 35,
        cac: 200,
        arpa: 100,
      };
      const result = stage07.computeDerived(data);
      const highChurnWarning = result.warnings.find(w => w.type === 'high_churn');
      expect(highChurnWarning).toBeDefined();
      expect(highChurnWarning.message).toContain('35%');
      expect(highChurnWarning.message).toContain('unusually high');
    });

    it('should not add high_churn warning when churn = 30%', () => {
      const data = {
        currency: 'USD',
        tiers: [{ name: 'Pro', price: 99, billing_period: 'monthly', target_segment: 'SMB' }],
        gross_margin_pct: 70,
        churn_rate_monthly: 30,
        cac: 200,
        arpa: 100,
      };
      const result = stage07.computeDerived(data);
      const highChurnWarning = result.warnings.find(w => w.type === 'high_churn');
      expect(highChurnWarning).toBeUndefined();
    });

    it('should not add high_churn warning when churn < 30%', () => {
      const data = {
        currency: 'USD',
        tiers: [{ name: 'Pro', price: 99, billing_period: 'monthly', target_segment: 'SMB' }],
        gross_margin_pct: 70,
        churn_rate_monthly: 5,
        cac: 200,
        arpa: 100,
      };
      const result = stage07.computeDerived(data);
      const highChurnWarning = result.warnings.find(w => w.type === 'high_churn');
      expect(highChurnWarning).toBeUndefined();
    });
  });

  describe('computeDerived() - Zero gross profit edge case', () => {
    it('should return null payback_months when ARPA is 0', () => {
      const data = {
        currency: 'USD',
        tiers: [{ name: 'Free', price: 0, billing_period: 'monthly', target_segment: 'Freemium' }],
        gross_margin_pct: 70,
        churn_rate_monthly: 5,
        cac: 200,
        arpa: 0,
      };
      const result = stage07.computeDerived(data);
      expect(result.payback_months).toBeNull();
    });

    it('should return null payback_months when gross_margin_pct is 0', () => {
      const data = {
        currency: 'USD',
        tiers: [{ name: 'Pro', price: 99, billing_period: 'monthly', target_segment: 'SMB' }],
        gross_margin_pct: 0,
        churn_rate_monthly: 5,
        cac: 200,
        arpa: 100,
      };
      const result = stage07.computeDerived(data);
      expect(result.payback_months).toBeNull();
    });

    it('should add zero_gross_profit warning when monthly gross profit is 0', () => {
      const data = {
        currency: 'USD',
        tiers: [{ name: 'Free', price: 0, billing_period: 'monthly', target_segment: 'Freemium' }],
        gross_margin_pct: 70,
        churn_rate_monthly: 5,
        cac: 200,
        arpa: 0,
      };
      const result = stage07.computeDerived(data);
      const warning = result.warnings.find(w => w.type === 'zero_gross_profit');
      expect(warning).toBeDefined();
      expect(warning.message).toContain('Monthly gross profit is $0');
    });

    it('should not add zero_gross_profit warning when churn is 0', () => {
      const data = {
        currency: 'USD',
        tiers: [{ name: 'Free', price: 0, billing_period: 'monthly', target_segment: 'Freemium' }],
        gross_margin_pct: 70,
        churn_rate_monthly: 0, // Churn zero takes precedence
        cac: 200,
        arpa: 0,
      };
      const result = stage07.computeDerived(data);
      const warning = result.warnings.find(w => w.type === 'zero_gross_profit');
      expect(warning).toBeUndefined();
    });
  });

  describe('computeDerived() - Preserve input fields', () => {
    it('should preserve all original fields in output', () => {
      const data = {
        currency: 'EUR',
        tiers: [
          { name: 'Starter', price: 29, billing_period: 'monthly', included_units: '5 users', target_segment: 'SMB' },
          { name: 'Pro', price: 99, billing_period: 'monthly', included_units: '25 users', target_segment: 'Enterprise' },
        ],
        gross_margin_pct: 70,
        churn_rate_monthly: 5,
        cac: 200,
        arpa: 100,
      };
      const result = stage07.computeDerived(data);
      expect(result.currency).toBe('EUR');
      expect(result.tiers).toHaveLength(2);
      expect(result.tiers[0].name).toBe('Starter');
      expect(result.tiers[1].name).toBe('Pro');
      expect(result.gross_margin_pct).toBe(70);
      expect(result.churn_rate_monthly).toBe(5);
      expect(result.cac).toBe(200);
      expect(result.arpa).toBe(100);
    });

    it('should not mutate original data', () => {
      const data = {
        currency: 'USD',
        tiers: [{ name: 'Pro', price: 99, billing_period: 'monthly', target_segment: 'SMB' }],
        gross_margin_pct: 70,
        churn_rate_monthly: 5,
        cac: 200,
        arpa: 100,
      };
      const original = JSON.parse(JSON.stringify(data));
      stage07.computeDerived(data);
      expect(data).toEqual(original);
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    it('should work together for valid data with normal churn', () => {
      const data = {
        currency: 'USD',
        pricing_model: 'subscription',
        tiers: [{ name: 'Pro', price: 99, billing_period: 'monthly', target_segment: 'SMB' }],
        gross_margin_pct: 70,
        churn_rate_monthly: 5,
        cac: 200,
        arpa: 100,
      };
      const validation = stage07.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage07.computeDerived(data);
      expect(computed.ltv).toBeCloseTo(1400, 2);
      expect(computed.cac_ltv_ratio).toBeCloseTo(0.142857, 5);
      expect(computed.payback_months).toBeCloseTo(2.857, 2);
      expect(computed.warnings).toHaveLength(0);
    });

    it('should work together for zero churn edge case', () => {
      const data = {
        currency: 'USD',
        pricing_model: 'subscription',
        tiers: [{ name: 'Pro', price: 99, billing_period: 'monthly', target_segment: 'SMB' }],
        gross_margin_pct: 70,
        churn_rate_monthly: 0,
        cac: 200,
        arpa: 100,
      };
      const validation = stage07.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage07.computeDerived(data);
      expect(computed.ltv).toBeNull();
      expect(computed.cac_ltv_ratio).toBeNull();
      expect(computed.payback_months).not.toBeNull();
      expect(computed.warnings.some(w => w.type === 'churn_zero')).toBe(true);
    });

    it('should work together for high churn scenario', () => {
      const data = {
        currency: 'USD',
        pricing_model: 'subscription',
        tiers: [{ name: 'Pro', price: 99, billing_period: 'monthly', target_segment: 'SMB' }],
        gross_margin_pct: 70,
        churn_rate_monthly: 40,
        cac: 200,
        arpa: 100,
      };
      const validation = stage07.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage07.computeDerived(data);
      expect(computed.warnings.some(w => w.type === 'high_churn')).toBe(true);
    });
  });
});
