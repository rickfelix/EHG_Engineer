// SD-LEO-INFRA-STAGE-TEMPLATE-DISPATCH-REMAINDER-001: this file's content previously
// lived at stage-24.test.js, shifted with its template to stage-25 by the 27-stage
// renumber (dedicated_venture_uat inserted at stage 23).
import { describe, it, expect } from 'vitest';
import stage25 from '../../../../lib/eva/stage-templates/stage-25.js';

describe('stage-25.js — Go Live & Announce (stub)', () => {
  it('has correct id, slug, title, version, stageKey', () => {
    expect(stage25.id).toBe('stage-25');
    expect(stage25.slug).toBe('go-live');
    expect(stage25.title).toBe('Go Live & Announce');
    expect(stage25.version).toBe('3.0.0');
    expect(stage25.stageKey).toBe('go_live');
  });

  it('has expected defaultData shape', () => {
    expect(stage25.defaultData).toMatchObject({
      launch_status: null,
      channels_to_activate: [],
      launched_at: null,
    });
  });

  it('validate() always returns valid for any input', () => {
    expect(stage25.validate({})).toEqual({ valid: true, errors: [] });
    expect(stage25.validate(null)).toEqual({ valid: true, errors: [] });
    expect(stage25.validate({ launch_status: 'live' })).toEqual({ valid: true, errors: [] });
  });

  it('computeDerived() returns data unchanged', () => {
    const data = { launch_status: 'live', channels_to_activate: ['web'], launched_at: '2026-01-01' };
    expect(stage25.computeDerived(data)).toEqual(data);
  });

  it('has outputSchema defined', () => {
    expect(stage25.outputSchema).toBeDefined();
  });

  it('has analysisStep as a function', () => {
    expect(typeof stage25.analysisStep).toBe('function');
  });

  it('has schema with expected fields', () => {
    expect(stage25.schema.launch_status).toBeDefined();
    expect(stage25.schema.channels_to_activate).toBeDefined();
  });
});
