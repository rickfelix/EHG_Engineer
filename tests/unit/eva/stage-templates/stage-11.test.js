import { describe, it, expect } from 'vitest';
import TEMPLATE, {
  MIN_CANDIDATES,
  WEIGHT_SUM,
  NAMING_STRATEGIES,
} from '../../../../lib/eva/stage-templates/stage-11.js';

describe('stage-11 — Naming & Visual Identity', () => {
  it('has correct id, slug, title, version', () => {
    expect(TEMPLATE.id).toBe('stage-11');
    expect(TEMPLATE.slug).toBe('naming-visual-identity');
    expect(TEMPLATE.title).toBe('Naming & Visual Identity');
    expect(TEMPLATE.version).toBe('3.0.0');
  });

  it('defaultData has expected shape', () => {
    const d = TEMPLATE.defaultData;
    expect(d).toHaveProperty('namingStrategy');
    expect(Array.isArray(d.candidates)).toBe(true);
    expect(d).toHaveProperty('visualIdentity');
    expect(d).toHaveProperty('brandExpression');
    expect(d).toHaveProperty('logoSpec');
    expect(Array.isArray(d.ranked_candidates)).toBe(true);
  });

  it('validate() returns invalid when required fields are missing', () => {
    const result = TEMPLATE.validate({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('validate() rejects fewer than MIN_CANDIDATES candidates', () => {
    const data = {
      namingStrategy: { approach: 'descriptive', rationale: 'test' },
      scoringCriteria: [{ name: 'fit', weight: 100 }],
      candidates: [{ name: 'A', rationale: 'r', scores: {}, personaFit: [] }],
      visualIdentity: { imageryGuidance: 'modern', colorPalette: ['#fff'], typography: {} },
    };
    const result = TEMPLATE.validate(data);
    expect(result.valid).toBe(false);
  });

  it('exports MIN_CANDIDATES as a number >= 1', () => {
    expect(typeof MIN_CANDIDATES).toBe('number');
    expect(MIN_CANDIDATES).toBeGreaterThanOrEqual(1);
  });

  it('exports WEIGHT_SUM as 100', () => {
    expect(WEIGHT_SUM).toBe(100);
  });

  it('exports NAMING_STRATEGIES array', () => {
    expect(Array.isArray(NAMING_STRATEGIES)).toBe(true);
    expect(NAMING_STRATEGIES).toContain('descriptive');
    expect(NAMING_STRATEGIES).toContain('abstract');
    expect(NAMING_STRATEGIES.length).toBeGreaterThan(2);
  });
});
