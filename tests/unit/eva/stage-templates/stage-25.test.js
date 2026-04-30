import { describe, it, expect } from 'vitest';
import stage25 from '../../../../lib/eva/stage-templates/stage-25.js';

describe('stage-25.js — Post-Launch Review (stub)', () => {
  it('has correct id, slug, title, version', () => {
    expect(stage25.id).toBe('stage-25');
    expect(stage25.slug).toBe('post-launch-review');
    expect(stage25.title).toBe('Post-Launch Review');
    expect(stage25.version).toBe('3.0.0');
  });

  it('has expected defaultData shape', () => {
    expect(stage25.defaultData).toMatchObject({
      metrics: {},
      assumptions_validated: [],
      assumptions_invalidated: [],
      data_collection_status: 'pending',
    });
  });

  it('validate() always returns valid for any input', () => {
    expect(stage25.validate({})).toEqual({ valid: true, errors: [] });
    expect(stage25.validate(null)).toEqual({ valid: true, errors: [] });
    expect(stage25.validate({ data_collection_status: 'complete' })).toEqual({ valid: true, errors: [] });
  });

  it('computeDerived() returns data unchanged', () => {
    const data = { metrics: { dau: 1000 }, assumptions_validated: [], data_collection_status: 'complete' };
    expect(stage25.computeDerived(data)).toEqual(data);
  });

  it('has outputSchema defined', () => {
    expect(stage25.outputSchema).toBeDefined();
  });

  it('has analysisStep as a function', () => {
    expect(typeof stage25.analysisStep).toBe('function');
  });

  it('has schema with expected fields', () => {
    expect(stage25.schema.metrics).toBeDefined();
    expect(stage25.schema.assumptions_validated).toBeDefined();
    expect(stage25.schema.data_collection_status).toBeDefined();
  });
});
