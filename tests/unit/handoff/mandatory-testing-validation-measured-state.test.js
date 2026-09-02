import { describe, it, expect } from 'vitest';
import { resolveMeasuredState } from '../../../scripts/modules/handoff/executors/exec-to-plan/gates/mandatory-testing-validation.js';

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
});
