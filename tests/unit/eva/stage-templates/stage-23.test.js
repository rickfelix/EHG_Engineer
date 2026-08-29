// SD-LEO-INFRA-STAGE-TEMPLATE-DISPATCH-REMAINDER-001: stage-23.js previously held
// Launch Readiness Kill Gate content (now at stage-24.js, see stage-24.test.js). This
// is the new, genuinely different stage-23 content: Dedicated Venture UAT.
import { describe, it, expect } from 'vitest';
import stage23 from '../../../../lib/eva/stage-templates/stage-23.js';

describe('stage-23.js — Dedicated Venture UAT (stub)', () => {
  it('has correct id, slug, title, version, stageKey', () => {
    expect(stage23.id).toBe('stage-23');
    expect(stage23.slug).toBe('dedicated-venture-uat');
    expect(stage23.title).toBe('Dedicated Venture UAT');
    expect(stage23.version).toBe('1.0.0');
    expect(stage23.stageKey).toBe('dedicated_venture_uat');
  });

  it('has expected defaultData shape', () => {
    expect(stage23.defaultData).toMatchObject({
      applies: false,
      satisfied: true,
      indeterminate: false,
      reason: null,
    });
  });

  it('validate() always returns valid for any input', () => {
    expect(stage23.validate({})).toEqual({ valid: true, errors: [] });
    expect(stage23.validate(null)).toEqual({ valid: true, errors: [] });
    expect(stage23.validate({ satisfied: false })).toEqual({ valid: true, errors: [] });
  });

  it('computeDerived() returns data unchanged', () => {
    const data = { applies: true, satisfied: false, reason: 'journey failed' };
    expect(stage23.computeDerived(data)).toEqual(data);
  });

  it('has outputSchema defined', () => {
    expect(stage23.outputSchema).toBeDefined();
  });

  it('has analysisStep as a function', () => {
    expect(typeof stage23.analysisStep).toBe('function');
  });

  it('has schema with expected fields', () => {
    expect(stage23.schema.applies).toBeDefined();
    expect(stage23.schema.satisfied).toBeDefined();
    expect(stage23.schema.reason).toBeDefined();
  });
});
