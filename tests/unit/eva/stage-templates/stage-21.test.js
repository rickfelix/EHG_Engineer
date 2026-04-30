import { describe, it, expect } from 'vitest';
import stage21 from '../../../../lib/eva/stage-templates/stage-21.js';

describe('stage-21.js — Visual Assets (stub)', () => {
  it('has correct id, slug, title, version', () => {
    expect(stage21.id).toBe('stage-21');
    expect(stage21.slug).toBe('visual-assets');
    expect(stage21.title).toBe('Visual Assets');
    expect(stage21.version).toBe('3.0.0');
  });

  it('has expected defaultData shape', () => {
    expect(stage21.defaultData).toMatchObject({
      device_screenshots: [],
      social_graphics: [],
      video_storyboard: [],
      total_assets: 0,
    });
  });

  it('validate() always returns valid for any input', () => {
    expect(stage21.validate({})).toEqual({ valid: true, errors: [] });
    expect(stage21.validate(null)).toEqual({ valid: true, errors: [] });
    expect(stage21.validate({ device_screenshots: [{ device: 'iPhone' }] })).toEqual({ valid: true, errors: [] });
  });

  it('computeDerived() returns data unchanged', () => {
    const data = { device_screenshots: [], social_graphics: [], total_assets: 0 };
    expect(stage21.computeDerived(data)).toEqual(data);
  });

  it('has outputSchema defined', () => {
    expect(stage21.outputSchema).toBeDefined();
  });

  it('has analysisStep as a function', () => {
    expect(typeof stage21.analysisStep).toBe('function');
  });

  it('has schema with expected fields', () => {
    expect(stage21.schema.device_screenshots).toBeDefined();
    expect(stage21.schema.social_graphics).toBeDefined();
    expect(stage21.schema.video_storyboard).toBeDefined();
  });
});
