/**
 * Regression tests for ResultBuilder.systemError diagnostic enhancements.
 *
 * QF-20260423-200: Previously `systemError(error)` returned only
 * { success: false, error: message, reasonCode: 'SYSTEM_ERROR' }.
 * Now it also surfaces errorClass, errorStack, sourceStep, and
 * structured reasonCode (ANALYSIS_SYNTHESIS_FAILED | RUSSIAN_JUDGE_FAILED
 * | VERIFIER_EXCEPTION) when the error was wrapped by plan-to-exec.
 */

import { describe, it, expect } from 'vitest';
import { ResultBuilder } from '../../../scripts/modules/handoff/ResultBuilder.js';

describe('ResultBuilder.systemError diagnostic enhancement (QF-20260423-200)', () => {
  it('returns structured fields from a plain Error', () => {
    const err = new TypeError('Cannot read properties of undefined');
    const result = ResultBuilder.systemError(err);

    expect(result.success).toBe(false);
    expect(result.systemError).toBe(true);
    expect(result.error).toBe('Cannot read properties of undefined');
    expect(result.message).toBe('Cannot read properties of undefined');
    expect(result.errorClass).toBe('TypeError');
    expect(result.reasonCode).toBe('SYSTEM_ERROR');
    expect(result.errorStack).toBeTruthy();
    expect(result.remediation).toContain('TypeError');
    expect(result.remediation).toContain('Stack');
  });

  it('surfaces structured reasonCode when error.name is ANALYSIS_SYNTHESIS_FAILED', () => {
    const err = new Error('ANALYSIS_SYNTHESIS_FAILED: downstream TypeError');
    err.name = 'ANALYSIS_SYNTHESIS_FAILED';
    const result = ResultBuilder.systemError(err);

    expect(result.reasonCode).toBe('ANALYSIS_SYNTHESIS_FAILED');
    expect(result.message).toContain('ANALYSIS_SYNTHESIS_FAILED');
  });

  it('surfaces structured reasonCode when error.name is RUSSIAN_JUDGE_FAILED', () => {
    const err = new Error('RUSSIAN_JUDGE_FAILED: model timeout');
    err.name = 'RUSSIAN_JUDGE_FAILED';
    expect(ResultBuilder.systemError(err).reasonCode).toBe('RUSSIAN_JUDGE_FAILED');
  });

  it('surfaces structured reasonCode when error.name is VERIFIER_EXCEPTION', () => {
    const err = new Error('VERIFIER_EXCEPTION: null chain in PlanToExecVerifier');
    err.name = 'VERIFIER_EXCEPTION';
    expect(ResultBuilder.systemError(err).reasonCode).toBe('VERIFIER_EXCEPTION');
  });

  it('includes sourceStep hint when provided', () => {
    const err = new Error('thing broke');
    const result = ResultBuilder.systemError(err, 'executeSpecific');
    expect(result.sourceStep).toBe('executeSpecific');
    expect(result.remediation).toContain('executeSpecific');
  });

  it('fills message when error has empty message (previously opaque)', () => {
    const err = new TypeError('');
    const result = ResultBuilder.systemError(err, 'executeSpecific');
    expect(result.message).toBe('TypeError thrown with no message at executeSpecific');
    expect(result.error).toBe('TypeError thrown with no message at executeSpecific');
  });

  it('handles non-Error inputs (string) without crashing', () => {
    const result = ResultBuilder.systemError('raw string failure');
    expect(result.errorClass).toBe('Unknown');
    expect(result.error).toBe('raw string failure');
    expect(result.reasonCode).toBe('SYSTEM_ERROR');
    expect(result.errorStack).toBeNull();
  });

  it('truncates stack to first 10 frames for readability', () => {
    // Construct an error with known deep stack
    function deepThrow(depth) {
      if (depth === 0) throw new Error('deep failure');
      return deepThrow(depth - 1);
    }
    try {
      deepThrow(30);
    } catch (err) {
      const result = ResultBuilder.systemError(err);
      const stackLines = result.errorStack.split('\n');
      expect(stackLines.length).toBeLessThanOrEqual(10);
    }
  });

  it('preserves non-structured error names as SYSTEM_ERROR (backward compat)', () => {
    const err = new Error('random failure');
    err.name = 'SomeOtherError';
    expect(ResultBuilder.systemError(err).reasonCode).toBe('SYSTEM_ERROR');
  });
});
