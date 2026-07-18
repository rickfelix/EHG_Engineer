// SD-LEO-INFRA-SOFT-RESERVE-LONGEST-IDLE-001 (FR-1 + TR-2 + TR-3): the reserve wiring at the
// sourcing seam. softReserveLeaf resolves the longest-idle worker + writes a fence via the SHIPPED
// reserveSd, with a cadence-tuned TTL, batch-spread, and total fail-open. Also proves the auto-written
// fence blocks a peer and admits the reserved worker (FR-2 end-to-end, not just a manual fence).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import {
  softReserveLeaf,
  softReserveTtlSeconds,
  DEFAULT_SOFT_RESERVE_TTL_SECONDS,
} from '../../../lib/sourcing-engine/refill-auto-promote.js';
const require = createRequire(import.meta.url);
const { coordinatorReservation } = require('../../../lib/fleet/claim-eligibility.cjs');

describe('softReserveTtlSeconds — TR-2: default must exceed DEFAULT_IDLE_WAKEUP_SECONDS (600)', () => {
  it('defaults to 720s (> 600, and emphatically NOT 60)', () => {
    expect(DEFAULT_SOFT_RESERVE_TTL_SECONDS).toBe(720);
    expect(DEFAULT_SOFT_RESERVE_TTL_SECONDS).toBeGreaterThan(600);
    expect(softReserveTtlSeconds({})).toBe(720);
  });
  it('honors a valid SOFT_RESERVE_TTL_SECONDS override', () => {
    expect(softReserveTtlSeconds({ SOFT_RESERVE_TTL_SECONDS: '900' })).toBe(900);
  });
  it('falls back to the default for a non-positive / NaN override', () => {
    expect(softReserveTtlSeconds({ SOFT_RESERVE_TTL_SECONDS: '-5' })).toBe(720);
    expect(softReserveTtlSeconds({ SOFT_RESERVE_TTL_SECONDS: 'abc' })).toBe(720);
    expect(softReserveTtlSeconds({ SOFT_RESERVE_TTL_SECONDS: '0' })).toBe(720);
  });
});

describe('softReserveLeaf — FR-1 reserve at the sourcing seam', () => {
  it('reserves the picked worker with a future ISO expiresAt (TTL ahead of now) and returns it', async () => {
    const calls = [];
    const pickFn = async () => 'w-old';
    const reserveFn = async (_sb, args) => { calls.push(args); return { data: { id: 'res-1' }, error: null }; };
    const before = Date.now();
    const r = await softReserveLeaf({}, 'SD-REFILL-AAA', undefined, { pickFn, reserveFn });
    expect(r.reserved).toBe(true);
    expect(r.reservedForSession).toBe('w-old');
    expect(calls[0].targetSd).toBe('SD-REFILL-AAA');
    expect(calls[0].reservedForSession).toBe('w-old');
    // expiresAt is ~720s ahead — well beyond the 600s idle cadence
    const ttlMs = Date.parse(calls[0].expiresAt) - before;
    expect(ttlMs).toBeGreaterThan(600 * 1000);
  });

  it('writes NO reservation when no ready worker is pickable (leaf enters the open queue)', async () => {
    const reserveFn = async () => { throw new Error('should not be called'); };
    const r = await softReserveLeaf({}, 'SD-REFILL-BBB', undefined, { pickFn: async () => null, reserveFn });
    expect(r).toEqual({ reserved: false, reason: 'no_ready_worker' });
  });

  it('FAIL-OPEN: a reserve-write error never throws — the leaf just stays open', async () => {
    const pickFn = async () => 'w-1';
    const reserveFn = async () => ({ data: null, error: 'no live active coordinator resolved' });
    const r = await softReserveLeaf({}, 'SD-REFILL-CCC', undefined, { pickFn, reserveFn });
    expect(r.reserved).toBe(false);
    expect(r.reason).toMatch(/coordinator/);
  });

  it('FAIL-OPEN: a picker throw never throws out of softReserveLeaf', async () => {
    const pickFn = async () => { throw new Error('pick boom'); };
    await expect(softReserveLeaf({}, 'SD-REFILL-DDD', undefined, { pickFn, reserveFn: async () => ({}) }))
      .resolves.toMatchObject({ reserved: false });
  });
});

describe('softReserveLeaf — TR-3 batch-spread across DISTINCT workers', () => {
  it('a batch reserves N leaves to N distinct workers (already-reserved excluded from the next pick)', async () => {
    // pickFn honors excludeSessions the way the real picker does.
    const pool = ['w-old', 'w-mid', 'w-new'];
    const pickFn = async (_sb, opts) => {
      const excl = opts.excludeSessions instanceof Set ? opts.excludeSessions : new Set();
      return pool.find((w) => !excl.has(w)) || null;
    };
    const reserveFn = async () => ({ data: {}, error: null });
    const reserveState = { reservedSessions: new Set() };
    const r1 = await softReserveLeaf({}, 'SD-1', reserveState, { pickFn, reserveFn });
    const r2 = await softReserveLeaf({}, 'SD-2', reserveState, { pickFn, reserveFn });
    const r3 = await softReserveLeaf({}, 'SD-3', reserveState, { pickFn, reserveFn });
    const r4 = await softReserveLeaf({}, 'SD-4', reserveState, { pickFn, reserveFn });
    expect([r1, r2, r3].map((r) => r.reservedForSession)).toEqual(['w-old', 'w-mid', 'w-new']);
    expect(reserveState.reservedSessions.size).toBe(3); // no single-worker hoard
    expect(r4).toEqual({ reserved: false, reason: 'no_ready_worker' }); // pool exhausted -> open
  });

  it('does NOT mutate reserveState on a failed reserve (no phantom exclusion)', async () => {
    const reserveState = { reservedSessions: new Set() };
    const r = await softReserveLeaf({}, 'SD-1', reserveState, { pickFn: async () => 'w-1', reserveFn: async () => ({ error: 'boom' }) });
    expect(r.reserved).toBe(false);
    expect(reserveState.reservedSessions.size).toBe(0);
  });
});

describe('FR-2 end-to-end: an AUTO-written fence blocks a peer and admits the reserved worker', () => {
  it('the reservedForSession from softReserveLeaf feeds coordinatorReservation correctly', async () => {
    let written = null;
    const pickFn = async () => 'reserved-worker';
    const reserveFn = async (_sb, args) => { written = args; return { data: {}, error: null }; };
    const r = await softReserveLeaf({}, 'SD-LEAF', undefined, { pickFn, reserveFn });
    expect(r.reserved).toBe(true);
    // Reconstruct the fence a drain would build from the written reservation (live worker).
    const reservations = { 'SD-LEAF': [{ sd: 'SD-LEAF', reservedForSession: written.reservedForSession, reservedForSessionLive: true, expiresAt: written.expiresAt }] };
    expect(coordinatorReservation({ sd_key: 'SD-LEAF' }, { sessionId: 'faster-peer', reservations })).toBe('reserved_for_other_session');
    expect(coordinatorReservation({ sd_key: 'SD-LEAF' }, { sessionId: 'reserved-worker', reservations })).toBeNull();
  });
});
