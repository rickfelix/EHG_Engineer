import { describe, it, expect } from 'vitest';
import TEMPLATE, {
  ROI_PASS_THRESHOLD,
  ROI_CONDITIONAL_THRESHOLD,
  MAX_BREAKEVEN_MONTHS,
  LTV_CAC_THRESHOLD,
  PAYBACK_THRESHOLD,
  CONDITIONAL_LTV_CAC_THRESHOLD,
  CONDITIONAL_PAYBACK_THRESHOLD,
  evaluateKillGate,
} from '../../../../lib/eva/stage-templates/stage-05.js';

describe('stage-05 — Kill Gate (Financial)', () => {
  it('has correct id, slug, title, version', () => {
    expect(TEMPLATE.id).toBe('stage-05');
    expect(TEMPLATE.slug).toBe('profitability');
    expect(TEMPLATE.title).toBe('Kill Gate (Financial)');
    expect(TEMPLATE.version).toBe('2.0.0');
  });

  it('defaultData has expected shape', () => {
    const d = TEMPLATE.defaultData;
    expect(d).toHaveProperty('initialInvestment');
    expect(d).toHaveProperty('year1');
    expect(d).toHaveProperty('unitEconomics');
    expect(d.year1).toHaveProperty('revenue');
    expect(d.year1).toHaveProperty('cogs');
  });

  it('validate() returns invalid when data is empty', () => {
    const result = TEMPLATE.validate({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('exports numeric thresholds', () => {
    expect(typeof ROI_PASS_THRESHOLD).toBe('number');
    expect(typeof ROI_CONDITIONAL_THRESHOLD).toBe('number');
    expect(typeof MAX_BREAKEVEN_MONTHS).toBe('number');
    expect(typeof LTV_CAC_THRESHOLD).toBe('number');
    expect(typeof PAYBACK_THRESHOLD).toBe('number');
    expect(typeof CONDITIONAL_LTV_CAC_THRESHOLD).toBe('number');
    expect(typeof CONDITIONAL_PAYBACK_THRESHOLD).toBe('number');
  });

  it('exports evaluateKillGate as a function', () => {
    expect(typeof evaluateKillGate).toBe('function');
  });
});
