import { describe, it, expect } from 'vitest';
import { resolveMeasuredState } from '../../../scripts/modules/handoff/executors/exec-to-plan/gates/mandatory-testing-validation.js';
import { buildTestExecution } from '../../../lib/sub-agents/testing/test-execution-record.js';

describe('resolveMeasuredState (SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-012 FR-3)', () => {
  it('TS-6: returns null (not undefined) when neither test_execution nor metadata.measured exists -- genuinely no evidence', () => {
    const result = { metadata: {} };
    expect(resolveMeasuredState(result)).toBeNull();
  });

  it('TS-6: returns null when metadata itself is absent', () => {
    const result = {};
    expect(resolveMeasuredState(result)).toBeNull();
  });

  it('returns true when test_execution has tests_executed > 0', () => {
    const result = { metadata: { test_execution: { tests_executed: 10, tests_passed: 10, tests_failed: 0, tests_skipped: 0 } } };
    expect(resolveMeasuredState(result)).toBe(true);
  });

  it('returns false when test_execution has tests_executed = 0', () => {
    const result = { metadata: { test_execution: { tests_executed: 0 } } };
    expect(resolveMeasuredState(result)).toBe(false);
  });

  it('falls back to the legacy metadata.measured boolean when test_execution is absent', () => {
    expect(resolveMeasuredState({ metadata: { measured: false } })).toBe(false);
    expect(resolveMeasuredState({ metadata: { measured: true } })).toBe(true);
  });

  it('TS-7: passes through an object-shaped metadata.measured (measurement-facts rows) unaffected -- never misclassified as false or null', () => {
    const factObject = { corpus: { total: 42 }, regressed_count_live: 0 };
    const result = resolveMeasuredState({ metadata: { measured: factObject } });
    expect(result).toBe(factObject);
    expect(result).not.toBe(false);
    expect(result).not.toBeNull();
  });

  it('test_execution takes priority over a stale metadata.measured when both are present', () => {
    const result = {
      metadata: {
        test_execution: { tests_executed: 5, tests_passed: 5, tests_failed: 0, tests_skipped: 0 },
        measured: false, // stale/contradictory legacy flag -- structured field wins per SC#6
      },
    };
    expect(resolveMeasuredState(result)).toBe(true);
  });

  // RCA 2026-09-02 corrective (FR-1 partial-shape fix) -- these pin the SECOND defect the RCA
  // found: resolveMeasuredState previously returned `false` (REQUIRED-tier hard block, score 0)
  // for legacy partial-shape blocks that carry real evidence, scoring them WORSE than a row with
  // no block at all (which correctly resolves to null / advisory 70). Fixed at the
  // isMeasuredExecution layer; these tests exercise it through the gate's own entry point.

  it('null (not false) when test_execution lacks tests_executed but carries other real counters (legacy partial shape) -- never worse than "no block at all"', () => {
    expect(resolveMeasuredState({ metadata: { test_execution: { tests_passed: 960, tests_failed: 0 } } })).toBeNull();
    expect(resolveMeasuredState({ metadata: { test_execution: { tests_run: 224, tests_passed: 224 } } })).toBeNull();
  });

  it('null (not true/100) for an incomplete-but-tests_executed-present shape -- pins the defense-in-depth completeness check, not just "does the gate return 100"', () => {
    expect(resolveMeasuredState({ metadata: { test_execution: { tests_executed: 500, tests_failed: 500 } } })).toBeNull();
  });

  it('contract: buildTestExecution() output always satisfies the trigger/reader completeness invariant -- all four keys present, so it never falls into the partial-shape null case', () => {
    const te = buildTestExecution({ executed: 10, passed: 8, failed: 2, skipped: 0 });
    expect(['tests_executed', 'tests_passed', 'tests_failed', 'tests_skipped'].every((k) => k in te)).toBe(true);
    expect(resolveMeasuredState({ metadata: { test_execution: te } })).toBe(true);
  });
});
