// SD-LEO-INFRA-SOFT-RESERVE-LONGEST-IDLE-001 (FR-1): the longest-idle signaled-ready picker.
// Covers TS-6 (pick correctness + null) and TS-7 (batch-spread across distinct workers), plus the
// IO wrapper's fail-open contract. Pure/IO split — the ranking is exercised directly; the IO wrapper
// is stubbed (session_coordination query + an injected live-fleet resolver).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { pickLongestIdleFromRows, pickLongestIdleSignaledReady } = require('../../../lib/fleet/pick-reserve-target.cjs');
const { PAYLOAD_KINDS } = require('../../../lib/fleet/worker-status.cjs');

const iso = (ms) => new Date(ms).toISOString();
/** An active roll_call availability row for `sid` created at `createdMs`. */
const rollCall = (sid, createdMs, over = {}) => ({
  sender_session: sid,
  created_at: iso(createdMs),
  payload: { kind: PAYLOAD_KINDS.ROLL_CALL, available: true, sd_key: null, ...over },
});

describe('pickLongestIdleFromRows — TS-6: single longest-idle signaled-ready+live+unclaimed', () => {
  it('returns the session with the EARLIEST active roll_call (longest idle)', () => {
    const rows = [rollCall('w-new', 5000), rollCall('w-old', 1000), rollCall('w-mid', 3000)];
    const live = new Set(['w-new', 'w-old', 'w-mid']);
    expect(pickLongestIdleFromRows(rows, live)).toBe('w-old');
  });

  it('breaks a created_at tie by session_id ascending (determinism)', () => {
    const rows = [rollCall('w-b', 1000), rollCall('w-a', 1000)];
    expect(pickLongestIdleFromRows(rows, new Set(['w-a', 'w-b']))).toBe('w-a');
  });

  it('collapses multiple roll_calls per session to its EARLIEST (idle-since proxy)', () => {
    // w-old first signaled at t=500 (longest idle) even though it re-signaled at t=9000.
    const rows = [rollCall('w-old', 9000), rollCall('w-old', 500), rollCall('w-young', 2000)];
    expect(pickLongestIdleFromRows(rows, new Set(['w-old', 'w-young']))).toBe('w-old');
  });

  it('excludes non-live workers (signaled but heartbeat-stale)', () => {
    const rows = [rollCall('w-dead', 1000), rollCall('w-live', 4000)];
    expect(pickLongestIdleFromRows(rows, new Set(['w-live']))).toBe('w-live');
  });

  it('excludes busy workers (available=false) and workers naming a working sd_key', () => {
    const rows = [
      rollCall('w-busy', 1000, { available: false }),
      rollCall('w-working', 1500, { sd_key: 'SD-CLAIMED-1' }),
      rollCall('w-ready', 8000),
    ];
    expect(pickLongestIdleFromRows(rows, new Set(['w-busy', 'w-working', 'w-ready']))).toBe('w-ready');
  });

  it('ignores rows whose payload.kind is not roll_call', () => {
    const rows = [
      { sender_session: 'w-x', created_at: iso(100), payload: { kind: PAYLOAD_KINDS.COORDINATOR_RESERVATION } },
      rollCall('w-ready', 5000),
    ];
    expect(pickLongestIdleFromRows(rows, new Set(['w-x', 'w-ready']))).toBe('w-ready');
  });

  it('returns null when the intersection is empty (no live signaled worker)', () => {
    expect(pickLongestIdleFromRows([rollCall('w-1', 1000)], new Set())).toBeNull();
    expect(pickLongestIdleFromRows([], new Set(['w-1']))).toBeNull();
    expect(pickLongestIdleFromRows([rollCall('w-1', 1000)], new Set(['other']))).toBeNull();
  });

  it('is TOTAL on malformed input (never throws)', () => {
    expect(pickLongestIdleFromRows(null, null)).toBeNull();
    expect(pickLongestIdleFromRows([null, 42, 'x', {}], ['w-1'])).toBeNull();
    expect(pickLongestIdleFromRows(undefined, undefined)).toBeNull();
  });
});

describe('pickLongestIdleFromRows — TS-7: batch-spread via excludeSessions', () => {
  it('excludes already-reserved-this-run sessions so N leaves pick N distinct workers', () => {
    const rows = [rollCall('w-old', 1000), rollCall('w-mid', 2000), rollCall('w-new', 3000)];
    const live = new Set(['w-old', 'w-mid', 'w-new']);
    const reserved = new Set();
    const p1 = pickLongestIdleFromRows(rows, live, reserved); reserved.add(p1);
    const p2 = pickLongestIdleFromRows(rows, live, reserved); reserved.add(p2);
    const p3 = pickLongestIdleFromRows(rows, live, reserved); reserved.add(p3);
    const p4 = pickLongestIdleFromRows(rows, live, reserved);
    expect([p1, p2, p3]).toEqual(['w-old', 'w-mid', 'w-new']); // longest-idle first, all distinct
    expect(new Set([p1, p2, p3]).size).toBe(3);
    expect(p4).toBeNull(); // pool exhausted -> no hoard, next leaf just stays open
  });
});

describe('pickLongestIdleSignaledReady — IO wrapper (fail-open + happy path)', () => {
  // Minimal chainable stub for the session_coordination roll_call query.
  const makeSb = (rcRows, { throwOnQuery = false, errorOnQuery = false } = {}) => ({
    from(table) {
      expect(table).toBe('session_coordination');
      return {
        select() { return this; },
        eq() { return this; },
        gt() {
          if (throwOnQuery) throw new Error('query boom');
          return Promise.resolve({ data: errorOnQuery ? null : rcRows, error: errorOnQuery ? { message: 'boom' } : null });
        },
      };
    },
  });

  it('returns the longest-idle worker when both fetches succeed (injected live resolver)', async () => {
    const sb = makeSb([rollCall('w-old', 1000), rollCall('w-new', 5000)]);
    const liveFleetSessionsFn = async () => [{ session_id: 'w-old' }, { session_id: 'w-new' }];
    expect(await pickLongestIdleSignaledReady(sb, { liveFleetSessionsFn })).toBe('w-old');
  });

  it('honors excludeSessions end-to-end', async () => {
    const sb = makeSb([rollCall('w-old', 1000), rollCall('w-new', 5000)]);
    const liveFleetSessionsFn = async () => [{ session_id: 'w-old' }, { session_id: 'w-new' }];
    expect(await pickLongestIdleSignaledReady(sb, { liveFleetSessionsFn, excludeSessions: new Set(['w-old']) })).toBe('w-new');
  });

  it('fail-open: a query error returns null', async () => {
    const sb = makeSb([], { errorOnQuery: true });
    expect(await pickLongestIdleSignaledReady(sb, { liveFleetSessionsFn: async () => [] })).toBeNull();
  });

  it('fail-open: a thrown query returns null (never propagates)', async () => {
    const sb = makeSb([], { throwOnQuery: true });
    await expect(pickLongestIdleSignaledReady(sb, { liveFleetSessionsFn: async () => [] })).resolves.toBeNull();
  });

  it('fail-open: a live-resolver throw returns null', async () => {
    const sb = makeSb([rollCall('w-old', 1000)]);
    const liveFleetSessionsFn = async () => { throw new Error('live boom'); };
    await expect(pickLongestIdleSignaledReady(sb, { liveFleetSessionsFn })).resolves.toBeNull();
  });
});
