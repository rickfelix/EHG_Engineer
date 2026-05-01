import { describe, it, expect } from 'vitest';
import TEMPLATE, {
  MIN_MILESTONES,
  MIN_TIMELINE_MONTHS,
  MIN_DELIVERABLES_PER_MILESTONE,
  evaluateKillGate,
} from '../../../../lib/eva/stage-templates/stage-13.js';

describe('stage-13 — Product Roadmap', () => {
  it('has correct id, slug, title, version', () => {
    expect(TEMPLATE.id).toBe('stage-13');
    expect(TEMPLATE.slug).toBe('product-roadmap');
    expect(TEMPLATE.title).toBe('Product Roadmap');
    expect(TEMPLATE.version).toBe('2.0.0');
  });

  it('defaultData has expected shape', () => {
    const d = TEMPLATE.defaultData;
    expect(d).toHaveProperty('vision_statement');
    expect(Array.isArray(d.milestones)).toBe(true);
    expect(Array.isArray(d.phases)).toBe(true);
    expect(d).toHaveProperty('timeline_months');
    expect(typeof d.milestone_count).toBe('number');
  });

  it('validate() returns invalid when vision_statement is missing', () => {
    const result = TEMPLATE.validate({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('exports MIN_MILESTONES as a positive number', () => {
    expect(typeof MIN_MILESTONES).toBe('number');
    expect(MIN_MILESTONES).toBeGreaterThan(0);
  });

  it('exports MIN_TIMELINE_MONTHS and MIN_DELIVERABLES_PER_MILESTONE', () => {
    expect(typeof MIN_TIMELINE_MONTHS).toBe('number');
    expect(typeof MIN_DELIVERABLES_PER_MILESTONE).toBe('number');
  });

  it('exports evaluateKillGate as a function', () => {
    expect(typeof evaluateKillGate).toBe('function');
  });
});
