// QF-20260911-878 — worker seats silently inherited whatever model the terminal that spawned them
// last had selected. This is the single per-seat-class model policy, so a builder, a hand-start
// recipe printer, and (in a follow-up) a SessionStart mismatch check all read the same answer.
import { describe, it, expect } from 'vitest';
import { seatClassFor, policyModelFor, checkModelMismatch, recipeLine } from '../../../lib/fleet/model-policy.cjs';

describe('model-policy: seat-class classification', () => {
  it('classifies a role seat (adam/solomon/michael/coordinator) as class "role", pinned to Fable', () => {
    for (const role of ['adam', 'solomon', 'michael', 'coordinator']) {
      expect(seatClassFor({ role })).toBe('role');
    }
    expect(policyModelFor('role')).toBe('claude-fable-5-1');
  });

  it('classifies a seat with no role, or an unrecognized role, as class "worker", pinned to Opus', () => {
    expect(seatClassFor({})).toBe('worker');
    expect(seatClassFor({ role: undefined })).toBe('worker');
    expect(seatClassFor({ role: 'something-else' })).toBe('worker');
    expect(policyModelFor('worker')).toBe('claude-opus-5');
  });

  it('is case-insensitive on role', () => {
    expect(seatClassFor({ role: 'SOLOMON' })).toBe('role');
  });
});

describe('model-policy: checkModelMismatch (the QF\'s own named acceptance test)', () => {
  it('a fixture worker seat measured running Fable trips the mismatch', () => {
    const result = checkModelMismatch({ role: undefined, model: 'claude-fable-5-1' });
    expect(result.mismatch).toBe(true);
    expect(result.seatClass).toBe('worker');
    expect(result.expectedModel).toBe('claude-opus-5');
    expect(result.observedModel).toBe('claude-fable-5-1');
  });

  it('a worker seat measured running the policy model does NOT trip', () => {
    expect(checkModelMismatch({ model: 'claude-opus-5' }).mismatch).toBe(false);
  });

  it('a version bump within the same model family is NOT a false mismatch', () => {
    expect(checkModelMismatch({ model: 'claude-opus-5.1' }).mismatch).toBe(false);
  });

  it('a role seat measured running Fable does NOT trip (it is on-policy)', () => {
    expect(checkModelMismatch({ role: 'solomon', model: 'claude-fable-5-1' }).mismatch).toBe(false);
  });

  it('a role seat measured running a worker model DOES trip', () => {
    const result = checkModelMismatch({ role: 'adam', model: 'claude-sonnet-5' });
    expect(result.mismatch).toBe(true);
    expect(result.seatClass).toBe('role');
    expect(result.expectedModel).toBe('claude-fable-5-1');
  });

  it('an absent or unrecognized observed model never trips -- cannot assert a mismatch on data it does not have', () => {
    expect(checkModelMismatch({ role: undefined, model: undefined }).mismatch).toBe(false);
    expect(checkModelMismatch({ role: undefined, model: null }).mismatch).toBe(false);
    expect(checkModelMismatch({ role: undefined, model: 'unknown' }).mismatch).toBe(false);
  });
});

describe('model-policy: recipeLine (the QF\'s own named acceptance test)', () => {
  it('the recipe printer emits the correct --model flag for each seat class', () => {
    expect(recipeLine('worker')).toBe('claude --model claude-opus-5');
    expect(recipeLine('role')).toBe('claude --model claude-fable-5-1');
  });
});
