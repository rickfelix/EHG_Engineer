/**
 * SD-FDBK-INFRA-TESTING-VERDICT-ROWS-001 FR-4 / TS-9.
 *
 * Prior to this SD, lib/sub-agents/testing/index.js's MAINLINE executed-test branch (real
 * Playwright/E2E runs, via executeE2ETests or buildPhase3FromEvidence) stored counts only in
 * results.findings.phase3_execution -- never translated into metadata.test_execution, the
 * field mandatory-testing-validation.js and storeSubAgentResults' new guard (FR-1) both read.
 * Only the policy_non_applicable_* early-exit branches called buildTestExecution(). This pins
 * the fix: buildMainlinePhase3TestExecution() correctly maps a real phase3 result.
 */
import { describe, it, expect } from 'vitest';
import { buildMainlinePhase3TestExecution } from '../../../lib/sub-agents/testing/index.js';
import { isMeasuredExecution } from '../../../lib/sub-agents/testing/test-execution-record.js';

describe('buildMainlinePhase3TestExecution (FR-4, TS-9)', () => {
  it('maps a genuine passing E2E run to the canonical test_execution shape', () => {
    const phase3 = { tests_executed: 10, tests_passed: 10, failed_tests: 0, skipped_tests: 0 };
    const result = buildMainlinePhase3TestExecution(phase3);
    expect(result).toEqual({
      tests_executed: 10,
      tests_passed: 10,
      tests_failed: 0,
      tests_skipped: 0,
      artifact_sha: null,
      runner: 'playwright',
    });
    expect(isMeasuredExecution(result)).toBe(true);
  });

  it('maps a run with failures correctly (still measured, just not a clean pass)', () => {
    const phase3 = { tests_executed: 10, tests_passed: 7, failed_tests: 3, skipped_tests: 0 };
    const result = buildMainlinePhase3TestExecution(phase3);
    expect(result.tests_failed).toBe(3);
    expect(isMeasuredExecution(result)).toBe(true);
  });

  it('a zero-executed phase3 (e.g. E2E not applicable / cache miss) is NOT measured', () => {
    const phase3 = { tests_executed: 0, tests_passed: 0, failed_tests: 0, skipped_tests: 0 };
    const result = buildMainlinePhase3TestExecution(phase3);
    expect(isMeasuredExecution(result)).toBe(false);
  });

  it('handles a missing/undefined phase3 field gracefully (coerces to 0, never throws)', () => {
    const result = buildMainlinePhase3TestExecution({});
    expect(result.tests_executed).toBe(0);
    expect(isMeasuredExecution(result)).toBe(false);
  });
});
