// QF-20260903-748: the TESTING sub-agent applied the EXEC-TO-PLAN "stories implemented" bar
// while running to satisfy PLAN-TO-EXEC, where it is unsatisfiable by construction.
//
// 115 occurrences fleet-wide (2026-08-28 → 2026-09-03) before it was traced, because it hid
// behind an inversion: verifyUserStories short-circuits to verified:true when an SD has ZERO
// user stories, so an SD with NO stories PASSED and an SD that correctly authored stories
// before EXEC was BLOCKED. The SDs that would have exposed it were the compliant ones.
//
// THE SECOND DESCRIBE BLOCK IS THE POINT. A fix that only proved "PLAN-TO-EXEC no longer
// blocks" is indistinguishable from deleting the check. These tests pin BOTH directions, so a
// future edit that quietly disables the EXEC-TO-PLAN bar fails here.

import { describe, it, expect } from 'vitest';
import { resolveStoryGateContext } from '../../../lib/sub-agents/testing/index.js';

describe('resolveStoryGateContext — PLAN-TO-EXEC does not block (the deadlock)', () => {
  it('does not block for handoffType PLAN-TO-EXEC', () => {
    const r = resolveStoryGateContext({ handoffType: 'PLAN-TO-EXEC' });
    expect(r.blocking).toBe(false);
    expect(r.source).toBe('options.handoffType');
  });

  it('does not block for phase PLAN_PRD — the evidence phase PLAN-TO-EXEC actually runs in', () => {
    // required-subagents.js maps PLAN-TO-EXEC to the PLAN_PRD evidence phase, and the
    // add-prd orchestration passes exactly this string, so this is the real-world path.
    const r = resolveStoryGateContext({ phase: 'PLAN_PRD' });
    expect(r.blocking).toBe(false);
    expect(r.context).toBe('PLAN-PRD');
  });

  it('normalises case and underscore/hyphen spelling rather than falling through to blocking', () => {
    for (const spelling of ['plan_prd', 'Plan-Prd', 'PLAN PRD', '  plan-to-exec  ']) {
      expect(resolveStoryGateContext({ phase: spelling }).blocking, spelling).toBe(false);
    }
  });

  it('prefers handoffType over phase when both are supplied', () => {
    const r = resolveStoryGateContext({ handoffType: 'PLAN-TO-EXEC', phase: 'EXEC_TO_PLAN' });
    expect(r.blocking).toBe(false);
    expect(r.source).toBe('options.handoffType');
  });
});

describe('resolveStoryGateContext — EXEC-TO-PLAN STILL BLOCKS (this is the assertion that matters)', () => {
  // Without these, the fix above is indistinguishable from disabling the check entirely.
  it('blocks for handoffType EXEC-TO-PLAN', () => {
    const r = resolveStoryGateContext({ handoffType: 'EXEC-TO-PLAN' });
    expect(r.blocking).toBe(true);
  });

  it('blocks for phase PLAN_VERIFY', () => {
    expect(resolveStoryGateContext({ phase: 'PLAN_VERIFY' }).blocking).toBe(true);
  });

  it('blocks for the later handoffs too, so the bar is not skippable by advancing past EXEC-TO-PLAN', () => {
    for (const ctx of ['EXEC', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL']) {
      expect(resolveStoryGateContext({ phase: ctx }).blocking, ctx).toBe(true);
    }
  });
});

describe('resolveStoryGateContext — fails CLOSED on unresolvable context', () => {
  // Blocking on ambiguity is recoverable (pass --phase). Passing on ambiguity is not:
  // it would let the EXEC-TO-PLAN check be skipped by simply omitting a flag.
  it('blocks when no context is supplied at all', () => {
    const r = resolveStoryGateContext({});
    expect(r.blocking).toBe(true);
    expect(r.context).toBe('UNRESOLVED');
    expect(r.source).toBe('fail-closed-default');
  });

  it('blocks when called with no argument', () => {
    expect(resolveStoryGateContext().blocking).toBe(true);
  });

  it('blocks on an unrecognised context rather than treating unknown as permissive', () => {
    expect(resolveStoryGateContext({ phase: 'SOME_FUTURE_PHASE' }).blocking).toBe(true);
  });

  it('blocks on non-string and empty context values', () => {
    for (const v of [null, undefined, '', '   ', 42, {}, []]) {
      expect(resolveStoryGateContext({ phase: v }).blocking, JSON.stringify(v)).toBe(true);
    }
  });

  it('does not let an unmapped handoffType mask a blocking phase', () => {
    // handoffType is unrecognised, so resolution must continue to phase rather than
    // stopping at the first present-but-unmapped value.
    const r = resolveStoryGateContext({ handoffType: 'MYSTERY', phase: 'EXEC_TO_PLAN' });
    expect(r.blocking).toBe(true);
    expect(r.source).toBe('options.phase');
  });

  it('does not let an unmapped handoffType mask a non-blocking phase either', () => {
    const r = resolveStoryGateContext({ handoffType: 'MYSTERY', phase: 'PLAN_PRD' });
    expect(r.blocking).toBe(false);
    expect(r.source).toBe('options.phase');
  });
});
