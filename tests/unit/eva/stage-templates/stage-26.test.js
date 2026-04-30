import { describe, it, expect } from 'vitest';
import stage26 from '../../../../lib/eva/stage-templates/stage-26.js';

describe('stage-26.js — Growth Playbook (stub)', () => {
  it('has correct id, slug, title, version', () => {
    expect(stage26.id).toBe('stage-26');
    expect(stage26.slug).toBe('growth-playbook');
    expect(stage26.title).toBe('Growth Playbook');
    expect(stage26.version).toBe('3.0.0');
  });

  it('has expected defaultData shape', () => {
    expect(stage26.defaultData).toMatchObject({
      growth_experiments: [],
      scaling_priorities: [],
      operations_handoff: null,
      experiment_count: 0,
    });
  });

  it('validate() always returns valid for any input', () => {
    expect(stage26.validate({})).toEqual({ valid: true, errors: [] });
    expect(stage26.validate(null)).toEqual({ valid: true, errors: [] });
    expect(stage26.validate({ growth_experiments: [{ name: 'A/B test' }] })).toEqual({ valid: true, errors: [] });
  });

  it('computeDerived() returns data unchanged', () => {
    const data = { growth_experiments: [], scaling_priorities: ['virality'], operations_handoff: null };
    expect(stage26.computeDerived(data)).toEqual(data);
  });

  it('has outputSchema defined', () => {
    expect(stage26.outputSchema).toBeDefined();
  });

  it('has analysisStep as a function', () => {
    expect(typeof stage26.analysisStep).toBe('function');
  });

  it('has schema with expected fields', () => {
    expect(stage26.schema.growth_experiments).toBeDefined();
    expect(stage26.schema.scaling_priorities).toBeDefined();
    expect(stage26.schema.operations_handoff).toBeDefined();
  });
});
