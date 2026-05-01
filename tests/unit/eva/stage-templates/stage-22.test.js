import { describe, it, expect } from 'vitest';
import stage22 from '../../../../lib/eva/stage-templates/stage-22.js';

describe('stage-22.js — Distribution Setup (stub)', () => {
  it('has correct id, slug, title, version', () => {
    expect(stage22.id).toBe('stage-22');
    expect(stage22.slug).toBe('distribution-setup');
    expect(stage22.title).toBe('Distribution Setup');
    expect(stage22.version).toBe('3.0.0');
  });

  it('has expected defaultData shape', () => {
    expect(stage22.defaultData).toMatchObject({
      channels: [],
      email_sequences: [],
      budget_allocation: {},
      total_channels: 0,
      active_channels: 0,
    });
  });

  it('validate() always returns valid for any input', () => {
    expect(stage22.validate({})).toEqual({ valid: true, errors: [] });
    expect(stage22.validate(null)).toEqual({ valid: true, errors: [] });
    expect(stage22.validate({ channels: [{ channel: 'email' }] })).toEqual({ valid: true, errors: [] });
  });

  it('computeDerived() returns data unchanged', () => {
    const data = { channels: [], email_sequences: [], budget_allocation: {} };
    expect(stage22.computeDerived(data)).toEqual(data);
  });

  it('has outputSchema defined', () => {
    expect(stage22.outputSchema).toBeDefined();
  });

  it('has analysisStep as a function', () => {
    expect(typeof stage22.analysisStep).toBe('function');
  });

  it('has schema with expected fields', () => {
    expect(stage22.schema.channels).toBeDefined();
    expect(stage22.schema.email_sequences).toBeDefined();
    expect(stage22.schema.budget_allocation).toBeDefined();
  });
});
