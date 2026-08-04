// SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-E — TS-1 (rung exactness) and TS-2 (lane isolation).
import { describe, it, expect } from 'vitest';
import { rungForTicks, laneForStall, groupByLane, RUNG, LANE } from '../../../lib/escalation/ladder.js';

describe('TS-1 — rungs fire at EXACTLY x2/x3/x5, and nowhere else', () => {
  // The PRD calls off-by-one "the whole feature": a rung at x1 makes the ladder noise, a rung
  // at x6 makes it decorative. So this asserts the full 0..8 range rather than spot-checking
  // the three hits — a spot check cannot see a rung that ALSO fires somewhere it should not.
  const expected = {
    0: RUNG.NONE, 1: RUNG.NONE,
    2: RUNG.IN_REPORT,
    3: RUNG.OWNER,
    4: RUNG.NONE,
    5: RUNG.CHAIRMAN,
    6: RUNG.NONE, 7: RUNG.NONE, 8: RUNG.NONE,
  };
  for (const [ticks, rung] of Object.entries(expected)) {
    it(`x${ticks} => ${rung === null ? 'nothing' : rung}`, () => {
      expect(rungForTicks(Number(ticks))).toBe(rung);
    });
  }

  it('x4 and x6 are SILENT — persistence is not a re-fire', () => {
    // The load-bearing pair. An unmoved item is still unmoved at x4 and x6; if the ladder used
    // >= instead of ===, both would fire and the chairman rung would repeat every tick forever.
    // That is the exact flood FR_C exists to prevent, and >= passes a naive x2/x3/x5 spot check.
    expect(rungForTicks(4)).toBe(RUNG.NONE);
    expect(rungForTicks(6)).toBe(RUNG.NONE);
    expect(rungForTicks(7)).toBe(RUNG.NONE);
  });

  it('rejects non-integer / negative ticks rather than coercing', () => {
    for (const bad of [-1, 1.5, '3', null, undefined, NaN]) {
      expect(() => rungForTicks(bad)).toThrow(TypeError);
    }
  });
});

describe('TS-2 — lanes are EXCLUSIVE; pending-chairman never reaches an owner lane', () => {
  it('pending_chairman goes to the chairman packet even when an owner is set', () => {
    // The failure that matters: a pending-chairman item that also carries an owner must NOT
    // route to the owner. If it did, the chairman packet stops being the authoritative list of
    // what is the chairman's to decide — which is the only reason the packet is worth reading.
    expect(laneForStall({ stall_type: 'pending_chairman', owner: 'alpha' })).toBe(LANE.CHAIRMAN);
  });

  it('owner-lane stall routes to its owner', () => {
    expect(laneForStall({ stall_type: 'owner_stall', owner: 'alpha' })).toBe(LANE.OWNER);
  });

  it('unsourced work routes to Adam', () => {
    expect(laneForStall({ stall_type: 'unsourced' })).toBe(LANE.ADAM);
  });

  it('an ownerless, unclassified stall goes to Adam rather than a phantom owner lane', () => {
    // Falling back to OWNER here would emit a message to nobody and read as handled.
    expect(laneForStall({ stall_type: 'something_else', owner: null })).toBe(LANE.ADAM);
  });

  it('THE SIMULTANEOUS CASE — three types in one tick, each in exactly one lane', () => {
    // Per the PRD smoke step 2: stall all three types at once and assert no overlap. Grouping
    // is what a per-lane aggregator consumes, so an item appearing twice would be double-sent.
    const stalls = [
      { id: 'a', stall_type: 'pending_chairman', owner: 'alpha' },
      { id: 'b', stall_type: 'owner_stall', owner: 'bravo' },
      { id: 'c', stall_type: 'unsourced' },
    ];
    const grouped = groupByLane(stalls);
    expect(grouped.get(LANE.CHAIRMAN).map((s) => s.id)).toEqual(['a']);
    expect(grouped.get(LANE.OWNER).map((s) => s.id)).toEqual(['b']);
    expect(grouped.get(LANE.ADAM).map((s) => s.id)).toEqual(['c']);

    // Exclusivity stated as a COUNT, not as three separate memberships: every stall appears
    // exactly once across all lanes. Three passing membership checks would still allow a
    // fourth lane holding a duplicate.
    const total = [...grouped.values()].reduce((n, arr) => n + arr.length, 0);
    expect(total).toBe(stalls.length);
  });

  it('rejects a non-object stall rather than routing it somewhere', () => {
    for (const bad of [null, undefined, 'stall', 42]) {
      expect(() => laneForStall(bad)).toThrow(TypeError);
    }
  });
});
