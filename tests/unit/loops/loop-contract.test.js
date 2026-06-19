/**
 * SD-LEO-INFRA-LOOP-CONTRACT-FRAMEWORK-001 (FR-1, FR-4)
 * Typed loop-contract schema + fail-loud validator.
 */
import { describe, it, expect } from 'vitest';
import {
  validateLoopContract,
  CADENCE_TYPE,
  BOUNDARY_KIND,
  GOAL_TYPE,
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

// SD-LEO-INFRA-LOOP-CONTRACT-GOAL-TYPE-BUDGET-001 (FR-1): GOAL_TYPE + typed-goal validation.
describe('GOAL_TYPE + typed goals (FR-1)', () => {
  it('exposes a frozen GOAL_TYPE enum {verifiable, llm_as_judge}', () => {
    expect(Object.isFrozen(GOAL_TYPE)).toBe(true);
    expect(Object.values(GOAL_TYPE)).toEqual(['verifiable', 'llm_as_judge']);
  });

  it('a bare-string goal is still valid (back-compat)', () => {
    const c = completeContract();
    c.goals = ['do the thing'];
    expect(validateLoopContract(c)).toEqual({ valid: true, errors: [] });
  });

  it('a typed verifiable goal object (with a metric) is valid', () => {
    const c = completeContract();
    c.goals = [{ description: 'reach threshold', type: GOAL_TYPE.VERIFIABLE, metric: 'count >= N' }];
    expect(validateLoopContract(c)).toEqual({ valid: true, errors: [] });
  });

  it('a verifiable goal WITHOUT a metric is still valid (metric is SHOULD, not MUST)', () => {
    const c = completeContract();
    c.goals = [{ description: 'reach threshold', type: GOAL_TYPE.VERIFIABLE }];
    expect(validateLoopContract(c).valid).toBe(true);
  });

  it('an llm_as_judge goal WITH a rubric_ref is valid', () => {
    const c = completeContract();
    c.goals = [{ description: 'clears the bar', type: GOAL_TYPE.LLM_AS_JUDGE, rubric_ref: 'lib/adam/rationale-bar.js' }];
    expect(validateLoopContract(c)).toEqual({ valid: true, errors: [] });
  });

  it('an llm_as_judge goal WITHOUT a rubric_ref is invalid and names rubric_ref (anti-brittleness guard)', () => {
    const c = completeContract();
    c.goals = [{ description: 'clears the bar', type: GOAL_TYPE.LLM_AS_JUDGE }];
    const res = validateLoopContract(c);
    expect(res.valid).toBe(false);
    expect(res.errors.join(' ')).toContain('rubric_ref');
  });

  it('a goal object missing a description is invalid', () => {
    const c = completeContract();
    c.goals = [{ type: GOAL_TYPE.VERIFIABLE }];
    const res = validateLoopContract(c);
    expect(res.valid).toBe(false);
    expect(res.errors.join(' ')).toContain('description');
  });

  it('a goal object with an unknown type is invalid', () => {
    const c = completeContract();
    c.goals = [{ description: 'x', type: 'vibes' }];
    const res = validateLoopContract(c);
    expect(res.valid).toBe(false);
    expect(res.errors.join(' ')).toContain('type');
  });

  it('mixed bare-string and typed goals are accepted together', () => {
    const c = completeContract();
    c.goals = ['legacy goal', { description: 'judged goal', type: GOAL_TYPE.LLM_AS_JUDGE, rubric_ref: 'r' }];
    expect(validateLoopContract(c).valid).toBe(true);
  });
});

// SD-LEO-INFRA-LOOP-CONTRACT-GOAL-TYPE-BUDGET-001 (FR-2): optional budget declaration.
describe('budget declaration (FR-2)', () => {
  it('declares "budget" as a known field', () => {
    expect(LOOP_CONTRACT_FIELDS).toContain('budget');
  });

  it('an absent budget is valid (optional)', () => {
    expect(validateLoopContract(completeContract()).valid).toBe(true);
  });

  it('a well-formed budget is valid', () => {
    const c = completeContract();
    c.budget = { tokens_per_run_estimate: 1500, daily_max_runs: 24, pause_if_budget_below_pct: 10 };
    expect(validateLoopContract(c)).toEqual({ valid: true, errors: [] });
  });

  it('a negative numeric budget field is invalid', () => {
    const c = completeContract();
    c.budget = { daily_max_runs: -1 };
    const res = validateLoopContract(c);
    expect(res.valid).toBe(false);
    expect(res.errors.join(' ')).toContain('daily_max_runs');
  });

  it('pause_if_budget_below_pct > 100 is invalid', () => {
    const c = completeContract();
    c.budget = { pause_if_budget_below_pct: 150 };
    const res = validateLoopContract(c);
    expect(res.valid).toBe(false);
    expect(res.errors.join(' ')).toContain('pause_if_budget_below_pct');
  });

  it('a non-object budget is invalid', () => {
    const c = completeContract();
    c.budget = 'cheap';
    expect(validateLoopContract(c).valid).toBe(false);
  });

  it('a null budget is invalid (null is typeof object — must be explicitly rejected)', () => {
    const c = completeContract();
    c.budget = null;
    expect(validateLoopContract(c).valid).toBe(false);
  });

  it('pause_if_budget_below_pct = 0 is valid (0 is a real number, not a falsy reject)', () => {
    const c = completeContract();
    c.budget = { pause_if_budget_below_pct: 0 };
    expect(validateLoopContract(c)).toEqual({ valid: true, errors: [] });
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
