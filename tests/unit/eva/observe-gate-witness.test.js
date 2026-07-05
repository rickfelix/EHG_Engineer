/**
 * SD-LEO-INFRA-INDEPENDENT-GATE-WITNESS-001-D: pure logic tests for the
 * observe-only wrapper -- no DB access (that's covered by the live
 * integration test).
 */
import { describe, it, expect } from 'vitest';
import { withObserveOnlyWitness } from '../../../lib/eva/observe-gate-witness.js';

describe('withObserveOnlyWitness()', () => {
  it('returns the original validator result completely unchanged (passing case)', async () => {
    const originalResult = { passed: true, score: 100, max_score: 100, issues: [], warnings: [] };
    const gate = { name: 'TEST_GATE', validator: async () => originalResult, required: true };
    const wrapped = withObserveOnlyWitness('TEST_GATE', gate);

    // No ctx.sd.claiming_session_id -> observeGateWitness no-ops silently, never throws.
    const result = await wrapped.validator({});
    expect(result).toEqual(originalResult);
  });

  it('returns the original validator result completely unchanged (failing case)', async () => {
    const originalResult = { passed: false, score: 0, max_score: 100, issues: ['nope'], warnings: [] };
    const gate = { name: 'TEST_GATE', validator: async () => originalResult, required: true };
    const wrapped = withObserveOnlyWitness('TEST_GATE', gate);

    const result = await wrapped.validator({});
    expect(result).toEqual(originalResult);
  });

  it('preserves all other gate properties (name, required, blocking, etc.)', () => {
    const gate = { name: 'TEST_GATE', validator: async () => ({}), required: true, blocking: false, remediation: 'fix it' };
    const wrapped = withObserveOnlyWitness('TEST_GATE', gate);

    expect(wrapped.name).toBe('TEST_GATE');
    expect(wrapped.required).toBe(true);
    expect(wrapped.blocking).toBe(false);
    expect(wrapped.remediation).toBe('fix it');
  });

  it('never throws even when ctx is missing entirely', async () => {
    const gate = { name: 'TEST_GATE', validator: async () => ({ passed: true }), required: true };
    const wrapped = withObserveOnlyWitness('TEST_GATE', gate);

    await expect(wrapped.validator(undefined)).resolves.toEqual({ passed: true });
  });

  it('never throws even when the original validator itself throws', async () => {
    const gate = { name: 'TEST_GATE', validator: async () => { throw new Error('boom'); }, required: true };
    const wrapped = withObserveOnlyWitness('TEST_GATE', gate);

    // The observe-only wrapper does not swallow the ORIGINAL validator's own errors --
    // only witness-recording failures are swallowed. A genuinely broken gate must still fail loudly.
    await expect(wrapped.validator({})).rejects.toThrow('boom');
  });
});
