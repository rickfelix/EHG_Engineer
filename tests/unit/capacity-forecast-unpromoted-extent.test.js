import { describe, it, expect } from 'vitest';
import { countUnpromotedRoadmapItems, readRemainderBreakdown } from '../../scripts/coordinator-capacity-forecast.mjs';

/**
 * SD-LEO-INFRA-FORECASTER-UNPROMOTED-EXTENT-001.
 *
 * The number this function returns is not a display figure: classifyCorpusGatedDeficit downgrades a
 * real DEFICIT to 'OK-CORPUS-GATED' when it is > 0, and the forecaster's Adam reach-out is gated on
 * verdict.startsWith('DEFICIT'). Counting states nobody can distill therefore suppresses the ask.
 *
 * The live shape that motivated this (2026-08-29, v_plan_of_record_remainder, 261 rows):
 * promotable_now 0, gated_on_chairman 0, in_flight_or_sequence_blocked 2 — the old predicate
 * returned 2 with ZERO promotable supply.
 */
// fetchAllPaginated applies .range() itself and range-pages until a SHORT page, so the fake must
// honour range rather than return the same full page forever -- a builder whose .range() is a no-op
// makes that helper throw its own "likely ignores .range()" error, which would pass this suite for
// the wrong reason.
function fakeClient(rows, { fail = false } = {}) {
  const builder = {
    select: () => builder,
    in: () => builder,
    range: (from, to) => (fail
      ? Promise.resolve({ data: null, error: { message: 'view absent' } })
      : Promise.resolve({ data: rows.slice(from, to + 1), error: null })),
  };
  return { from: () => builder };
}

const LIVE_SHAPE = [
  { id: 1, remainder_state: 'in_flight_or_sequence_blocked' },
  { id: 2, remainder_state: 'in_flight_or_sequence_blocked' },
];

describe('countUnpromotedRoadmapItems extent', () => {
  it('THE REGRESSION: in-flight/sequence-blocked items are not promotable supply', async () => {
    expect(await countUnpromotedRoadmapItems(fakeClient(LIVE_SHAPE))).toBe(0);
  });

  it('gated_on_chairman is blocked on a different gate and does not count either', async () => {
    const rows = [...LIVE_SHAPE, { id: 3, remainder_state: 'gated_on_chairman' }];
    expect(await countUnpromotedRoadmapItems(fakeClient(rows))).toBe(0);
  });

  it('counts promotable_now, and only promotable_now', async () => {
    const rows = [
      ...LIVE_SHAPE,
      { id: 3, remainder_state: 'gated_on_chairman' },
      { id: 4, remainder_state: 'promotable_now' },
      { id: 5, remainder_state: 'promotable_now' },
    ];
    expect(await countUnpromotedRoadmapItems(fakeClient(rows))).toBe(2);
  });

  it('narrowing hides nothing — the other states stay readable as a breakdown', async () => {
    const rows = [...LIVE_SHAPE, { id: 3, remainder_state: 'gated_on_chairman' }];
    expect(await readRemainderBreakdown(fakeClient(rows))).toEqual({
      promotable_now: 0,
      gated_on_chairman: 1,
      in_flight_or_sequence_blocked: 2,
      total: 3,
    });
  });

  it('an unreadable view returns null, NOT 0 — hasBacklog treats unknown as "assume backlog"', async () => {
    expect(await countUnpromotedRoadmapItems(fakeClient([], { fail: true }))).toBeNull();
    expect(await readRemainderBreakdown(fakeClient([], { fail: true }))).toBeNull();
  });

  it('an empty remainder is 0, and 0 is distinguishable from null', async () => {
    expect(await countUnpromotedRoadmapItems(fakeClient([]))).toBe(0);
  });
});
