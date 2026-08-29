// SD-LEO-INFRA-STAGE-TEMPLATE-DISPATCH-REMAINDER-001: this file's content previously
// lived at stage-25.test.js, shifted with its template to stage-26 by the 27-stage
// renumber (dedicated_venture_uat inserted at stage 23).
import { describe, it, expect } from 'vitest';
import stage26 from '../../../../lib/eva/stage-templates/stage-26.js';

describe('stage-26.js — Post-Launch Review (stub)', () => {
  it('has correct id, slug, title, version, stageKey', () => {
    expect(stage26.id).toBe('stage-26');
    expect(stage26.slug).toBe('post-launch-review');
    expect(stage26.title).toBe('Post-Launch Review');
    expect(stage26.version).toBe('3.0.0');
    expect(stage26.stageKey).toBe('post_launch_review');
  });

  it('has expected defaultData shape', () => {
    expect(stage26.defaultData).toMatchObject({
      metrics: {},
      assumptions_validated: [],
      assumptions_invalidated: [],
      data_collection_status: 'pending',
    });
  });

  it('validate() always returns valid for any input', () => {
    expect(stage26.validate({})).toEqual({ valid: true, errors: [] });
    expect(stage26.validate(null)).toEqual({ valid: true, errors: [] });
    expect(stage26.validate({ data_collection_status: 'complete' })).toEqual({ valid: true, errors: [] });
  });

  it('computeDerived() returns data unchanged', () => {
    const data = { metrics: { dau: 1000 }, assumptions_validated: [], data_collection_status: 'complete' };
    expect(stage26.computeDerived(data)).toEqual(data);
  });

  it('has outputSchema defined', () => {
    expect(stage26.outputSchema).toBeDefined();
  });

  it('has analysisStep as a function', () => {
    expect(typeof stage26.analysisStep).toBe('function');
  });

  it('has schema with expected fields', () => {
    expect(stage26.schema.metrics).toBeDefined();
    expect(stage26.schema.assumptions_validated).toBeDefined();
    expect(stage26.schema.data_collection_status).toBeDefined();
  });
});
