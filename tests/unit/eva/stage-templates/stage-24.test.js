import { describe, it, expect } from 'vitest';
import stage24 from '../../../../lib/eva/stage-templates/stage-24.js';

describe('stage-24.js — Go Live & Announce (stub)', () => {
  it('has correct id, slug, title, version', () => {
    expect(stage24.id).toBe('stage-24');
    expect(stage24.slug).toBe('go-live');
    expect(stage24.title).toBe('Go Live & Announce');
    expect(stage24.version).toBe('3.0.0');
  });

  it('has expected defaultData shape', () => {
    expect(stage24.defaultData).toMatchObject({
      launch_status: null,
      channels_to_activate: [],
      launched_at: null,
    });
  });

  it('validate() always returns valid for any input', () => {
    expect(stage24.validate({})).toEqual({ valid: true, errors: [] });
    expect(stage24.validate(null)).toEqual({ valid: true, errors: [] });
    expect(stage24.validate({ launch_status: 'live' })).toEqual({ valid: true, errors: [] });
  });

  it('computeDerived() returns data unchanged', () => {
    const data = { launch_status: 'live', channels_to_activate: ['web'], launched_at: '2026-01-01' };
    expect(stage24.computeDerived(data)).toEqual(data);
  });

  it('has outputSchema defined', () => {
    expect(stage24.outputSchema).toBeDefined();
  });

  it('has analysisStep as a function', () => {
    expect(typeof stage24.analysisStep).toBe('function');
  });

  it('has schema with expected fields', () => {
    expect(stage24.schema.launch_status).toBeDefined();
    expect(stage24.schema.channels_to_activate).toBeDefined();
  });
});
