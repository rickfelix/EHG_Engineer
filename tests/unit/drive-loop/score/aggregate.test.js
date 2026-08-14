/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — the drive_score aggregate.
 *
 * The load-bearing case is the one where a leg is UNAVAILABLE. Everything else here is addition.
 */

import { describe, it, expect } from 'vitest';
import { aggregateScore, POINTS_PER_LEG, SPEC_LEG_COUNT } from '../../../../lib/drive-loop/score/aggregate.js';
import { unavailable } from '../../../../lib/drive-loop/report-posture.js';
import { cite } from '../../../../lib/drive-loop/citation.js';

/**
 * SD-LEO-INFRA-DRIVE-SCORE-PER-001: `table` is now a PARAMETER, and that is load-bearing rather
 * than tidier. It used to be hard-coded 't' for every fake leg, so this fixture COULD NOT BUILD
 * two legs citing two different tables — which is precisely the shape of the live defect (leg1
 * cites roadmap_wave_items, leg2 cites strategic_directives_v2, and the aggregate stamped
 * 'drive_reports' over the union of both). A suite whose fixture cannot express the bug will
 * report green through it forever.
 */
const leg = (name, points, rowIds = [], table = 't', extra = {}) => ({
  leg: name,
  points: cite({
    value: points, table, predicate: `p:${name}`, source: 's',
    ...(rowIds.length ? { row_ids: rowIds } : {}),
    ...extra,
  }),
});
const brokenLeg = (name, reason) => ({ leg: name, unavailable: unavailable(reason) });
/** measured_legs is now objects; most assertions below only care about which legs are in it. */
const legNames = (r) => r.measured_legs.map((m) => m.leg);

