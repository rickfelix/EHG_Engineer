import { describe, it, expect } from 'vitest';
import stage22 from '../../../../lib/eva/stage-templates/stage-22.js';

// SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-A 21<->22 swap (strategy drives creative):
// stage_number 22 now executes Visual Assets (was Distribution Setup). The engine
// dispatches by stage_number -> fixed stage-NN.js, so stage-22.js is the load-bearing
// binding for what stage 22 runs.
describe('stage-22.js — Visual Assets (stub)', () => {
  it('has correct id, slug, title, version', () => {
    expect(stage22.id).toBe('stage-22');
    expect(stage22.slug).toBe('visual-assets');
    expect(stage22.title).toBe('Visual Assets');
    expect(stage22.version).toBe('3.0.0');
  });

  it('has expected defaultData shape', () => {
    expect(stage22.defaultData).toMatchObject({
      device_screenshots: [],
      social_graphics: [],
      video_storyboard: [],
      total_assets: 0,
    });
  });

  it('validate() always returns valid for any input', () => {
    expect(stage22.validate({})).toEqual({ valid: true, errors: [] });
    expect(stage22.validate(null)).toEqual({ valid: true, errors: [] });
    expect(stage22.validate({ device_screenshots: [{ device: 'iPhone' }] })).toEqual({ valid: true, errors: [] });
  });

  it('computeDerived() returns data unchanged', () => {
    const data = { device_screenshots: [], social_graphics: [], total_assets: 0 };
    expect(stage22.computeDerived(data)).toEqual(data);
  });

  it('has outputSchema defined', () => {
    expect(stage22.outputSchema).toBeDefined();
  });

  it('has analysisStep as a function', () => {
    expect(typeof stage22.analysisStep).toBe('function');
  });

  it('has schema with expected fields', () => {
    expect(stage22.schema.device_screenshots).toBeDefined();
    expect(stage22.schema.social_graphics).toBeDefined();
    expect(stage22.schema.video_storyboard).toBeDefined();
  });
});
