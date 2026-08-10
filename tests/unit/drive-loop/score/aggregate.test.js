/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — the drive_score aggregate.
 *
 * The load-bearing case is the one where a leg is UNAVAILABLE. Everything else here is addition.
 */

import { describe, it, expect } from 'vitest';
import { aggregateScore, POINTS_PER_LEG, SPEC_LEG_COUNT } from '../../../../lib/drive-loop/score/aggregate.js';
import { unavailable } from '../../../../lib/drive-loop/report-posture.js';
import { cite } from '../../../../lib/drive-loop/citation.js';

const leg = (name, points, rowIds = []) => ({
  leg: name,
  points: cite({
    value: points, table: 't', predicate: 'p', source: 's',
    ...(rowIds.length ? { row_ids: rowIds } : {}),
  }),
});
const brokenLeg = (name, reason) => ({ leg: name, unavailable: unavailable(reason) });

describe('aggregate — an unavailable leg is not a zero leg', () => {
  it('[THE RULE] excludes an unavailable leg from the DENOMINATOR rather than scoring it 0', () => {
    // 2/4 over two measured legs, NOT 2/6 with a third silently zeroed. The second reads as a worse
    // week than it was, and nothing on the row would say why.
    const r = aggregateScore({ legs: [leg('a', 2), leg('b', 0), brokenLeg('c', 'query threw')] });
    expect(r.score.value).toBe(2);
    expect(r.possible).toBe(4);
    expect(r.measured_legs).toEqual(['a', 'b']);
    expect(r.unavailable_legs).toEqual([{ leg: 'c', reason: 'query threw' }]);
  });

  it('distinguishes a MEASURED zero from an unavailable one', () => {
    const measuredZero = aggregateScore({ legs: [leg('a', 0), leg('b', 0)] });
    const bothBroken = aggregateScore({ legs: [brokenLeg('a', 'x'), brokenLeg('b', 'y')] });
    expect(measuredZero.score.value).toBe(0);
    expect(measuredZero.possible).toBe(4);      // measured, and it is zero
    expect(bothBroken.score.value).toBe(0);
    expect(bothBroken.possible).toBe(0);        // nothing measured — 0/0, visibly
    expect(bothBroken.unavailable_legs).toHaveLength(2);
  });

  it('a leg with no numeric points node is unavailable, not zero', () => {
    // The silent version of the same collapse: a leg that returned a malformed shape.
    const r = aggregateScore({ legs: [leg('a', 2), { leg: 'b' }, { leg: 'c', points: { value: 'two' } }] });
    expect(r.possible).toBe(2);
    expect(r.unavailable_legs.map((u) => u.leg)).toEqual(['b', 'c']);
  });

  it('[FR-2] states the RATIFIED denominator (3 legs / 6 points) with provenance — literally, not tautologically', () => {
    // SD-LEO-INFRA-DRIVE-SCORE-DENOMINATOR-001: the prior assertion read `X/${SPEC_LEG_COUNT*POINTS_PER_LEG}`
    // — the SAME expression the source emits from the SAME imported constant, so it stayed green in
    // lockstep and pinned nothing. Assert the ratified values LITERALLY instead, plus the derived count.
    const r = aggregateScore({ legs: [leg('a', 2)] });
    expect(SPEC_LEG_COUNT).toBe(3);                 // derived from the frozen DRIVE_SCORE_LEGS SSOT
    expect(SPEC_LEG_COUNT * POINTS_PER_LEG).toBe(6);
    expect(r.score.predicate).toMatch(/out of 2/);
    expect(r.score.predicate).toMatch(/UNAVAILABLE LEGS ARE EXCLUDED FROM THE DENOMINATOR/);
    expect(r.score.limitation).toMatch(/RATIFIED at 3 legs \/ 6 points/);
    expect(r.score.limitation).toMatch(/d50b9f12/);            // Adam ruling provenance
    expect(r.score.limitation).toMatch(/ac704cbd/);            // coordinator scope provenance
    expect(r.score.limitation).not.toMatch(/NOT RATIFIED/);    // the placeholder wording is gone
    expect(r.score.limitation).not.toMatch(/X\/8/);
  });

  it('unions row_ids, and a leg citing NONE is not treated as a gap', () => {
    // leg 4 deliberately cites no rows (FR-2). It must still count toward the score.
    const r = aggregateScore({ legs: [leg('a', 2, ['r1', 'r2']), leg('leg4_capacity', 2)] });
    expect(r.score.value).toBe(4);
    expect(r.possible).toBe(4);
    expect(r.score.citation.row_ids).toEqual(['r1', 'r2']);
  });

  it('[VACUITY] no legs at all is 0/0, not full marks and not a silent zero', () => {
    const r = aggregateScore({ legs: [] });
    expect(r.score.value).toBe(0);
    expect(r.possible).toBe(0);
    expect(r.measured_legs).toEqual([]);
  });
});

describe('aggregate — chairman decision latency sits beside the score, ungraded', () => {
  it('is reported but NEVER added to the total', () => {
    const withLatency = aggregateScore({ legs: [leg('a', 2)], decisionLatency: { median_hours: 40 } });
    const without = aggregateScore({ legs: [leg('a', 2)] });
    expect(withLatency.score.value).toBe(without.score.value);
    expect(withLatency.possible).toBe(without.possible);
    expect(withLatency.chairman_decision_latency).toMatchObject({ median_hours: 40, graded: false });
    expect(withLatency.chairman_decision_latency.note).toMatch(/NEVER folded into the total/);
  });

  it('omits the block entirely when there is nothing to report, rather than faking a zero', () => {
    expect(aggregateScore({ legs: [leg('a', 2)] }).chairman_decision_latency).toBeUndefined();
  });
});
