/**
 * SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-C: PC-1 revert-path-verified
 */
import { describe, it, expect } from 'vitest';
import { checkRevertPathVerified } from '../../../../lib/switch-automation/prechecks/revert-path.js';

describe('PC-1: checkRevertPathVerified', () => {
  it('passes when declared + rehearsed + fresh', () => {
    const result = checkRevertPathVerified({ declared: true, rehearsalPassed: true, rehearsedAt: new Date().toISOString() });
    expect(result).toEqual({ id: 'PC-1', name: 'revert-path-verified', passed: true, reason: 'revert-path-verified' });
  });

  it('fails when not declared', () => {
    const result = checkRevertPathVerified({ declared: false, rehearsalPassed: true, rehearsedAt: new Date().toISOString() });
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('no-declared-revert-path');
  });

  it('fails when rehearsal has not passed', () => {
    const result = checkRevertPathVerified({ declared: true, rehearsalPassed: false, rehearsedAt: new Date().toISOString() });
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('no-rehearsal-evidence');
  });

  it('fails closed when rehearsalPassed is missing/null (never treated as passing)', () => {
    const result = checkRevertPathVerified({ declared: true, rehearsalPassed: null, rehearsedAt: new Date().toISOString() });
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('no-rehearsal-evidence');
  });

  it('fails when rehearsal is stale (older than maxRehearsalAgeDays)', () => {
    const staleDate = new Date(Date.now() - 91 * 86_400_000).toISOString();
    const result = checkRevertPathVerified({ declared: true, rehearsalPassed: true, rehearsedAt: staleDate }, { maxRehearsalAgeDays: 90 });
    expect(result.passed).toBe(false);
    expect(result.reason).toBe('stale-rehearsal');
  });

  it('passes when rehearsal is within the custom maxRehearsalAgeDays window', () => {
    const recentDate = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const result = checkRevertPathVerified({ declared: true, rehearsalPassed: true, rehearsedAt: recentDate }, { maxRehearsalAgeDays: 90 });
    expect(result.passed).toBe(true);
  });
});
