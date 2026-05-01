import { describe, it, expect } from 'vitest';
import TEMPLATE, {
  REQUIRED_LAYERS,
  MIN_INTEGRATION_POINTS,
  MIN_DATA_ENTITIES,
  CONSTRAINT_CATEGORIES,
  MIN_RISKS,
} from '../../../../lib/eva/stage-templates/stage-14.js';

describe('stage-14 — Technical Architecture', () => {
  it('has correct id, slug, title, version', () => {
    expect(TEMPLATE.id).toBe('stage-14');
    expect(TEMPLATE.slug).toBe('technical-architecture');
    expect(TEMPLATE.title).toBe('Technical Architecture');
    expect(TEMPLATE.version).toBe('3.0.0');
  });

  it('defaultData has expected shape', () => {
    const d = TEMPLATE.defaultData;
    expect(d).toHaveProperty('architecture_summary');
    expect(typeof d.layers).toBe('object');
    expect(d).toHaveProperty('security');
    expect(Array.isArray(d.dataEntities)).toBe(true);
    expect(Array.isArray(d.integration_points)).toBe(true);
    expect(Array.isArray(d.constraints)).toBe(true);
  });

  it('validate() returns invalid when architecture_summary is missing', () => {
    const result = TEMPLATE.validate({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('exports REQUIRED_LAYERS containing expected layers', () => {
    expect(Array.isArray(REQUIRED_LAYERS)).toBe(true);
    expect(REQUIRED_LAYERS).toContain('api');
    expect(REQUIRED_LAYERS).toContain('data');
    expect(REQUIRED_LAYERS).toContain('infrastructure');
  });

  it('exports numeric constants', () => {
    expect(typeof MIN_INTEGRATION_POINTS).toBe('number');
    expect(typeof MIN_DATA_ENTITIES).toBe('number');
    expect(typeof MIN_RISKS).toBe('number');
  });

  it('exports CONSTRAINT_CATEGORIES array', () => {
    expect(Array.isArray(CONSTRAINT_CATEGORIES)).toBe(true);
    expect(CONSTRAINT_CATEGORIES).toContain('security');
    expect(CONSTRAINT_CATEGORIES).toContain('performance');
  });
});
