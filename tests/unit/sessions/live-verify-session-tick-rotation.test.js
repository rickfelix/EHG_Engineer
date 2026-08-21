// SD-MAN-INFRA-CORRECTIVE-VISION-GAP-001 FR-2 — hermetic tests for the live-rotation observer.
// No real DB, no real waits: sleepFn/clockFn are injected fakes that advance a shared virtual
// clock, matching this repo's established convention (tests/unit/coordination/adam-singleton.test.js).

import { describe, it, expect } from 'vitest';
import { pollUntil, isHeartbeatFrozen, observeRotation } from '../../../scripts/live-verify-session-tick-rotation.mjs';

/** A fake clock + sleep pair: each sleepFn call advances the shared clock by `ms`. */
function fakeClock(startMs = 0) {
  let t = startMs;
  const clockFn = () => t;
  const sleepFn = async (ms) => { t += ms; };
  return { clockFn, sleepFn, advance: (ms) => { t += ms; } };
}

/** A minimal chainable supabase-like stub over claude_sessions, keyed by session_id. */
function fakeSb(rowsBySessionId) {
  return {
    from(table) {
      return {
        select() { return this; },
        eq(_col, val) { this._id = val; return this; },
        async maybeSingle() {
          const row = rowsBySessionId[this._id];
          return { data: row ? { ...row } : null, error: null };
        },
      };
    },
  };
}

describe('isHeartbeatFrozen (pure)', () => {
  it('true when identical', () => expect(isHeartbeatFrozen('t1', 't1')).toBe(true));
  it('false when different', () => expect(isHeartbeatFrozen('t1', 't2')).toBe(false));
  it('false when either side is missing (cannot claim frozen without both samples)', () => {
    expect(isHeartbeatFrozen(null, 't2')).toBe(false);
    expect(isHeartbeatFrozen('t1', null)).toBe(false);
    expect(isHeartbeatFrozen(undefined, undefined)).toBe(false);
  });
});

describe('pollUntil (hermetic, virtual clock)', () => {
  it('resolves as soon as the predicate matches, without waiting out the full timeout', async () => {
    const { clockFn, sleepFn } = fakeClock();
    let calls = 0;
    const sb = { from: () => ({ select() { return this; }, eq() { return this; }, async maybeSingle() { calls += 1; return { data: { status: calls >= 2 ? 'released' : 'active' }, error: null }; } }) };
    const r = await pollUntil(sb, 'sid', (row) => row.status === 'released', { timeoutMs: 60_000, intervalMs: 2000, sleepFn, clockFn });
    expect(r.ok).toBe(true);
    expect(r.row.status).toBe('released');
    expect(calls).toBe(2); // 1 miss, 1 hit -- proves it did not spin needlessly
  });

  it('times out (ok=false) when the predicate never matches, and does not hang', async () => {
    const { clockFn, sleepFn } = fakeClock();
    const sb = fakeSb({ sid: { status: 'active' } });
    const r = await pollUntil(sb, 'sid', (row) => row.status === 'released', { timeoutMs: 10_000, intervalMs: 2000, sleepFn, clockFn });
    expect(r.ok).toBe(false);
    expect(r.row.status).toBe('active'); // still returns the last-seen row for diagnostics
  });

  it('returns ok=false with row=null when the session id does not exist', async () => {
    const { clockFn, sleepFn } = fakeClock();
    const sb = fakeSb({});
    const r = await pollUntil(sb, 'nonexistent', () => true, { timeoutMs: 4000, intervalMs: 2000, sleepFn, clockFn });
    expect(r.ok).toBe(false);
    expect(r.row).toBeNull();
  });
});

describe('observeRotation (hermetic, virtual clock, mocked DB)', () => {
  it('PASS: release observed, heartbeat frozen after, parked worker unaffected', async () => {
    const { clockFn, sleepFn } = fakeClock();
    let pollCount = 0;
    const sb = {
      from: () => ({
        select() { return this; },
        eq(_c, val) { this._id = val; return this; },
        async maybeSingle() {
          if (this._id === 'target') {
            pollCount += 1;
            // released on the 2nd poll; heartbeat frozen at 'frozen-hb' for the freeze check
            return { data: pollCount >= 2 ? { status: 'released', heartbeat_at: 'frozen-hb' } : { status: 'active', heartbeat_at: 'live-hb' }, error: null };
          }
          if (this._id === 'parked') {
            return { data: { status: 'idle', heartbeat_at: 'still-advancing' }, error: null };
          }
          return { data: null, error: null };
        },
      }),
    };
    const result = await observeRotation({
      sb, session: 'target', parkedWorker: 'parked', sleepFn, clockFn,
      releaseTimeoutMs: 10_000, freezeWaitMs: 5_000,
    });
    expect(result.releaseObserved).toBe(true);
    expect(result.heartbeatFrozenObserved).toBe(true); // 'frozen-hb' sampled twice, unchanged
    expect(result.parkedWorkerUnaffected).toBe(true);
    expect(result.overall).toBe('PASS');
    expect(result.adamRegisterProbe.decideSingleAdamGuardAvailable).toBe(true);
  });

  it('FAIL_NO_RELEASE: status never flips within the timeout', async () => {
    const { clockFn, sleepFn } = fakeClock();
    const sb = fakeSb({ target: { status: 'active', heartbeat_at: 'x' } });
    const result = await observeRotation({ sb, session: 'target', sleepFn, clockFn, releaseTimeoutMs: 4_000 });
    expect(result.releaseObserved).toBe(false);
    expect(result.overall).toBe('FAIL_NO_RELEASE');
    expect(result.heartbeatFrozenObserved).toBeNull(); // never reached that check
  });

  it('parkedWorker="not_provided" when no --parked-worker given (does not silently claim unaffected)', async () => {
    const { clockFn, sleepFn } = fakeClock();
    const sb = fakeSb({ target: { status: 'released', heartbeat_at: 'x' } });
    const result = await observeRotation({ sb, session: 'target', parkedWorker: null, sleepFn, clockFn, releaseTimeoutMs: 4_000, freezeWaitMs: 1_000 });
    expect(result.parkedWorkerUnaffected).toBe('not_provided');
  });

  it('PARTIAL when release is observed but heartbeat did NOT freeze (still advancing -- daemon kept stamping)', async () => {
    const { clockFn, sleepFn } = fakeClock();
    let calls = 0;
    const sb = {
      from: () => ({
        select() { return this; },
        eq(_c, val) { this._id = val; return this; },
        async maybeSingle() {
          calls += 1;
          // released immediately, but heartbeat_at keeps changing each read -- the exact failure
          // this SD exists to detect (a daemon still stamping after release).
          return { data: { status: 'released', heartbeat_at: `hb-${calls}` }, error: null };
        },
      }),
    };
    const result = await observeRotation({ sb, session: 'target', sleepFn, clockFn, releaseTimeoutMs: 4_000, freezeWaitMs: 1_000 });
    expect(result.releaseObserved).toBe(true);
    expect(result.heartbeatFrozenObserved).toBe(false);
    expect(result.overall).toBe('PARTIAL');
  });
});
