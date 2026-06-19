/**
 * SD-LEO-INFRA-LOOP-CONTRACT-FRAMEWORK-001 (FR-1, FR-4)
 * Typed loop-contract schema + fail-loud validator.
 */
import { describe, it, expect } from 'vitest';
import {
  validateLoopContract,
  CADENCE_TYPE,
  BOUNDARY_KIND,
  LOOP_CONTRACT_FIELDS,
} from '../../../lib/loops/loop-contract.js';

/** A complete, valid contract fixture. */
function completeContract() {
  return {
    id: 'LOOP-TEST-001',
    name: 'Test Loop',
    goals: ['do the thing'],
    workflow: [{ step: 1, name: 'first step', action: 'read' }],
    boundaries: [
      { kind: BOUNDARY_KIND.MAY, description: 'read tables' },
      { kind: BOUNDARY_KIND.MAY_NOT, description: 'write strategy tables' },
    ],
    tasks: [{ task: 'entrypoint', file: 'scripts/x.cjs' }],
    timeline: { type: CADENCE_TYPE.CRON, cadence: '0 * * * *' },
    logging: { writes: ['verdict'] },
  };
}

describe('enums + field list', () => {
  it('exposes frozen CADENCE_TYPE and BOUNDARY_KIND', () => {
    expect(Object.isFrozen(CADENCE_TYPE)).toBe(true);
    expect(Object.isFrozen(BOUNDARY_KIND)).toBe(true);
    expect(Object.values(CADENCE_TYPE)).toEqual(['cron', 'interval', 'event', 'manual']);
    expect(BOUNDARY_KIND.MAY).toBe('may');
    expect(BOUNDARY_KIND.MAY_NOT).toBe('may_not');
  });

  it('declares the chairman named fields', () => {
    for (const f of ['goals', 'workflow', 'boundaries', 'tasks', 'timeline', 'logging']) {
      expect(LOOP_CONTRACT_FIELDS).toContain(f);
    }
  });
});

describe('validateLoopContract — happy path', () => {
  it('a complete contract is valid with no errors', () => {
    expect(validateLoopContract(completeContract())).toEqual({ valid: true, errors: [] });
  });
});

describe('validateLoopContract — fail-loud (each missing required field is named)', () => {
  for (const field of ['id', 'name', 'goals', 'workflow', 'boundaries', 'timeline']) {
    it(`missing "${field}" => invalid and names the field`, () => {
      const c = completeContract();
      delete c[field];
      const res = validateLoopContract(c);
      expect(res.valid).toBe(false);
      expect(res.errors.join(' ')).toContain(field);
    });
  }

  it('a boundaries array with only "may" (no may_not) is invalid', () => {
    const c = completeContract();
    c.boundaries = [{ kind: BOUNDARY_KIND.MAY, description: 'read' }];
    const res = validateLoopContract(c);
    expect(res.valid).toBe(false);
    expect(res.errors.join(' ')).toContain('may_not');
  });

  it('a workflow step missing a numeric step or name is invalid', () => {
    const c = completeContract();
    c.workflow = [{ name: 'no step number' }];
    expect(validateLoopContract(c).valid).toBe(false);
  });

  it('an unknown timeline.type is invalid', () => {
    const c = completeContract();
    c.timeline = { type: 'weekly', cadence: '0 0 * * 0' };
    const res = validateLoopContract(c);
    expect(res.valid).toBe(false);
    expect(res.errors.join(' ')).toContain('timeline.type');
  });

  it('empty goals array is invalid (never silent-pass)', () => {
    const c = completeContract();
    c.goals = [];
    expect(validateLoopContract(c).valid).toBe(false);
  });
});

describe('validateLoopContract — total / never throws', () => {
  it('null, non-object, and array inputs are invalid (no throw)', () => {
    expect(validateLoopContract(null).valid).toBe(false);
    expect(validateLoopContract(42).valid).toBe(false);
    expect(validateLoopContract([]).valid).toBe(false);
  });

  it('a hostile throwing getter degrades to invalid, not an exception', () => {
    const hostile = completeContract();
    Object.defineProperty(hostile, 'goals', { get() { throw new Error('boom'); } });
    let res;
    expect(() => { res = validateLoopContract(hostile); }).not.toThrow();
    expect(res.valid).toBe(false);
  });
});
