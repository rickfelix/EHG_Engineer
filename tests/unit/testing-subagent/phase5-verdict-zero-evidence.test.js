/**
 * QF/F2 SD-LEO-INFRA-LEADFINAL-ACCEPTANCE-INTEGRITY-001-B
 *
 * Regression: TESTING generateVerdict() must NOT emit a passing verdict without a real
 * test result. Pre-fix defects (RED against old logic):
 *   (i)  retrospective + tests_executed:0 + zero critical issues => CONDITIONAL_PASS@75
 *        (the `userStoriesWithE2E = critical_issues.length === 0` fake-evidence).
 *   (ii) absent phase3_execution => default fall-through PASS@95 (`undefined === 0` is
 *        false so the no-tests guard is skipped).
 * A REAL run (tests_executed>0, tests_passed>0) MUST still PASS/CONDITIONAL_PASS.
 */

import { describe, it, expect } from 'vitest';
import { generateVerdict } from '../../../lib/sub-agents/testing/phases/phase5-verdict.js';

const PASSING = ['PASS', 'CONDITIONAL_PASS'];

describe('QF/F2 phase5 generateVerdict — no pass without real test evidence', () => {
  it('(i) tests_executed:0 + zero critical issues does NOT return PASS/CONDITIONAL_PASS (retrospective)', () => {
    // Retrospective is the mode where the old userStoriesWithE2E fake-evidence produced
    // a vacuous CONDITIONAL_PASS@75. This is the RED case pre-fix.
    const results = {
      findings: { phase3_execution: { tests_executed: 0, tests_passed: 0, failed_tests: 0 } },
      critical_issues: [],
      warnings: []
    };
    const out = generateVerdict(results, 'retrospective');
    expect(PASSING).not.toContain(out.verdict);
    expect(out.confidence).not.toBe(75);
  });

  it('(i-prospective) tests_executed:0 + zero critical issues does NOT pass (prospective)', () => {
    const results = {
      findings: { phase3_execution: { tests_executed: 0, tests_passed: 0, failed_tests: 0 } },
      critical_issues: [],
      warnings: []
    };
    const out = generateVerdict(results, 'prospective');
    expect(PASSING).not.toContain(out.verdict);
  });

  it('(ii) absent phase3_execution does NOT return PASS@95', () => {
    // No execution object at all — zero evidence. Pre-fix returned PASS@95 (RED).
    const results = {
      findings: {},
      critical_issues: [],
      warnings: []
    };
    const out = generateVerdict(results, 'prospective');
    expect(PASSING).not.toContain(out.verdict);
    expect(out.confidence).not.toBe(95);
    // Must be a verdict the EXEC-TO-PLAN gate rejects (not PASS/CONDITIONAL_PASS).
    expect(out.verdict).toBe('BLOCKED');
  });

  it('(iii) a real run (tests_executed>0, tests_passed>0) still returns PASS (unchanged)', () => {
    const results = {
      findings: { phase3_execution: { tests_executed: 10, tests_passed: 10, failed_tests: 0 } },
      critical_issues: [],
      warnings: []
    };
    const out = generateVerdict(results, 'prospective');
    expect(out.verdict).toBe('PASS');
    expect(PASSING).toContain(out.verdict);
  });

  it('(iii-retrospective) real retrospective evidence (tests_passed>0) still CONDITIONAL_PASSes', () => {
    // Honest retrospective path preserved: real tests passed but --full-e2e not run.
    const results = {
      findings: { phase3_execution: { tests_executed: 0, tests_passed: 8, failed_tests: 0 } },
      critical_issues: [],
      warnings: []
    };
    const out = generateVerdict(results, 'retrospective');
    expect(PASSING).toContain(out.verdict);
  });

  it('preserves negative signals: critical issues still BLOCK', () => {
    const results = {
      findings: { phase3_execution: { tests_executed: 5, tests_passed: 5, failed_tests: 0 } },
      critical_issues: [{ issue: 'boom' }],
      warnings: []
    };
    const out = generateVerdict(results, 'prospective');
    expect(out.verdict).toBe('BLOCKED');
  });
});
