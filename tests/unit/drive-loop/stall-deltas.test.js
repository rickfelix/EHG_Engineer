// SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — Section 5 (FR-5, FR_B, FR_D, TS-13).
//
// The requirement this section exists for is a NEGATIVE: item completions that do not move the
// position must NEVER reset the position clock. A section that resets on churn still produces
// deltas, still renders numbers, and reports a healthy plan while the plan does not move. Most
// of these tests are that one property from different angles.

import { describe, it, expect } from 'vitest';
import {
  buildStallDeltas, computePositionStall, computeItemDeltas, SECTION_ID,
} from '../../../lib/drive-loop/sections/stall-deltas.js';
import { isUnmeasurable } from '../../../lib/drive-loop/citation.js';

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;

const priorWith = (position, unmovedSince, items = {}) => ({
  id: 'prior-report-1',
  sections: {
    [SECTION_ID]: {
      position: { position, unmoved_since_ms: unmovedSince },
      items: { open: items.open || [], consecutive_presence_reports: items.consecutive_presence_reports || {} },
    },
  },
});

describe('TS-13 / FR_B — the position clock is independent of item churn', () => {
  it('THE PROPERTY: closing items does NOT reset the position clock', () => {
    // Prior: position "wave-2:gate-A", unmoved since T0. Three items were open.
    const prior = priorWith('wave-2:gate-A', T0, { open: ['i1', 'i2', 'i3'] });

    // Now: two items closed — real work happened — but the position did not move.
    const s = computePositionStall({
      currentPosition: 'wave-2:gate-A',
      priorReport: prior,
      nowMs: T0 + 48 * HOUR,
    });

    expect(s.moved).toBe(false);
    // The clock carries the ORIGINAL timestamp forward. If this were T0 + 48h, closing items
    // would have laundered 48 hours of no progress into a fresh start.
    expect(s.unmoved_since_ms).toBe(T0);
  });

  it('a position that DID move resets the clock to now', () => {
    const prior = priorWith('wave-2:gate-A', T0);
    const s = computePositionStall({ currentPosition: 'wave-3:gate-B', priorReport: prior, nowMs: T0 + 10 * HOUR });

    expect(s.moved).toBe(true);
    expect(s.unmoved_since_ms).toBe(T0 + 10 * HOUR);
  });

  it('running the report again does not reset the clock either', () => {
    // The other way to launder a stall: let the act of observing count as movement.
    const prior = priorWith('wave-2:gate-A', T0);
    const first = computePositionStall({ currentPosition: 'wave-2:gate-A', priorReport: prior, nowMs: T0 + HOUR });
    const second = computePositionStall({
      currentPosition: 'wave-2:gate-A',
      priorReport: priorWith('wave-2:gate-A', first.unmoved_since_ms),
      nowMs: T0 + 2 * HOUR,
    });

    expect(second.unmoved_since_ms).toBe(T0);
  });

  it('a first observation is not a zero-length stall', () => {
    const s = computePositionStall({ currentPosition: 'wave-1:gate-A', priorReport: null, nowMs: T0 });

    expect(s.first_observation).toBe(true);
    expect(s.moved).toBeNull();
    // 0 would render as "unmoved for no time", which is a claim we have not earned and which
    // would start every fresh instrument with a clean bill of health.
    expect(s.unmoved_since_ms).toBeNull();
  });
});

