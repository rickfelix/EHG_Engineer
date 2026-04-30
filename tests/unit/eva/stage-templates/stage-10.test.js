import { describe, it, expect } from 'vitest';
import TEMPLATE, {
  MIN_PERSONAS,
  MIN_CANDIDATES,
  WEIGHT_SUM,
  BRAND_GENOME_KEYS,
  NAMING_STRATEGIES,
  ARCHETYPES,
} from '../../../../lib/eva/stage-templates/stage-10.js';

describe('stage-10 — Customer & Brand Foundation', () => {
  it('has correct id, slug, title, version', () => {
    expect(TEMPLATE.id).toBe('stage-10');
    expect(TEMPLATE.slug).toBe('customer-brand-foundation');
    expect(TEMPLATE.title).toBe('Customer & Brand Foundation');
    expect(TEMPLATE.version).toBe('3.0.0');
  });

  it('defaultData has expected shape', () => {
    const d = TEMPLATE.defaultData;
    expect(Array.isArray(d.customerPersonas)).toBe(true);
    expect(d).toHaveProperty('brandGenome');
    expect(Array.isArray(d.candidates)).toBe(true);
    expect(d).toHaveProperty('chairmanGate');
    expect(d.chairmanGate.status).toBe('pending');
  });

  it('validate() returns invalid when required fields are missing', () => {
    const result = TEMPLATE.validate({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('exports MIN_PERSONAS as a number >= 1', () => {
    expect(typeof MIN_PERSONAS).toBe('number');
    expect(MIN_PERSONAS).toBeGreaterThanOrEqual(1);
  });

  it('exports MIN_CANDIDATES as a number >= 1', () => {
    expect(typeof MIN_CANDIDATES).toBe('number');
    expect(MIN_CANDIDATES).toBeGreaterThanOrEqual(1);
  });

  it('exports WEIGHT_SUM as 100', () => {
    expect(WEIGHT_SUM).toBe(100);
  });

  it('exports BRAND_GENOME_KEYS array', () => {
    expect(Array.isArray(BRAND_GENOME_KEYS)).toBe(true);
    expect(BRAND_GENOME_KEYS).toContain('archetype');
    expect(BRAND_GENOME_KEYS).toContain('tone');
  });

  it('exports NAMING_STRATEGIES array', () => {
    expect(Array.isArray(NAMING_STRATEGIES)).toBe(true);
    expect(NAMING_STRATEGIES).toContain('descriptive');
    expect(NAMING_STRATEGIES).toContain('abstract');
  });

  it('exports ARCHETYPES array', () => {
    expect(Array.isArray(ARCHETYPES)).toBe(true);
    expect(ARCHETYPES).toContain('Hero');
    expect(ARCHETYPES).toContain('Creator');
    expect(ARCHETYPES.length).toBeGreaterThan(5);
  });
});