describe('aggregate — an unavailable leg is not a zero leg', () => {
  it('[THE RULE] excludes an unavailable leg from the DENOMINATOR rather than scoring it 0', () => {
    // 2/4 over two measured legs, NOT 2/6 with a third silently zeroed. The second reads as a worse
    // week than it was, and nothing on the row would say why.
    const r = aggregateScore({ legs: [leg('a', 2), leg('b', 0), brokenLeg('c', 'query threw')] });
    expect(r.score.value).toBe(2);
    expect(r.possible).toBe(4);
    expect(legNames(r)).toEqual(['a', 'b']);
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

  it('a leg citing NO rows is not treated as a gap', () => {
    // leg 4 deliberately cites no rows (FR-2). It must still count toward the score.
    const r = aggregateScore({ legs: [leg('a', 2, ['r1', 'r2']), leg('leg4_capacity', 2)] });
    expect(r.score.value).toBe(4);
    expect(r.possible).toBe(4);
  });

  it('[VACUITY] no legs at all is 0/0, not full marks and not a silent zero', () => {
    const r = aggregateScore({ legs: [] });
    expect(r.score.value).toBe(0);
    expect(r.possible).toBe(0);
    expect(r.measured_legs).toEqual([]);
  });
});

describe('aggregate — PER-001: a citation names one table, so it may carry only that table\'s ids', () => {
  // The live defect, reproduced as a fixture: two legs, two DIFFERENT tables. Under the old code
  // their ids were unioned into one array under table:'drive_reports'. Measured on the real rows —
  // drive-2026-08-12 and drive-2026-08-13 each carried 12 such ids, 0 of which existed in
  // drive_reports (11 were roadmap_wave_items, 1 was strategic_directives_v2).
  const twoTables = () => aggregateScore({
    legs: [
      leg('leg1_landed', 2, ['rw-1', 'rw-2'], 'roadmap_wave_items'),
      leg('leg2_uptake', 1, ['SD-ALPHA-001'], 'strategic_directives_v2', {
        grains: [{ sd_id: 'SD-ALPHA-001', claim_index: 0, claimed_at: '2026-08-12T00:00:00Z' }],
      }),
      leg('leg4_capacity', 2, [], 'drive_reports'),
    ],
  });

  it('[FR-2] the top-level score citation carries NO row_ids at all', () => {
    const r = twoTables();
    expect(r.score.citation.row_ids).toBeUndefined();
    expect(Object.hasOwn(r.score.citation, 'row_ids')).toBe(false);
    // The table stays drive_reports, which is honest — the SCORE is what lives there.
    expect(r.score.citation.table).toBe('drive_reports');
  });

  it('[FR-2] NEGATIVE: no array anywhere in the output fuses ids from two different tables', () => {
    const r = twoTables();
    // The guard that would have caught the original bug. Walk every array of strings in the
    // emitted object and assert none of them contains ids belonging to two different legs.
    const fused = [];
    const walk = (node, path) => {
      if (Array.isArray(node)) {
        const ids = node.filter((v) => typeof v === 'string');
        if (ids.includes('rw-1') && ids.includes('SD-ALPHA-001')) fused.push(path);
        node.forEach((v, i) => walk(v, `${path}[${i}]`));
        return;
      }
      if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
    };
    walk(r, '$');
    expect(fused, `row ids from two tables were fused at: ${fused.join(', ')}`).toEqual([]);
  });

  it('[FR-2] the predicate STATES the deferral, so the prose cannot go stale while the shape is right', () => {
    // Without this, an implementation could drop row_ids and still describe a union in words —
    // the number correct and the sentence beside it false.
    const r = twoTables();
    expect(r.score.predicate).toMatch(/CARRIES NO row_ids ON PURPOSE/);
    expect(r.score.predicate).toMatch(/measured_legs/);
  });

  it('[FR-1] each measured leg carries its OWN table and its OWN ids, copied not re-derived', () => {
    const r = twoTables();
    const byLeg = Object.fromEntries(r.measured_legs.map((m) => [m.leg, m]));
    expect(byLeg.leg1_landed.table).toBe('roadmap_wave_items');
    expect(byLeg.leg1_landed.row_ids).toEqual(['rw-1', 'rw-2']);
    expect(byLeg.leg2_uptake.table).toBe('strategic_directives_v2');
    expect(byLeg.leg2_uptake.row_ids).toEqual(['SD-ALPHA-001']);
    expect(byLeg.leg1_landed.predicate).toBe('p:leg1_landed');
  });

  it('[FR-1/TS-12] leg2 grains survive, and a leg with no row grain has row_ids ABSENT, not []', () => {
    const r = twoTables();
    const byLeg = Object.fromEntries(r.measured_legs.map((m) => [m.leg, m]));
    // The composite locator is the only thing that locates a claim EVENT — claim_history rows have
    // no id of their own. Dropping it would be a rationale shipped in place of the assertion.
    expect(byLeg.leg2_uptake.grains).toEqual([
      { sd_id: 'SD-ALPHA-001', claim_index: 0, claimed_at: '2026-08-12T00:00:00Z' },
    ]);
    // ABSENT vs []: "this leg has no row grain" and "we looked and found none" are different claims.
    expect(Object.hasOwn(byLeg.leg4_capacity, 'row_ids')).toBe(false);
    expect(byLeg.leg4_capacity.table).toBe('drive_reports');
  });

  it('[FR-1] measured_legs contains no bare strings — the shape downstream readers get is uniform', () => {
    const r = twoTables();
    expect(r.measured_legs.every((m) => m && typeof m === 'object' && !Array.isArray(m))).toBe(true);
    expect(r.measured_legs.some((m) => typeof m === 'string')).toBe(false);
    // .leg is still exposed, because the RATIFIED_LEG_IDS drift guard reads leg IDs off this array.
    expect(r.measured_legs.map((m) => m.leg)).toEqual(['leg1_landed', 'leg2_uptake', 'leg4_capacity']);
  });

  it('[FR-3] the citation verification node is reported BESIDE the score, and omitted when absent', () => {
    const v = { legs_checked: 2, ids_checked: 3, ids_resolved: 3, unresolved: [], note: 'n' };
    const withV = aggregateScore({ legs: [leg('a', 2, ['r1'])], citationVerification: v });
    expect(withV.citation_verification).toEqual(v);
    // Never folded into the score itself.
    expect(withV.score.value).toBe(2);
    expect(aggregateScore({ legs: [leg('a', 2, ['r1'])] }).citation_verification).toBeUndefined();
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
