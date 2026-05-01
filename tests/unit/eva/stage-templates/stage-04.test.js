import { describe, it, expect } from 'vitest';
import TEMPLATE, { THREAT_LEVELS, PRICING_MODELS } from '../../../../lib/eva/stage-templates/stage-04.js';

describe('stage-04 — Competitive Landscape', () => {
  it('has correct id, slug, title, version', () => {
    expect(TEMPLATE.id).toBe('stage-04');
    expect(TEMPLATE.slug).toBe('competitive-intel');
    expect(TEMPLATE.title).toBe('Competitive Landscape');
    expect(TEMPLATE.version).toBe('2.0.0');
  });

  it('defaultData has expected shape', () => {
    const d = TEMPLATE.defaultData;
    expect(Array.isArray(d.competitors)).toBe(true);
    expect(d).toHaveProperty('blueOceanAnalysis');
    expect(d).toHaveProperty('stage5Handoff');
  });

  it('validate() returns invalid when data is empty', () => {
    const result = TEMPLATE.validate({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('exports THREAT_LEVELS array', () => {
    expect(Array.isArray(THREAT_LEVELS)).toBe(true);
    expect(THREAT_LEVELS).toContain('H');
    expect(THREAT_LEVELS).toContain('L');
  });

  it('exports PRICING_MODELS array', () => {
    expect(Array.isArray(PRICING_MODELS)).toBe(true);
    expect(PRICING_MODELS.length).toBeGreaterThan(0);
  });
});
