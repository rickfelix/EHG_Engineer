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