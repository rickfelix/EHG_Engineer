// QF-20260525-378: handoff precheck must fold a FAILED prerequisite preflight
// into its verdict, for parity with execute() (which hard-fails on it).
// Pre-fix, precheck only logged the failed preflight and reported
// success=result.passed, so precheck PASSED while execute FAILED on
// USER_STORIES_MISSING (false-pass). Unit-test the extracted pure helper.

import { describe, it, expect } from 'vitest';
import { applyPreflightToVerdict } from '../../../scripts/modules/handoff/HandoffOrchestrator.js';

const failedPreflight = {
  passed: false,
  issues: [{ code: 'USER_STORIES_MISSING', message: 'No user stories for SD' }],
};

describe('QF-378 applyPreflightToVerdict', () => {
  it('failed preflight forces success=false even when gates pass', () => {
    const v = applyPreflightToVerdict({ passed: true, issues: [], failedGates: [] }, failedPreflight);
    expect(v.success).toBe(false);
    expect(v.failedGates.some(g => g.name === 'PREREQUISITE_PREFLIGHT')).toBe(true);
    expect(v.issues.some(i => i.gate === 'PREREQUISITE_PREFLIGHT' && /USER_STORIES_MISSING/.test(i.issue))).toBe(true);
  });

  it('passed preflight preserves gate verdict and adds no preflight gate', () => {
    const v = applyPreflightToVerdict({ passed: true, issues: [], failedGates: [] }, { passed: true, issues: [] });
    expect(v.success).toBe(true);
    expect(v.failedGates.some(g => g.name === 'PREREQUISITE_PREFLIGHT')).toBe(false);
  });

  it('failing gates stay failing regardless of preflight', () => {
    const v = applyPreflightToVerdict(
      { passed: false, issues: [{ gate: 'GATE2', issue: 'low score' }], failedGates: [{ name: 'GATE2', issues: ['low'] }] },
      { passed: true, issues: [] }
    );
    expect(v.success).toBe(false);
    expect(v.failedGates.some(g => g.name === 'GATE2')).toBe(true);
  });

  it('null/absent preflight is treated as not-failed', () => {
    expect(applyPreflightToVerdict({ passed: true }, null).success).toBe(true);
    expect(applyPreflightToVerdict({ passed: true }, undefined).success).toBe(true);
  });

  it('merges preflight issues ahead of existing gate issues', () => {
    const v = applyPreflightToVerdict(
      { passed: false, issues: [{ gate: 'GATE2', issue: 'x' }], failedGates: [{ name: 'GATE2', issues: ['x'] }] },
      failedPreflight
    );
    expect(v.issues[0].gate).toBe('PREREQUISITE_PREFLIGHT');
    expect(v.failedGates[0].name).toBe('PREREQUISITE_PREFLIGHT');
  });
});
