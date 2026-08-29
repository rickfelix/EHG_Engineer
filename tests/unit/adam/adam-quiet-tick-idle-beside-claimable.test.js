/**
 * QF-20260829-588: QUIET_TICK_IDLE_BESIDE_CLAIMABLE was counting role seats
 * (adam/solomon/coordinator -- legitimately sd_key=null, heartbeating) as idle
 * fleet-worker capacity, and labeled the raw-unclaimed draft count as "claimable"
 * even though the true dispatchable-leaf extent is a different, smaller number.
 * checkIdleBesideClaimable() must now exclude role/non_fleet sessions from the
 * idle count (via the canonical isBuildForbiddenSession predicate) and return
 * the draft count under the honest name rawUnclaimedCount.
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
});
