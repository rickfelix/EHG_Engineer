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
const { shouldParkRecoverable, shouldRemind } = require('../../../scripts/hooks/stop-loop-wakeup-reminder.cjs');

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

describe('shouldRemind allow-paths still allow (then the caller parks)', () => {
  const base = { flagEnabled: true, stopHookActive: false, hasActiveClaim: true };
  it('windDownSignaled → no block (allow-path), but the worker holds a claim → will be parked', () => {
    expect(shouldRemind({ ...base, loopState: 'active', windDownSignaled: true })).toBe(false);
    expect(shouldParkRecoverable({ loopState: 'active', hasActiveClaim: true, windDownSignaled: true })).toBe(true);
  });
  it('second-stop (stopHookActive) → no block (allow-path), claim-holder → parked', () => {
    expect(shouldRemind({ ...base, loopState: 'active', stopHookActive: true })).toBe(false);
    expect(shouldParkRecoverable({ loopState: 'active', hasActiveClaim: true })).toBe(true);
  });
  it('a still-active loop worker (no wind-down, first stop) is BLOCKED (not yet an allow-path)', () => {
    expect(shouldRemind({ flagEnabled: true, stopHookActive: false, hasActiveClaim: false, loopState: 'active', windDownSignaled: false })).toBe(true);
  });
});
