// SD-LEO-INFRA-WORKER-ENGAGEMENT-ARM-PARK-001 — the Stop hook ALLOW-PATHS (windDownSignaled :83 +
// second-stop stopHookActive :78) previously let a worker cold-exit with ZERO wakeup armed,
// stranding self-claimable work at 0 live workers. shouldParkRecoverable decides whether such an
// allowed stop should first PARK the session recoverable (loop_state='awaiting_tick' +
// expected_silence_until) so coordinator-revival / orphan-adoption re-engages it.
//
// SEPARATION OF CONCERNS: opting out of self-claim (stop churn) and parking-with-a-wakeup (stay
// recoverable) are SEPARATE — a wind-down or second-stop must STILL park a worker, not cold-exit it.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { shouldParkRecoverable, shouldRemind, classifyWindDownReason } = require('../../../scripts/hooks/stop-loop-wakeup-reminder.cjs');

describe('shouldParkRecoverable (SD-LEO-INFRA-WORKER-ENGAGEMENT-ARM-PARK-001)', () => {
  it('PARKS a claim-holding worker on an allow-path (the keystone-unblock strand case)', () => {
    expect(shouldParkRecoverable({ loopState: null, hasActiveClaim: true })).toBe(true);
  });

  it('PARKS a worker that announced a wind-down (windDownSignaled allow-path :83)', () => {
    expect(shouldParkRecoverable({ loopState: null, hasActiveClaim: false, windDownSignaled: true })).toBe(true);
  });

  it('PARKS a worker in a loop state (active / awaiting_tick)', () => {
    expect(shouldParkRecoverable({ loopState: 'active' }).valueOf()).toBe(true);
    expect(shouldParkRecoverable({ loopState: 'awaiting_tick' })).toBe(true);
  });

  it('does NOT park a claim-less, loop-less, non-signalling interactive operator session', () => {
    expect(shouldParkRecoverable({ loopState: null, hasActiveClaim: false, windDownSignaled: false })).toBe(false);
    expect(shouldParkRecoverable({ loopState: 'exited', hasActiveClaim: false })).toBe(false);
    expect(shouldParkRecoverable({})).toBe(false);
    expect(shouldParkRecoverable()).toBe(false);
  });
});

// SEPARATION OF CONCERNS (unchanged by step A): blocking and parking are independent decisions.
// A stop that is ALLOWED through must still leave the worker parked-recoverable, or it cold-exits
// to zero. Step A changes only what BLOCKS; every park assertion below is untouched.
describe('shouldRemind allow-paths still allow (then the caller parks)', () => {
  const base = { flagEnabled: true, stopHookActive: false, hasActiveClaim: true, armVerdict: 'unarmed' };

  // REWRITTEN for step A. This case used to assert that ANNOUNCING a wind-down suppressed the
  // block. It no longer does — that was Charlie's false positive. The worker is blocked, and is
  // still parked recoverable, which is the invariant this file actually guards.
  it('windDownSignaled no longer excuses an unarmed worker, but the park is unaffected', () => {
    expect(shouldRemind({ ...base, loopState: 'active', windDownSignaled: true })).toBe(true);
    expect(shouldParkRecoverable({ loopState: 'active', hasActiveClaim: true, windDownSignaled: true })).toBe(true);
  });

  it('second-stop (stopHookActive) → no block (allow-path), claim-holder → parked', () => {
    expect(shouldRemind({ ...base, loopState: 'active', stopHookActive: true })).toBe(false);
    expect(shouldParkRecoverable({ loopState: 'active', hasActiveClaim: true })).toBe(true);
  });

  it('an unarmed loop worker at first stop is BLOCKED (not yet an allow-path)', () => {
    expect(shouldRemind({ flagEnabled: true, stopHookActive: false, hasActiveClaim: false, loopState: 'active', armVerdict: 'unarmed' })).toBe(true);
  });

  // The allow-path that remains: real arm evidence. It is allowed AND parked.
  it('a genuinely armed worker is allowed through and still parked recoverable', () => {
    expect(shouldRemind({ ...base, loopState: 'active', armVerdict: 'armed' })).toBe(false);
    expect(shouldParkRecoverable({ loopState: 'active', hasActiveClaim: true })).toBe(true);
  });
});

