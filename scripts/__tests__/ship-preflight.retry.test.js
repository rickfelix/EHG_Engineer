/**
 * Integration test for the ship-preflight retry-on-inconclusive wrapper
 * (SD-LEO-INFRA-TESTEXEC-TIMEOUT-INCONCLUSIVE-001, FR-2).
 *
 * A fleet-load timeout classifies as 'inconclusive' (TestExecutionVerifier),
 * not a genuine failure. resolveTestExecutionWithRetry() must retry exactly
 * once with backoff: a transient inconclusive-then-pass must NOT block the
 * ship, while two consecutive inconclusive results must hard-block (retry
 * budget exhausted) so a chronically overloaded fleet doesn't silently pass.
 */
import { describe, it, expect, vi } from 'vitest';
import { resolveTestExecutionWithRetry } from '../ship-preflight.js';

function fakeVerifier(sequence) {
  let call = 0;
  return { verify: vi.fn(async () => sequence[Math.min(call++, sequence.length - 1)]) };
}

describe('resolveTestExecutionWithRetry (SD-LEO-INFRA-TESTEXEC-TIMEOUT-INCONCLUSIVE-001 FR-2)', () => {
  it('does not retry when the first result is a genuine pass', async () => {
    const verifier = fakeVerifier([{ passed: true, outcome: 'pass', details: 'ok', warnings: [] }]);
    const noopSleep = vi.fn(async () => {});

    const result = await resolveTestExecutionWithRetry(verifier, { sleepFn: noopSleep, log: () => {} });

    expect(result.outcome).toBe('pass');
    expect(result.passed).toBe(true);
    expect(verifier.verify).toHaveBeenCalledTimes(1);
    expect(noopSleep).not.toHaveBeenCalled();
  });

  it('does not retry a genuine failure — hard-blocks immediately (TS-6 regression guard)', async () => {
    const verifier = fakeVerifier([{ passed: false, outcome: 'fail', details: '2 failures', warnings: [] }]);
    const noopSleep = vi.fn(async () => {});

    const result = await resolveTestExecutionWithRetry(verifier, { sleepFn: noopSleep, log: () => {} });

    expect(result.outcome).toBe('fail');
    expect(result.passed).toBe(false);
    expect(verifier.verify).toHaveBeenCalledTimes(1);
    expect(noopSleep).not.toHaveBeenCalled();
  });

  it('TS-5: retries once on inconclusive; a genuine pass on retry does NOT block the ship', async () => {
    const verifier = fakeVerifier([
      { passed: true, outcome: 'inconclusive', details: 'killed under load', warnings: [] },
      { passed: true, outcome: 'pass', details: 'all tests passed', warnings: [] }
    ]);
    const noopSleep = vi.fn(async () => {});

    const result = await resolveTestExecutionWithRetry(verifier, { sleepFn: noopSleep, log: () => {} });

    expect(result.outcome).toBe('pass');
    expect(result.passed).toBe(true);
    expect(verifier.verify).toHaveBeenCalledTimes(2);
    expect(noopSleep).toHaveBeenCalledTimes(1);
  });

  it('TS-6: two consecutive inconclusive results hard-block (retry budget exhausted)', async () => {
    const verifier = fakeVerifier([
      { passed: true, outcome: 'inconclusive', details: 'killed under load (attempt 1)', warnings: ['w1'] },
      { passed: true, outcome: 'inconclusive', details: 'killed under load (attempt 2)', warnings: ['w2'] }
    ]);
    const noopSleep = vi.fn(async () => {});

    const result = await resolveTestExecutionWithRetry(verifier, { sleepFn: noopSleep, log: () => {} });

    expect(result.outcome).toBe('fail');
    expect(result.passed).toBe(false);
    expect(verifier.verify).toHaveBeenCalledTimes(2);
    expect(result.details).toMatch(/retry also inconclusive/i);
    expect(result.warnings.some((w) => /chronic/i.test(w))).toBe(true);
  });

  it('a genuine failure on the retry attempt hard-blocks as a real failure, not a retry-exhausted inconclusive', async () => {
    const verifier = fakeVerifier([
      { passed: true, outcome: 'inconclusive', details: 'killed under load', warnings: [] },
      { passed: false, outcome: 'fail', details: '1 failure on retry', warnings: [] }
    ]);
    const noopSleep = vi.fn(async () => {});

    const result = await resolveTestExecutionWithRetry(verifier, { sleepFn: noopSleep, log: () => {} });

    expect(result.outcome).toBe('fail');
    expect(result.passed).toBe(false);
    expect(result.details).toBe('1 failure on retry');
  });
});
