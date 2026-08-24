/**
 * SD-LEO-INFRA-MINUS-DISPOSITION-RAILS-001 FR-4.
 * TS-6, TS-13, TS-14: disposition loop stage ordering, gate_status branching, retry cap,
 * and retry-bypasses-dedup behavior.
 */
import { describe, it, expect, vi } from 'vitest';
import { runDispositionLoop, isVerified, STAGES, MAX_RETRIES } from '../../../lib/disposition/disposition-loop.js';

function makeDeps(overrides = {}) {
  return {
    checkGateStatus: vi.fn(async () => ({ gate_status: 'WARN', passed: true })),
    invokeDiagnosis: vi.fn(async () => ({ diagnosed: true })),
    revise: vi.fn(async () => {}),
    recordLearning: vi.fn(async () => {}),
    escalate: vi.fn(async () => {}),
    ...overrides
  };
}

describe('isVerified — TS-13: branches on gate_status, never the boolean passed', () => {
  it('a WARN verdict with passed:true is NOT verified (FR-2 warn-only trap)', () => {
    expect(isVerified({ gate_status: 'WARN', passed: true })).toBe(false);
  });

  it('a FAIL verdict is NOT verified', () => {
    expect(isVerified({ gate_status: 'FAIL', passed: false })).toBe(false);
  });

  it('only a PASS verdict is verified', () => {
    expect(isVerified({ gate_status: 'PASS', passed: true })).toBe(true);
  });

  it('a BLOCKED verdict (hard-enforce mode) is NOT verified', () => {
    expect(isVerified({ gate_status: 'BLOCKED', passed: false })).toBe(false);
  });

  it('missing/malformed gate result is NOT verified (fail-closed on the decision itself)', () => {
    expect(isVerified(null)).toBe(false);
    expect(isVerified(undefined)).toBe(false);
    expect(isVerified({})).toBe(false);
  });
});

describe('runDispositionLoop — stage sequencing (TS-6)', () => {
  it('resolves on the first pass: full stage sequence, no retry', async () => {
    const deps = makeDeps({ checkGateStatus: vi.fn(async () => ({ gate_status: 'PASS' })) });
    const result = await runDispositionLoop({ rcrId: 'rcr-1' }, deps);

    expect(result.outcome).toBe('RESOLVED');
    expect(result.attempts).toBe(1);
    expect(result.trace).toEqual([
      'detect', 'classify', 'diagnose', 'revise', 're-evaluate', 'verify', 'record'
    ]);
    expect(deps.invokeDiagnosis).toHaveBeenCalledTimes(1);
    expect(deps.escalate).not.toHaveBeenCalled();
  });

  it('every named stage in STAGES appears somewhere in a resolved-after-retry trace', async () => {
    let call = 0;
    const deps = makeDeps({
      checkGateStatus: vi.fn(async () => (++call >= 2 ? { gate_status: 'PASS' } : { gate_status: 'WARN' }))
    });
    const result = await runDispositionLoop({ rcrId: 'rcr-2' }, deps);

    expect(result.outcome).toBe('RESOLVED');
    for (const stage of STAGES) {
      if (stage === 'escalate') continue; // not reached on a resolved outcome
      expect(result.trace).toContain(stage);
    }
  });
});

describe('runDispositionLoop — retry cap (TS-14, hard cap at MAX_RETRIES=2)', () => {
  it('never verifying escalates after exactly maxRetries+1 diagnosis attempts', async () => {
    const deps = makeDeps(); // checkGateStatus always WARN -> never verified
    const result = await runDispositionLoop({ rcrId: 'rcr-3' }, deps);

    expect(result.outcome).toBe('ESCALATED');
    expect(result.attempts).toBe(MAX_RETRIES + 1); // 1 initial + 2 retries = 3
    expect(deps.invokeDiagnosis).toHaveBeenCalledTimes(MAX_RETRIES + 1);
    expect(deps.escalate).toHaveBeenCalledTimes(1);
    expect(deps.escalate).toHaveBeenCalledWith(
      { rcrId: 'rcr-3' },
      expect.objectContaining({ outcome: 'ESCALATED', attempts: MAX_RETRIES + 1 })
    );
  });

  it('a 3rd retry attempt never executes — the guard is structural, not a post-hoc count check', async () => {
    const deps = makeDeps();
    await runDispositionLoop({ rcrId: 'rcr-4' }, deps);

    // Exactly maxRetries+1 diagnose calls, never more — proves the loop bound, not a
    // separately-checked counter that could theoretically be raced past.
    expect(deps.invokeDiagnosis.mock.calls.length).toBe(MAX_RETRIES + 1);
  });

  it('a custom maxRetries is honored', async () => {
    const deps = makeDeps();
    const result = await runDispositionLoop({ rcrId: 'rcr-5' }, deps, 0);

    expect(result.outcome).toBe('ESCALATED');
    expect(result.attempts).toBe(1); // only the initial attempt, zero retries
    expect(deps.invokeDiagnosis).toHaveBeenCalledTimes(1);
  });

  it('retry() label only appears in the trace for attempts after the first', async () => {
    const deps = makeDeps();
    const result = await runDispositionLoop({ rcrId: 'rcr-6' }, deps);

    const retryCount = result.trace.filter(s => s === 'retry').length;
    expect(retryCount).toBe(MAX_RETRIES); // 2 retries, not 3 (initial pass is not a "retry")
  });
});

describe('runDispositionLoop — retry re-invokes diagnosis (TS-14: bypasses external dedup)', () => {
  it('invokeDiagnosis is called on EVERY attempt, including retries, with the attempt number passed through', async () => {
    const deps = makeDeps();
    await runDispositionLoop({ rcrId: 'rcr-7' }, deps);

    expect(deps.invokeDiagnosis).toHaveBeenNthCalledWith(1, { rcrId: 'rcr-7' }, { attempt: 0 });
    expect(deps.invokeDiagnosis).toHaveBeenNthCalledWith(2, { rcrId: 'rcr-7' }, { attempt: 1 });
    expect(deps.invokeDiagnosis).toHaveBeenNthCalledWith(3, { rcrId: 'rcr-7' }, { attempt: 2 });
  });

  it('a diagnosis that resolves on retry #1 stops the loop immediately (no retry #2)', async () => {
    let call = 0;
    const deps = makeDeps({
      checkGateStatus: vi.fn(async () => (++call === 2 ? { gate_status: 'PASS' } : { gate_status: 'WARN' }))
    });
    const result = await runDispositionLoop({ rcrId: 'rcr-8' }, deps);

    expect(result.outcome).toBe('RESOLVED');
    expect(result.attempts).toBe(2); // initial + 1 retry
    expect(deps.invokeDiagnosis).toHaveBeenCalledTimes(2);
  });
});
