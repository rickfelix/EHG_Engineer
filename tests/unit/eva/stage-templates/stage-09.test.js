import { describe, it, expect } from 'vitest';
import TEMPLATE, { MIN_RISKS, MIN_ACQUIRERS, evaluateRealityGate } from '../../../../lib/eva/stage-templates/stage-09.js';

describe('stage-09 — Exit Strategy', () => {
  it('has correct id, slug, title, version', () => {
    expect(TEMPLATE.id).toBe('stage-09');
    expect(TEMPLATE.slug).toBe('exit-strategy');
    expect(TEMPLATE.title).toBe('Exit Strategy');
    expect(TEMPLATE.version).toBe('2.0.0');
  });

  it('defaultData has expected shape', () => {
    const d = TEMPLATE.defaultData;
    expect(d).toHaveProperty('exit_thesis');
    expect(d).toHaveProperty('exit_horizon_months');
    expect(Array.isArray(d.exit_paths)).toBe(true);
    expect(Array.isArray(d.target_acquirers)).toBe(true);
    expect(Array.isArray(d.milestones)).toBe(true);
    expect(d).toHaveProperty('reality_gate');
  });

  it('validate() returns invalid when data is empty', () => {
    const result = TEMPLATE.validate({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('exports MIN_RISKS and MIN_ACQUIRERS as positive numbers', () => {
    expect(typeof MIN_RISKS).toBe('number');
    expect(MIN_RISKS).toBeGreaterThan(0);
    expect(typeof MIN_ACQUIRERS).toBe('number');
    expect(MIN_ACQUIRERS).toBeGreaterThan(0);
  });

  it('exports evaluateRealityGate as a function', () => {
    expect(typeof evaluateRealityGate).toBe('function');
  });
});
