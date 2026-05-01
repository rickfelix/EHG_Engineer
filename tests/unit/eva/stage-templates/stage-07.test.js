import { describe, it, expect } from 'vitest';
import TEMPLATE, { BILLING_PERIODS, PRICING_MODELS } from '../../../../lib/eva/stage-templates/stage-07.js';

describe('stage-07 — Revenue Architecture', () => {
  it('has correct id, slug, title, version', () => {
    expect(TEMPLATE.id).toBe('stage-07');
    expect(TEMPLATE.slug).toBe('pricing');
    expect(TEMPLATE.title).toBe('Revenue Architecture');
    expect(TEMPLATE.version).toBe('2.0.0');
  });

  it('defaultData has expected shape', () => {
    const d = TEMPLATE.defaultData;
    expect(d).toHaveProperty('currency');
    expect(d).toHaveProperty('pricing_model');
    expect(Array.isArray(d.tiers)).toBe(true);
    expect(d).toHaveProperty('gross_margin_pct');
    expect(d).toHaveProperty('churn_rate_monthly');
    expect(d).toHaveProperty('cac');
    expect(d).toHaveProperty('arpa');
    expect(Array.isArray(d.warnings)).toBe(true);
  });

  it('validate() returns invalid when pricing_model is missing', () => {
    const result = TEMPLATE.validate({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('exports BILLING_PERIODS array', () => {
    expect(Array.isArray(BILLING_PERIODS)).toBe(true);
    expect(BILLING_PERIODS).toContain('monthly');
    expect(BILLING_PERIODS).toContain('annual');
  });

  it('exports PRICING_MODELS array', () => {
    expect(Array.isArray(PRICING_MODELS)).toBe(true);
    expect(PRICING_MODELS).toContain('subscription');
    expect(PRICING_MODELS).toContain('freemium');
  });
});
