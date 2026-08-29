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
import { checkIdleBesideClaimable } from '../../../scripts/adam-quiet-tick.mjs';

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
});
