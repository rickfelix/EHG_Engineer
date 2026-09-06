/**
 * QF-20260829-588: QUIET_TICK_IDLE_BESIDE_CLAIMABLE was counting role seats
 * (adam/solomon/coordinator -- legitimately sd_key=null, heartbeating) as idle
 * fleet-worker capacity, and labeled the raw-unclaimed draft count as "claimable"
 * even though the true dispatchable-leaf extent is a different, smaller number.
 * checkIdleBesideClaimable() must now exclude role/non_fleet sessions from the
 * idle count (via the canonical isBuildForbiddenSession predicate) and return
 * the draft count under the honest name rawUnclaimedCount.
 *
 * SCOPE RIDER (coordinator census specimen 78a073be): a released shell (released_at
 * set) can still be tool-fresh via the /clear-survivor daemon, so it must be excluded
 * outright -- never counted as idle capacity regardless of how recent last_tool_at is.
 */
import { describe, it, expect } from 'vitest';
import { checkIdleBesideClaimable, idleBesideClaimableCount } from '../../../scripts/adam-quiet-tick.mjs';

function countBuilder(count) {
  const b = {
    select: () => b,
    eq: () => b,
    then: (resolve, reject) => Promise.resolve({ count, error: null }).then(resolve, reject),
  };
  return b;
}

function seatsBuilder(rows) {
  const b = {
    select: () => b,
    is: () => b,
    in: () => b,
    gte: () => b,
    limit: () => b,
    then: (resolve, reject) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
  };
  return b;
}

function sbWith(draftCount, seatRows) {
  return {
    from: (table) => (table === 'strategic_directives_v2' ? countBuilder(draftCount) : seatsBuilder(seatRows)),
  };
}

describe('checkIdleBesideClaimable', () => {
  it('excludes role seats (adam/solomon/coordinator) from the idle count', async () => {
    const seats = [
      { session_id: 'adam', released_at: null, last_tool_at: new Date().toISOString(), metadata: { role: 'adam', non_fleet: true } },
      { session_id: 'solomon', released_at: null, last_tool_at: new Date().toISOString(), metadata: { role: 'solomon', non_fleet: true } },
      { session_id: 'coord', released_at: null, last_tool_at: new Date().toISOString(), metadata: { is_coordinator: true } },
    ];
    const sb = sbWith(5, seats);
    const result = await checkIdleBesideClaimable(sb);
    expect(result).toBeNull(); // all seats are role seats -> zero genuine idle fleet workers
  });

  it('counts a genuine fleet-worker idle seat and reports the raw-unclaimed extent under its honest name', async () => {
    const seats = [
      { session_id: 'worker-1', released_at: null, last_tool_at: new Date().toISOString(), metadata: {} },
      { session_id: 'adam', released_at: null, last_tool_at: new Date().toISOString(), metadata: { role: 'adam', non_fleet: true } },
    ];
    const sb = sbWith(13, seats);
    const result = await checkIdleBesideClaimable(sb);
    expect(result).toEqual({ idleCount: 1, rawUnclaimedCount: 13 });
  });

  it('returns null when there are no drafts at all', async () => {
    const sb = sbWith(0, []);
    const result = await checkIdleBesideClaimable(sb);
    expect(result).toBeNull();
  });

  it('excludes a released shell even when last_tool_at is fresh and AFTER released_at (the /clear-survivor daemon case)', async () => {
    const releasedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const freshAfterRelease = new Date().toISOString(); // daemon-driven tool call, newer than released_at
    const seats = [
      { session_id: 'released-shell', released_at: releasedAt, last_tool_at: freshAfterRelease, metadata: {} },
    ];
    const sb = sbWith(9, seats);
    const result = await checkIdleBesideClaimable(sb);
    expect(result).toBeNull(); // released shell must never count as idle, regardless of last_tool_at ordering
  });

  it('still counts a genuine never-released fleet worker as idle', async () => {
    const seats = [
      { session_id: 'worker-1', released_at: null, last_tool_at: new Date().toISOString(), metadata: {} },
    ];
    const sb = sbWith(4, seats);
    const result = await checkIdleBesideClaimable(sb);
    expect(result).toEqual({ idleCount: 1, rawUnclaimedCount: 4 });
  });

  // SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-D FR-2: migrated onto seatIdleVerdict, which closes two
  // gaps isBuildForbiddenSession had (metadata-only, blind to session_id shape and to the
  // quarantined/parked markers) -- these are INTENDED DELTAS this migration adds, not
  // pre-existing behavior, so they're pinned here rather than asserted as parity.
  it('INTENDED DELTA: a fixture/probe session id is now excluded (isBuildForbiddenSession was metadata-only, blind to this)', async () => {
    const seats = [
      { session_id: 'test-session-nswcf-fenced', released_at: null, last_tool_at: new Date().toISOString(), metadata: {} },
    ];
    const sb = sbWith(6, seats);
    const result = await checkIdleBesideClaimable(sb);
    expect(result).toBeNull();
  });

  it('INTENDED DELTA: a quarantined seat is now excluded', async () => {
    const seats = [
      { session_id: 'wedged-1', released_at: null, last_tool_at: new Date().toISOString(), metadata: { quarantined_at: new Date().toISOString() } },
    ];
    const sb = sbWith(6, seats);
    const result = await checkIdleBesideClaimable(sb);
    expect(result).toBeNull();
  });

  it('INTENDED DELTA: a parked seat (parked_until in the future) is now excluded', async () => {
    const seats = [
      { session_id: 'parked-1', released_at: null, last_tool_at: new Date().toISOString(), metadata: { parked_until: new Date(Date.now() + 60_000).toISOString() } },
    ];
    const sb = sbWith(6, seats);
    const result = await checkIdleBesideClaimable(sb);
    expect(result).toBeNull();
  });
});

// SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-D FR-3: idleBesideClaimableCount is the ONLY consumer (of
// the three migrated beyond eligibleIdleWorkers) that adopts qfHolderSessionIds/
// seatBusySessionIds/spinUpGraceMs. Tested directly against the pure core (not through
// checkIdleBesideClaimable) because the existing fake Supabase client's ctx-population reads
// always degrade to empty Sets, so these axes never fire through that path.
describe('idleBesideClaimableCount — FR-3 adopted axes (QF-holder / directed-work / spin-up-grace)', () => {
  const freshSeat = (over = {}) => ({ session_id: 's1', released_at: null, metadata: {}, ...over });

  it('a QF holder is excluded when qfHolderSessionIds is supplied', () => {
    const seats = [freshSeat({ session_id: 'qf-holder-1' })];
    expect(idleBesideClaimableCount(seats)).toBe(1); // no ctx -> no-op, still idle
    expect(idleBesideClaimableCount(seats, { qfHolderSessionIds: new Set(['qf-holder-1']) })).toBe(0);
  });

  it('a session with a live directed-work reservation is excluded when seatBusySessionIds is supplied', () => {
    const seats = [freshSeat({ session_id: 'directed-1' })];
    expect(idleBesideClaimableCount(seats, { seatBusySessionIds: new Set(['directed-1']) })).toBe(0);
  });

  it('a freshly-spun-up seat is excluded when spinUpGraceMs is supplied', () => {
    const seats = [freshSeat({ session_id: 'new-1', created_at: new Date().toISOString() })];
    expect(idleBesideClaimableCount(seats)).toBe(1); // no ctx -> no-op
    expect(idleBesideClaimableCount(seats, { spinUpGraceMs: 3 * 60_000 })).toBe(0);
  });

  it('a seat past the spin-up grace still counts idle', () => {
    const seats = [freshSeat({ session_id: 'old-1', created_at: new Date(Date.now() - 60 * 60_000).toISOString() })];
    expect(idleBesideClaimableCount(seats, { spinUpGraceMs: 3 * 60_000 })).toBe(1);
  });

  it('a session NOT in any supplied ctx set is unaffected (two-sided)', () => {
    const seats = [freshSeat({ session_id: 'unrelated-1' })];
    expect(idleBesideClaimableCount(seats, {
      qfHolderSessionIds: new Set(['someone-else']),
      seatBusySessionIds: new Set(['someone-else-2']),
      spinUpGraceMs: 3 * 60_000,
    })).toBe(1);
  });
});
