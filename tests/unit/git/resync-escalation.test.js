/**
 * SD-LEO-INFRA-ACTIVATE-INERT-STALL-001-A / FR-5, TS-5, TS-6.
 *
 * The scheduled safe-root-resync job must escalate on a SECOND consecutive identical abort,
 * never on a lone abort, and never when the reason differs between two consecutive runs.
 */
import { describe, it, expect } from 'vitest';
import { trackAbortEscalation, sanitizeEscalationState } from '../../../lib/git/resync-escalation.js';

describe('trackAbortEscalation (FR-5)', () => {
  it('TS-6: a single, non-repeating abort does NOT escalate', () => {
    const { nextState, escalated } = trackAbortEscalation(null, 'non_ff_conflict');
    expect(escalated).toBe(false);
    expect(nextState).toEqual({ lastAbortReason: 'non_ff_conflict', consecutiveCount: 1 });
  });

  it('TS-5: the SAME reason on a second consecutive run escalates', () => {
    const first = trackAbortEscalation(null, 'non_ff_conflict');
    const second = trackAbortEscalation(first.nextState, 'non_ff_conflict');
    expect(second.escalated).toBe(true);
    expect(second.nextState).toEqual({ lastAbortReason: 'non_ff_conflict', consecutiveCount: 2 });
  });

  it('TS-6: a DIFFERENT reason on the second run resets the counter and does NOT escalate', () => {
    const first = trackAbortEscalation(null, 'non_ff_conflict');
    const second = trackAbortEscalation(first.nextState, 'worktree_cwd');
    expect(second.escalated).toBe(false);
    expect(second.nextState).toEqual({ lastAbortReason: 'worktree_cwd', consecutiveCount: 1 });
  });

  it('a successful run (abortReason=null) resets state to empty', () => {
    const escalatedPrior = { lastAbortReason: 'non_ff_conflict', consecutiveCount: 2 };
    const { nextState, escalated } = trackAbortEscalation(escalatedPrior, null);
    expect(escalated).toBe(false);
    expect(nextState).toEqual({ lastAbortReason: null, consecutiveCount: 0 });
  });

  it('keeps escalating on a third, fourth... consecutive identical abort (never re-drops below threshold)', () => {
    let state = null;
    let result;
    for (let i = 0; i < 4; i += 1) {
      result = trackAbortEscalation(state, 'non_ff_conflict');
      state = result.nextState;
    }
    expect(state.consecutiveCount).toBe(4);
    expect(result.escalated).toBe(true);
  });
});

describe('sanitizeEscalationState', () => {
  it('defaults null/undefined/malformed carry-over state to empty rather than throwing', () => {
    for (const bad of [null, undefined, 'not an object', 42, []]) {
      expect(sanitizeEscalationState(bad)).toEqual({ lastAbortReason: null, consecutiveCount: 0 });
    }
  });

  it('degrades a reason-without-count or count-without-reason pairing to empty (never a phantom escalation)', () => {
    expect(sanitizeEscalationState({ lastAbortReason: 'x', consecutiveCount: 0 })).toEqual({ lastAbortReason: null, consecutiveCount: 0 });
    expect(sanitizeEscalationState({ lastAbortReason: null, consecutiveCount: 2 })).toEqual({ lastAbortReason: null, consecutiveCount: 0 });
  });

  it('passes through a well-formed state unchanged', () => {
    expect(sanitizeEscalationState({ lastAbortReason: 'x', consecutiveCount: 1 })).toEqual({ lastAbortReason: 'x', consecutiveCount: 1 });
  });
});
