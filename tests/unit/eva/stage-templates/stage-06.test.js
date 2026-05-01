import { describe, it, expect } from 'vitest';
import TEMPLATE, { RISK_CATEGORIES, RISK_STATUSES } from '../../../../lib/eva/stage-templates/stage-06.js';

describe('stage-06 — Risk Assessment', () => {
  it('has correct id, slug, title, version', () => {
    expect(TEMPLATE.id).toBe('stage-06');
    expect(TEMPLATE.slug).toBe('risk-matrix');
    expect(TEMPLATE.title).toBe('Risk Assessment');
    expect(TEMPLATE.version).toBe('2.0.0');
  });

  it('defaultData has expected shape', () => {
    const d = TEMPLATE.defaultData;
    expect(Array.isArray(d.risks)).toBe(true);
    expect(typeof d.aggregate_risk_score).toBe('number');
    expect(typeof d.normalized_risk_score).toBe('number');
    expect(d).toHaveProperty('highest_risk_factor');
    expect(typeof d.mitigation_coverage_pct).toBe('number');
  });

  it('validate() returns invalid when data is empty', () => {
    const result = TEMPLATE.validate({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('exports RISK_CATEGORIES as a non-empty array', () => {
    expect(Array.isArray(RISK_CATEGORIES)).toBe(true);
    expect(RISK_CATEGORIES.length).toBeGreaterThan(0);
  });

  it('exports RISK_STATUSES containing open and mitigated', () => {
    expect(Array.isArray(RISK_STATUSES)).toBe(true);
    expect(RISK_STATUSES).toContain('open');
    expect(RISK_STATUSES).toContain('mitigated');
  });
});
