import { describe, it, expect } from 'vitest';
import TEMPLATE, {
  METRICS,
  PASS_THRESHOLD,
  REVISE_THRESHOLD,
  METRIC_THRESHOLD,
  THREAT_LEVELS,
  evaluateKillGate,
} from '../../../../lib/eva/stage-templates/stage-03.js';

describe('stage-03 — Kill Gate', () => {
  it('has correct id, slug, title, version', () => {
    expect(TEMPLATE.id).toBe('stage-03');
    expect(TEMPLATE.slug).toBe('validation');
    expect(TEMPLATE.title).toBe('Kill Gate');
    expect(TEMPLATE.version).toBe('2.0.0');
  });

  it('defaultData has expected shape', () => {
    const d = TEMPLATE.defaultData;
    expect(d).toHaveProperty('competitorEntities');
    expect(Array.isArray(d.competitorEntities)).toBe(true);
    expect(d).toHaveProperty('risk_factors');
    expect(d).toHaveProperty('go_conditions');
  });

  it('validate() returns invalid when data is empty', () => {
    const result = TEMPLATE.validate({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('exports METRICS as a non-empty array', () => {
    expect(Array.isArray(METRICS)).toBe(true);
    expect(METRICS.length).toBeGreaterThan(0);
  });

  it('exports numeric thresholds', () => {
    expect(typeof PASS_THRESHOLD).toBe('number');
    expect(typeof REVISE_THRESHOLD).toBe('number');
    expect(typeof METRIC_THRESHOLD).toBe('number');
  });

  it('exports THREAT_LEVELS array', () => {
    expect(Array.isArray(THREAT_LEVELS)).toBe(true);
    expect(THREAT_LEVELS).toContain('H');
    expect(THREAT_LEVELS).toContain('L');
  });

  it('exports evaluateKillGate as a function', () => {
    expect(typeof evaluateKillGate).toBe('function');
  });
});
