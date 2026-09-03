// QF-20260903-748 (b): TESTING is required for PLAN-TO-EXEC, whose evidence phase is PLAN_PRD —
// before any code exists. tests_executed === 0 is the EXPECTED state there, but the prospective
// arm read it as "you skipped the tests" and returned BLOCKED at confidence 100 with NO critical
// issues: a blocking verdict recording zero measurement.
//
// Measured before the fix: 10 of the last 12 BLOCKED TESTING rows carried critical_issues: []
// and an empty summary.
//
// These pin the replacement AND the things that must NOT change: a real critical issue still
// blocks at this phase, and post-implementation verdicts are untouched.

import { describe, it, expect } from 'vitest';
import { generateVerdict } from '../../../lib/sub-agents/testing/phases/phase5-verdict.js';
import { assessPrdTestStrategy } from '../../../lib/sub-agents/testing/index.js';

const baseResults = (overrides = {}) => ({
  critical_issues: [],
  warnings: [],
  findings: { phase3_execution: { tests_executed: 0, failed_tests: 0 } },
  ...overrides
});

const scenario = (over = {}) => ({ id: 'TS-1', scenario: 'does a thing', when: 'x', then: 'y', ...over });

describe('assessPrdTestStrategy', () => {
  it('is adequate for >=5 executable scenarios that cover a failure condition', () => {
    const prd = { test_scenarios: [
      scenario({ id: 'TS-1' }), scenario({ id: 'TS-2' }), scenario({ id: 'TS-3' }),
      scenario({ id: 'TS-4' }), scenario({ id: 'TS-5', then: 'it refuses with an error' })
    ] };
    const r = assessPrdTestStrategy(prd);
    expect(r.adequate).toBe(true);
    expect(r.scenario_count).toBe(5);
    expect(r.gaps).toEqual([]);
  });

  it('is NOT adequate when every scenario is a happy path — the half that actually goes missing', () => {
    const prd = { test_scenarios: Array.from({ length: 6 }, (_, i) => scenario({ id: `TS-${i}`, then: 'it succeeds' })) };
    const r = assessPrdTestStrategy(prd);
    expect(r.adequate).toBe(false);
    expect(r.gaps.join(' ')).toMatch(/error or edge/);
  });

  it('is NOT adequate below the PRD contract minimum of 5 scenarios', () => {
    const prd = { test_scenarios: [scenario({ then: 'error' }), scenario()] };
    const r = assessPrdTestStrategy(prd);
    expect(r.adequate).toBe(false);
    expect(r.gaps.join(' ')).toMatch(/below the PRD contract minimum/);
  });

  it('flags title-only scenarios as not executable — a list of titles asserts nothing', () => {
    const prd = { test_scenarios: [
      { id: 'TS-1', scenario: 'a title only' }, scenario({ then: 'error' }),
      scenario(), scenario(), scenario()
    ] };
    const r = assessPrdTestStrategy(prd);
    expect(r.adequate).toBe(false);
    expect(r.gaps.join(' ')).toMatch(/lack a when\/then pair/);
  });

  it('reports not-assessed rather than adequate when there is no PRD', () => {
    const r = assessPrdTestStrategy(null);
    expect(r.assessed).toBe(false);
    expect(r.adequate).toBe(false);
  });

  it('treats a missing or non-array test_scenarios as zero, not as a crash', () => {
    for (const prd of [{}, { test_scenarios: null }, { test_scenarios: 'nope' }]) {
      const r = assessPrdTestStrategy(prd);
      expect(r.assessed).toBe(true);
      expect(r.scenario_count).toBe(0);
      expect(r.adequate).toBe(false);
    }
  });
});

describe('generateVerdict — pre-implementation NEVER returns BLOCKED for "nothing ran yet"', () => {
  it('PASSes when the PRD strategy is adequate, instead of the old empty BLOCKED', () => {
    const results = baseResults();
    results.findings.prd_test_strategy = { pre_implementation: true, adequate: true, reason: 'ok', gaps: [] };
    const v = generateVerdict(results, 'prospective');
    expect(v.verdict).toBe('PASS');
    expect(v.justification).toMatch(/no code exists yet/);
  });

  it('CONDITIONAL_PASSes with the gaps named when the strategy is thin', () => {
    const results = baseResults();
    results.findings.prd_test_strategy = {
      pre_implementation: true, adequate: false, reason: 'thin', gaps: ['PRD declares no test_scenarios']
    };
    const v = generateVerdict(results, 'prospective');
    expect(v.verdict).toBe('CONDITIONAL_PASS');
    expect(v.conditions.join(' ')).toMatch(/PRD declares no test_scenarios/);
  });

  it('never returns BLOCKED in the pre-implementation branch, adequate or not', () => {
    for (const adequate of [true, false]) {
      const results = baseResults();
      results.findings.prd_test_strategy = { pre_implementation: true, adequate, reason: 'r', gaps: [] };
      expect(generateVerdict(results, 'prospective').verdict).not.toBe('BLOCKED');
    }
  });
});

describe('generateVerdict — what must NOT change', () => {
  it('a genuine critical issue STILL blocks at the pre-implementation phase', () => {
    // The pre-implementation branch is placed AFTER critical_issues on purpose. Without this,
    // the fix would suppress real blockers at PLAN_PRD, not just the phantom one.
    const results = baseResults({ critical_issues: [{ severity: 'CRITICAL', issue: 'a real defect' }] });
    results.findings.prd_test_strategy = { pre_implementation: true, adequate: true, reason: 'ok', gaps: [] };
    expect(generateVerdict(results, 'prospective').verdict).toBe('BLOCKED');
  });

  it('post-implementation still BLOCKS on zero executed tests (the original arm is intact)', () => {
    // No prd_test_strategy marker => not pre-implementation => old behaviour must survive.
    const v = generateVerdict(baseResults(), 'prospective');
    expect(v.verdict).toBe('BLOCKED');
    expect(v.recommendations.join(' ')).toMatch(/Execute E2E tests before approval/);
  });

  it('post-implementation still BLOCKS on a sub-threshold pass rate', () => {
    const results = baseResults();
    results.findings.phase3_execution = { tests_executed: 10, tests_passed: 5, failed_tests: 5 };
    expect(generateVerdict(results, 'prospective').verdict).toBe('BLOCKED');
  });
});
