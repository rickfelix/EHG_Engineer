/**
 * Regression test for QF-20260605-024.
 *
 * ResultBuilder.gateFailure() previously did `${issues.join('; ')}` where
 * gateResult.issues is an array of objects ({ code, message, severity, ... }),
 * yielding "[object Object]" in the failure message and in the captured
 * failure-pattern issue_summary (issue_pattern PAT-HF-PLANTOEXEC-82e31435).
 * The fix maps each issue to a readable string (message -> code -> JSON) before
 * joining, while keeping the original structured issues in details.
 */
import { describe, it, expect } from 'vitest';
import { ResultBuilder } from './ResultBuilder.js';

describe('ResultBuilder.gateFailure issue rendering (QF-20260605-024)', () => {
  it('renders object issues via their message, not "[object Object]"', () => {
    const result = ResultBuilder.gateFailure('GATE_INTEGRATION_SECTION_VALIDATION', {
      issues: [{ code: 'X_FAIL', message: 'Integration section is missing', severity: 'error' }]
    });
    expect(result.message).toContain('Integration section is missing');
    expect(result.message).not.toContain('[object Object]');
  });

  it('joins multiple object issues with "; " (message, then code fallback)', () => {
    const result = ResultBuilder.gateFailure('GATE_X', {
      issues: [{ message: 'first problem' }, { code: 'SECOND_CODE' }]
    });
    expect(result.message).toBe('GATE_X validation failed - first problem; SECOND_CODE');
    expect(result.message).not.toContain('[object Object]');
  });

  it('passes string issues through unchanged (back-compat)', () => {
    const result = ResultBuilder.gateFailure('GATE_Y', { issues: ['plain string issue'] });
    expect(result.message).toBe('GATE_Y validation failed - plain string issue');
  });

  it('falls back to "Check details" when there are no issues', () => {
    const result = ResultBuilder.gateFailure('GATE_Z', { issues: [] });
    expect(result.message).toBe('GATE_Z validation failed - Check details');
  });

  it('preserves the structured gateResult in details', () => {
    const gateResult = { issues: [{ message: 'm', code: 'c' }], score: 0 };
    const result = ResultBuilder.gateFailure('GATE_D', gateResult);
    expect(result.details).toBe(gateResult);
    expect(result.details.issues[0]).toEqual({ message: 'm', code: 'c' });
  });
});

/**
 * Regression tests for QF-20260815-200 (ULTRAREVIEW A1 bug_007).
 *
 * Both gateFailure's issue-mapping and systemError's message extraction fall back to
 * JSON.stringify for an object with no .message/.code -- JSON.stringify itself throws on a
 * circular object graph, so the LAST-RESORT error builder threw instead of returning a
 * structured error response. String() never throws and is the safe fallback.
 */
describe('ResultBuilder circular-value fallback (QF-20260815-200)', () => {
  function circularValue() {
    const o = {};
    o.self = o;
    return o;
  }

  it('gateFailure: a circular issue object does not throw and renders via String() instead of JSON.stringify', () => {
    expect(() => ResultBuilder.gateFailure('GATE_CIRC', { issues: [circularValue()] })).not.toThrow();
    const result = ResultBuilder.gateFailure('GATE_CIRC', { issues: [circularValue()] });
    expect(result.success).toBe(false);
    expect(result.message).toContain('[object Object]');
  });

  it('systemError: a circular thrown value does not throw and returns a structured error response', () => {
    expect(() => ResultBuilder.systemError(circularValue())).not.toThrow();
    const result = ResultBuilder.systemError(circularValue());
    expect(result.success).toBe(false);
    expect(result.systemError).toBe(true);
    expect(result.message).toBe('[object Object]');
  });

  it('systemError: a non-circular plain object still serializes via JSON.stringify (unchanged behavior)', () => {
    const result = ResultBuilder.systemError({ foo: 'bar' });
    expect(result.message).toBe('{"foo":"bar"}');
  });
});