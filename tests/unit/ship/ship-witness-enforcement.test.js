/**
 * SD-LEO-INFRA-SHIP-WITNESS-ENFORCE-001 (Ship-witness D)
 * FR-3, FR-4: ship-witness-enforcement.mjs — gated, currently-inert enforce-flip decision.
 */
import { describe, it, expect } from 'vitest';
import { resolveEnforceMode, evaluateEnforcementDecision } from '../../../lib/ship/ship-witness-enforcement.mjs';
import { RUNG_STATUS } from '../../../lib/ship/merge-witness-ladder.mjs';

function rung(id, status) {
  return { id, status, reason: 'fixture' };
}

const ALL_PASS_VERDICT = {
  rungs: [rung('P1', RUNG_STATUS.PASS), rung('P2', RUNG_STATUS.PASS), rung('P3', RUNG_STATUS.PASS), rung('P4', RUNG_STATUS.NOT_APPLICABLE), rung('P5', RUNG_STATUS.NOT_APPLICABLE)],
};
const P2_FAIL_VERDICT = {
  rungs: [rung('P1', RUNG_STATUS.PASS), rung('P2', RUNG_STATUS.FAIL), rung('P3', RUNG_STATUS.PASS), rung('P4', RUNG_STATUS.NOT_APPLICABLE), rung('P5', RUNG_STATUS.NOT_APPLICABLE)],
};

describe('resolveEnforceMode', () => {
  it('returns "enforce" only on an exact env match', () => {
    expect(resolveEnforceMode({ SHIP_WITNESS_ENFORCE_MODE: 'enforce' })).toBe('enforce');
    expect(resolveEnforceMode({ SHIP_WITNESS_ENFORCE_MODE: 'Enforce' })).toBe('observe');
    expect(resolveEnforceMode({ SHIP_WITNESS_ENFORCE_MODE: 'true' })).toBe('observe');
  });

  it('defaults to "observe" when unset — today\'s real production state', () => {
    expect(resolveEnforceMode({})).toBe('observe');
  });
});

describe('evaluateEnforcementDecision', () => {
  it('returns observe when enforceMode is unset (default) — regardless of verdict', () => {
    const decision = evaluateEnforcementDecision({ verdict: P2_FAIL_VERDICT, readiness: { ready: true } });
    expect(decision.action).toBe('observe');
  });

  it('returns observe when enforceMode=enforce but readiness.ready=false (today\'s real readiness)', () => {
    const decision = evaluateEnforcementDecision({
      verdict: P2_FAIL_VERDICT, enforceMode: 'enforce', readiness: { ready: false },
    });
    expect(decision.action).toBe('observe');
  });

  it('returns observe when enforceMode=enforce and readiness is entirely absent', () => {
    const decision = evaluateEnforcementDecision({ verdict: P2_FAIL_VERDICT, enforceMode: 'enforce' });
    expect(decision.action).toBe('observe');
  });

  it('returns block only when BOTH enforceMode=enforce AND readiness.ready=true AND rungs fail', () => {
    const decision = evaluateEnforcementDecision({
      verdict: P2_FAIL_VERDICT, enforceMode: 'enforce', readiness: { ready: true },
    });
    expect(decision.action).toBe('block');
    expect(decision.reason).toMatch(/P2=fail/);
  });

  it('returns allow when both conditions hold and P1/P2/P3 all pass', () => {
    const decision = evaluateEnforcementDecision({
      verdict: ALL_PASS_VERDICT, enforceMode: 'enforce', readiness: { ready: true },
    });
    expect(decision.action).toBe('allow');
  });

  it('P4/P5 not_applicable never affect the decision — only P1/P2/P3 matter', () => {
    const decision = evaluateEnforcementDecision({
      verdict: ALL_PASS_VERDICT, enforceMode: 'enforce', readiness: { ready: true },
    });
    expect(decision.action).toBe('allow');
  });
});
