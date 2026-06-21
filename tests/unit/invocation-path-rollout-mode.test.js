// SD-LEO-INFRA-INVOCATION-PATH-PROOF-001-D (FR-4): advisory<->blocking rollout for the
// INVOCATION_PATH_PROOF gate. Advisory (default) surfaces violations as warnings WITHOUT failing
// (so it cannot mass-fail existing SDs on day one); block restores the -C hard-fail.
import { describe, it, expect } from 'vitest';
import { resolveInvocationMode, resolveInvocationVerdict } from '../../scripts/modules/handoff/executors/lead-final-approval/gates/invocation-path-gate.js';

const VIOLATIONS = { violations: [{ file: 'scripts/foo-loop.cjs', requires_reason: 'autonomous_suffix' }], autonomousChecked: 1 };
const NONE = { violations: [], autonomousChecked: 1 };
const REMEDIATION = ['wire it'];

describe('resolveInvocationMode', () => {
  it('defaults to advisory when the flag is unset', () => {
    expect(resolveInvocationMode({})).toBe('advisory');
  });
  it('is block only when explicitly INVOCATION_PATH_PROOF_MODE=block', () => {
    expect(resolveInvocationMode({ INVOCATION_PATH_PROOF_MODE: 'block' })).toBe('block');
    expect(resolveInvocationMode({ INVOCATION_PATH_PROOF_MODE: 'advisory' })).toBe('advisory');
    expect(resolveInvocationMode({ INVOCATION_PATH_PROOF_MODE: 'anything-else' })).toBe('advisory');
  });
});

describe('resolveInvocationVerdict', () => {
  it('advisory + violations -> PASS with violations as warnings (no mass-fail)', () => {
    const v = resolveInvocationVerdict(VIOLATIONS, 'advisory', REMEDIATION);
    expect(v.passed).toBe(true);
    expect(v.issues).toEqual([]);
    expect(v.warnings.join('\n')).toContain('scripts/foo-loop.cjs');
    expect(v.warnings.join('\n')).toContain('ADVISORY');
    expect(v.details).toMatchObject({ mode: 'advisory', violations: 1 });
  });

  it('block + violations -> FAIL with issues + remediation (the -C behavior)', () => {
    const v = resolveInvocationVerdict(VIOLATIONS, 'block', REMEDIATION);
    expect(v.passed).toBe(false);
    expect(v.score).toBe(0);
    expect(v.issues.join('\n')).toContain('scripts/foo-loop.cjs');
    expect(v.issues).toContain('wire it');
    expect(v.warnings).toEqual([]);
    expect(v.details).toMatchObject({ mode: 'block', violations: 1 });
  });

  it('no violations -> PASS in both modes', () => {
    for (const mode of ['advisory', 'block']) {
      const v = resolveInvocationVerdict(NONE, mode, REMEDIATION);
      expect(v.passed).toBe(true);
      expect(v.issues).toEqual([]);
      expect(v.warnings).toEqual([]);
      expect(v.details).toMatchObject({ mode, violations: 0 });
    }
  });
});
