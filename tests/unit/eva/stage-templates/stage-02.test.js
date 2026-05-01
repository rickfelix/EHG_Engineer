import { describe, it, expect } from 'vitest';
import TEMPLATE, { METRIC_NAMES } from '../../../../lib/eva/stage-templates/stage-02.js';

describe('stage-02 — Idea Analysis', () => {
  it('has correct id, slug, title, version', () => {
    expect(TEMPLATE.id).toBe('stage-02');
    expect(TEMPLATE.slug).toBe('idea-validation');
    expect(TEMPLATE.title).toBe('Idea Analysis');
    expect(TEMPLATE.version).toBe('2.0.0');
  });

  it('defaultData has expected shape', () => {
    const d = TEMPLATE.defaultData;
    expect(d).toHaveProperty('analysis');
    expect(d).toHaveProperty('metrics');
    expect(d).toHaveProperty('evidence');
  });

  it('validate() returns invalid when data is empty', () => {
    const result = TEMPLATE.validate({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('exports METRIC_NAMES as a non-empty array', () => {
    expect(Array.isArray(METRIC_NAMES)).toBe(true);
    expect(METRIC_NAMES.length).toBeGreaterThan(0);
  });

  it('METRIC_NAMES contains expected keys', () => {
    expect(METRIC_NAMES).toContain('marketFit');
    expect(METRIC_NAMES).toContain('customerNeed');
  });
});
