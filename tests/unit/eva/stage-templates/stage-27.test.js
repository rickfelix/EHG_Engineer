// SD-LEO-INFRA-STAGE-TEMPLATE-DISPATCH-REMAINDER-001: this file's content previously
// lived at stage-26.test.js, shifted with its template to stage-27 by the 27-stage
// renumber (dedicated_venture_uat inserted at stage 23). Prior to this SD no
// stage-27.js/stage-27.test.js existed at all.
import { describe, it, expect } from 'vitest';
import stage27 from '../../../../lib/eva/stage-templates/stage-27.js';

describe('stage-27.js — Growth Playbook (stub)', () => {
  it('has correct id, slug, title, version, stageKey', () => {
    expect(stage27.id).toBe('stage-27');
    expect(stage27.slug).toBe('growth-playbook');
    expect(stage27.title).toBe('Growth Playbook');
    expect(stage27.version).toBe('3.0.0');
    expect(stage27.stageKey).toBe('growth_playbook');
  });

  it('has expected defaultData shape', () => {
    expect(stage27.defaultData).toMatchObject({
      growth_experiments: [],
      scaling_priorities: [],
      operations_handoff: null,
      experiment_count: 0,
    });
  });

  it('validate() always returns valid for any input', () => {
    expect(stage27.validate({})).toEqual({ valid: true, errors: [] });
    expect(stage27.validate(null)).toEqual({ valid: true, errors: [] });
    expect(stage27.validate({ growth_experiments: [{ name: 'A/B test' }] })).toEqual({ valid: true, errors: [] });
  });

  it('computeDerived() returns data unchanged', () => {
    const data = { growth_experiments: [], scaling_priorities: ['virality'], operations_handoff: null };
    expect(stage27.computeDerived(data)).toEqual(data);
  });

  it('has outputSchema defined', () => {
    expect(stage27.outputSchema).toBeDefined();
  });

  it('has analysisStep as a function', () => {
    expect(typeof stage27.analysisStep).toBe('function');
  });

  it('has schema with expected fields', () => {
    expect(stage27.schema.growth_experiments).toBeDefined();
    expect(stage27.schema.scaling_priorities).toBeDefined();
    expect(stage27.schema.operations_handoff).toBeDefined();
  });
});