// SD-LEO-INFRA-WORKER-WINDDOWN-SURVEY-001 (a): classify WHY a worker is winding down at the park path.
describe('classifyWindDownReason (SD-LEO-INFRA-WORKER-WINDDOWN-SURVEY-001)', () => {
  it("'signaled' when the worker announced a wind-down (wins over second-stop)", () => {
    expect(classifyWindDownReason({ windDownSignaled: true, stopHookActive: false })).toBe('signaled');
    expect(classifyWindDownReason({ windDownSignaled: true, stopHookActive: true })).toBe('signaled');
  });
  it("'second_stop' on the second-stop allow-path when not signaled", () => {
    expect(classifyWindDownReason({ windDownSignaled: false, stopHookActive: true })).toBe('second_stop');
  });
  it("'no_claim_idle' when neither signaled nor second-stop (a looping worker parking)", () => {
    expect(classifyWindDownReason({ windDownSignaled: false, stopHookActive: false })).toBe('no_claim_idle');
    expect(classifyWindDownReason({})).toBe('no_claim_idle');
    expect(classifyWindDownReason()).toBe('no_claim_idle');
  });

  // QF-20260703-347: a worker that ends its turn with loop_state='awaiting_tick' (a ScheduleWakeup
  // already armed by post-tool-loop-state.cjs) is NOT idle — it self-diagnosed as 'no_claim_idle'
  // even while had_claim:true, contradicting its own recorded flag.
  it("'turn_end_with_claim_wakeup_scheduled' when a wakeup is armed AND the worker holds a live claim", () => {
    expect(classifyWindDownReason({
      windDownSignaled: false,
      stopHookActive: false,
      hasActiveClaim: true,
      loopState: 'awaiting_tick',
    })).toBe('turn_end_with_claim_wakeup_scheduled');
  });

  it("'turn_end_wakeup_scheduled' when a wakeup is armed but there is no live claim", () => {
    expect(classifyWindDownReason({
      windDownSignaled: false,
      stopHookActive: false,
      hasActiveClaim: false,
      loopState: 'awaiting_tick',
    })).toBe('turn_end_wakeup_scheduled');
  });

  it("'signaled' and 'second_stop' still win over an armed wakeup (precedence unchanged)", () => {
    expect(classifyWindDownReason({
      windDownSignaled: true,
      hasActiveClaim: true,
      loopState: 'awaiting_tick',
    })).toBe('signaled');
    expect(classifyWindDownReason({
      stopHookActive: true,
      hasActiveClaim: true,
      loopState: 'awaiting_tick',
    })).toBe('second_stop');
  });

  // SD-LEO-INFRA-TERMINAL-RITUAL-ENFORCEMENT-001 (TR-3) — REPLACES the previous assertion, which
  // pinned 'no_claim_idle' for a claim-HOLDING session. That value contradicts the had_claim:true
  // recordWindDown stamps beside it, and it made this SD's target population (a seat that ends a
  // turn holding work with no wakeup armed) uncountable by its own telemetry.
  it("'turn_end_with_claim_no_wakeup' when a live claim ends a turn with no wakeup evidence", () => {
    for (const loopState of ['active', null, 'exited', 'unknown']) {
      expect(classifyWindDownReason({
        windDownSignaled: false,
        stopHookActive: false,
        hasActiveClaim: true,
        loopState,
      })).toBe('turn_end_with_claim_no_wakeup');
    }
  });

  // The REACHABLE contradiction specifically (TR-3): shouldRemind lets loop_state='exited' through
  // (:86), shouldParkRecoverable parks it on the claim (:111), and classify then ran the
  // fall-through. This is the one input that was reaching production; the others above are
  // unreachable ONLY until step A replaces the block predicate.
  it("the reachable path (loop_state='exited' + live claim) no longer reports 'no claim'", () => {
    expect(classifyWindDownReason({ hasActiveClaim: true, loopState: 'exited' })).not.toMatch(/no_claim/);
  });

  it("'no_claim_idle' is retained for a genuinely claim-less idle session", () => {
    for (const loopState of ['active', null, 'exited', 'unknown']) {
      expect(classifyWindDownReason({ hasActiveClaim: false, loopState })).toBe('no_claim_idle');
    }
  });

  // STEP A — THE COUNTABLE IGNORE. The block fires once; a worker that stops again passes through
  // the anti-infinite-loop guard, and for this dormancy there IS no later turn to re-block. So
  // step A cannot compel — it can only count how often a reminder was seen and ignored, which is
  // the evidence base for step C (auto-arm). If this value never appears, step C is unjustified;
  // if it dominates, the nudge is insufficient and step C is the whole fix.
  describe("'second_stop_still_unarmed' — the population step A cannot save", () => {
    const ignored = { stopHookActive: true, armVerdict: 'unarmed', hasActiveClaim: true };

    it('a claim-holder that reached a second stop still unarmed is counted distinctly', () => {
      expect(classifyWindDownReason(ignored)).toBe('second_stop_still_unarmed');
    });

    // Announcing is what these workers do INSTEAD of arming, so 'signaled' must not absorb them.
    it('outranks the wind-down announcement, which would otherwise mask the whole class', () => {
      expect(classifyWindDownReason({ ...ignored, windDownSignaled: true })).toBe('second_stop_still_unarmed');
    });

    it('a second stop that DID arm is ordinary second_stop, not an ignore', () => {
      expect(classifyWindDownReason({ ...ignored, armVerdict: 'armed' })).toBe('second_stop');
    });

    it('an unreadable transcript is not counted as an ignore', () => {
      expect(classifyWindDownReason({ ...ignored, armVerdict: 'unknown' })).toBe('second_stop');
      expect(classifyWindDownReason({ ...ignored, armVerdict: undefined })).toBe('second_stop');
    });

    it('a claim-less session is never counted as an ignore', () => {
      expect(classifyWindDownReason({ ...ignored, hasActiveClaim: false })).toBe('second_stop');
    });

    it('only fires on the SECOND stop — a first stop is still a live block, not an ignore', () => {
      expect(classifyWindDownReason({ ...ignored, stopHookActive: false, loopState: 'active' })).toBe('turn_end_with_claim_no_wakeup');
    });
  });
});
