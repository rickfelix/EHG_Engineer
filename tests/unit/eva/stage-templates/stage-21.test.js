import { describe, it, expect } from 'vitest';
import stage21 from '../../../../lib/eva/stage-templates/stage-21.js';

// SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-A 21<->22 swap (strategy drives creative):
// stage_number 21 now executes Distribution Setup (was Visual Assets). The engine
// dispatches by stage_number -> fixed stage-NN.js, so stage-21.js is the load-bearing
// binding for what stage 21 runs.
describe('stage-21.js — Distribution Setup (stub)', () => {
  it('has correct id, slug, title, version', () => {
    expect(stage21.id).toBe('stage-21');
    expect(stage21.slug).toBe('distribution-setup');
    expect(stage21.title).toBe('Distribution Setup');
    expect(stage21.version).toBe('3.0.0');
  });

  it('has expected defaultData shape', () => {
    expect(stage21.defaultData).toMatchObject({
      channels: [],
      email_sequences: [],
      budget_allocation: {},
      total_channels: 0,
      active_channels: 0,
    });
  });

  it('validate() always returns valid for any input', () => {
    expect(stage21.validate({})).toEqual({ valid: true, errors: [] });
    expect(stage21.validate(null)).toEqual({ valid: true, errors: [] });
    expect(stage21.validate({ channels: [{ channel: 'email' }] })).toEqual({ valid: true, errors: [] });
  });

  it('computeDerived() returns data unchanged', () => {
    const data = { channels: [], email_sequences: [], budget_allocation: {} };
    expect(stage21.computeDerived(data)).toEqual(data);
  });

  it('has outputSchema defined', () => {
    expect(stage21.outputSchema).toBeDefined();
  });

  it('has analysisStep as a function', () => {
    expect(typeof stage21.analysisStep).toBe('function');
  });

  it('has schema with expected fields', () => {
    expect(stage21.schema.channels).toBeDefined();
    expect(stage21.schema.email_sequences).toBeDefined();
    expect(stage21.schema.budget_allocation).toBeDefined();
  });
});
