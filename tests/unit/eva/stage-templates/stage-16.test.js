import { describe, it, expect } from 'vitest';
import TEMPLATE, { MIN_PROJECTION_MONTHS, evaluatePromotionGate } from '../../../../lib/eva/stage-templates/stage-16.js';

describe('stage-16 — Financial Projections', () => {
  it('has correct id, slug, title, version', () => {
    expect(TEMPLATE.id).toBe('stage-16');
    expect(TEMPLATE.slug).toBe('financial-projections');
    expect(TEMPLATE.title).toBe('Financial Projections');
    expect(TEMPLATE.version).toBe('3.0.0');
  });

  it('defaultData has expected shape', () => {
    const d = TEMPLATE.defaultData;
    expect(typeof d.initial_capital).toBe('number');
    expect(typeof d.monthly_burn_rate).toBe('number');
    expect(Array.isArray(d.revenue_projections)).toBe(true);
    expect(Array.isArray(d.funding_rounds)).toBe(true);
    expect(d).toHaveProperty('runway_months');
    expect(d).toHaveProperty('break_even_month');
    expect(Array.isArray(d.viability_warnings)).toBe(true);
  });

  it('validate() returns invalid when initial_capital is missing', () => {
    const result = TEMPLATE.validate({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('exports MIN_PROJECTION_MONTHS as a positive number', () => {
    expect(typeof MIN_PROJECTION_MONTHS).toBe('number');
    expect(MIN_PROJECTION_MONTHS).toBeGreaterThan(0);
  });

  it('exports evaluatePromotionGate as a function', () => {
    expect(typeof evaluatePromotionGate).toBe('function');
  });

  it('evaluatePromotionGate passes with chairmanOverride', () => {
    const result = evaluatePromotionGate(
      { stage13: {}, stage14: {}, stage15: {}, stage16: {} },
      { chairmanOverride: { approved: true, justification: 'Test override' } }
    );
    expect(result.pass).toBe(true);
    expect(result.decision).toBe('OVERRIDE');
  });
});
