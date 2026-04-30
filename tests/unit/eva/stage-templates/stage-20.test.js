import { describe, it, expect } from 'vitest';
import stage20 from '../../../../lib/eva/stage-templates/stage-20.js';

describe('stage-20.js — Unified Quality Gate', () => {
  it('has correct id, slug, title, version', () => {
    expect(stage20.id).toBe('stage-20');
    expect(stage20.slug).toBe('quality-gate');
    expect(stage20.title).toBe('Stage 20 Quality Gate');
    expect(stage20.version).toBe('3.1.0');
  });

  it('has expected defaultData shape', () => {
    expect(stage20.defaultData).toMatchObject({
      verdict: null,
      repo_url: null,
      findings: [],
      summary: { total_findings: 0, by_severity: {}, by_check: {} },
      checks_run: 0,
    });
  });

  it('validate() fails when verdict is missing', () => {
    const result = stage20.validate({}, { logger: { warn: () => {} } });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('verdict'))).toBe(true);
  });

  it('validate() fails when verdict is not a valid enum', () => {
    const result = stage20.validate({ verdict: 'UNKNOWN' }, { logger: { warn: () => {} } });
    expect(result.valid).toBe(false);
  });

  it('validate() passes for PASS verdict', () => {
    const result = stage20.validate({ verdict: 'PASS' }, { logger: { warn: () => {} } });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('validate() passes for FAIL verdict', () => {
    const result = stage20.validate({ verdict: 'FAIL' }, { logger: { warn: () => {} } });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('validate() passes for WARN verdict', () => {
    const result = stage20.validate({ verdict: 'WARN' }, { logger: { warn: () => {} } });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('validate() handles null data', () => {
    const result = stage20.validate(null, { logger: { warn: () => {} } });
    expect(result.valid).toBe(false);
  });

  it('computeDerived() returns data unchanged', () => {
    const data = { verdict: 'PASS', findings: [], checks_run: 3 };
    expect(stage20.computeDerived(data)).toEqual(data);
  });

  it('has outputSchema defined', () => {
    expect(stage20.outputSchema).toBeDefined();
  });

  it('has analysisStep as a function', () => {
    expect(typeof stage20.analysisStep).toBe('function');
  });
});