describe('FR_D — item deltas count REPORTS, position counts WALL TIME', () => {
  it('an item still open increments its report count', () => {
    const prior = priorWith('p', T0, { open: ['i1', 'i2'], consecutive_presence_reports: { i1: 2 } });
    const d = computeItemDeltas({ currentItemIds: ['i1', 'i2'], priorReport: prior });

    expect(d.consecutive_presence_reports.i1).toBe(3);
    expect(d.consecutive_presence_reports.i2).toBe(1);
  });

  it('a closed item leaves the unmoved set entirely', () => {
    const prior = priorWith('p', T0, { open: ['i1', 'i2'], consecutive_presence_reports: { i1: 4, i2: 1 } });
    const d = computeItemDeltas({ currentItemIds: ['i2'], priorReport: prior });

    expect(d.closed).toEqual(['i1']);
    expect(d.consecutive_presence_reports).not.toHaveProperty('i1');
  });

  it('a newly opened item starts at no count, not at the prior report count', () => {
    const prior = priorWith('p', T0, { open: ['i1'], consecutive_presence_reports: { i1: 5 } });
    const d = computeItemDeltas({ currentItemIds: ['i1', 'i2'], priorReport: prior });

    expect(d.opened).toEqual(['i2']);
    expect(d.consecutive_presence_reports.i2).toBeUndefined();
    expect(d.consecutive_presence_reports.i1).toBe(6);
  });

  it('the two clocks use different units, so they cannot be compared directly', () => {
    const prior = priorWith('same', T0, { open: ['i1'], consecutive_presence_reports: { i1: 1 } });
    const s = buildStallDeltas({ currentPosition: 'same', currentItemIds: ['i1'], priorReport: prior, nowMs: T0 + 72 * HOUR });

    // Position carries a TIMESTAMP; items carry a COUNT. Conflating them is how a ladder ends
    // up firing on the wrong subject's threshold.
    expect(typeof s.position.unmoved_since_ms).toBe('number');
    expect(typeof s.items.consecutive_presence_reports.i1).toBe('number');
    expect(s.position.unmoved_since_ms).toBe(T0);
    expect(s.items.consecutive_presence_reports.i1).toBe(2);
  });
});

describe('Section 5 — the built section', () => {
  it('reports both movements and cites the prior report row', () => {
    const prior = priorWith('wave-2:gate-A', T0, { open: ['i1', 'i2'] });
    const s = buildStallDeltas({ currentPosition: 'wave-2:gate-A', currentItemIds: ['i2'], priorReport: prior, nowMs: T0 + HOUR });

    expect(s.section).toBe(SECTION_ID);
    expect(s.summary.value.closed).toBe(1);
    expect(s.summary.value.position_moved).toBe(false);
    // The delta is measured AGAINST that row, so that row is the citation.
    expect(s.summary.citation.row_ids).toEqual(['prior-report-1']);
  });

  it('labels a first observation rather than presenting it as no movement', () => {
    const s = buildStallDeltas({ currentPosition: 'p', currentItemIds: ['i1'], priorReport: null, nowMs: T0 });
    expect(s.summary.limitation).toMatch(/not a zero-length stall/);
  });

  it('is UNMEASURABLE without a clock rather than inventing one', () => {
    const s = buildStallDeltas({ currentPosition: 'p', currentItemIds: [], priorReport: null });
    expect(isUnmeasurable(s.deltas)).toBe(true);
    expect(s.deltas.reason).toMatch(/needs a clock/);
  });

  it('carries the park-suppression flag without reimplementing the predicate', () => {
    // FR_A lives in -E. This module consumes the verdict; owning it in both places is how two
    // children end up with two subtly different park semantics.
    const s = buildStallDeltas({ currentPosition: 'p', currentItemIds: [], priorReport: priorWith('p', T0), nowMs: T0 + HOUR, suppressed: true });
    expect(s.position.suppressed).toBe(true);
  });
});

describe('the item counter says what it MEASURES, not what a reader hopes it measures', () => {
  it('counts consecutive PRESENCE — an item that progressed still increments', () => {
    // The defect this rename closed. The prior report carries only item IDs, so nothing here can
    // distinguish "sat untouched" from "was claimed, unblocked and had a PR opened". Both
    // increment. Naming it unmoved_reports made an x5 read as "nothing happened in five
    // reports", which would escalate precisely the work that is going well.
    const prior = priorWith('p', T0, { open: ['i1'], consecutive_presence_reports: { i1: 4 } });
    const d = computeItemDeltas({ currentItemIds: ['i1'], priorReport: prior });
    expect(d.consecutive_presence_reports.i1).toBe(5);
    expect(d, 'the overclaiming name must not come back').not.toHaveProperty('unmoved_reports');
  });

  it('EMITS the presence-vs-movement limitation, so the caveat travels with the number', () => {
    // A limitation that lives only in a source comment is invisible to every consumer of the
    // report. This one rides the emission, per the C4 rule that a citation states what was
    // actually measured.
    const s = buildStallDeltas({
      currentPosition: 'p',
      currentItemIds: ['i1'],
      priorReport: priorWith('p', T0, { open: ['i1'] }),
      nowMs: T0 + HOUR,
    });
    expect(s.summary.limitation).toMatch(/PRESENT in, NOT that it has failed to progress/);
  });
});
