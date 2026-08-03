// SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — Section 3 (FR-5, TS-11).
//
// The two failures that make the three existing classifiers unusable are the two things worth
// testing hardest: no unsourced-plan-work bucket, and blocked conflated with in-flight. Both
// produce four plausible buckets while being wrong, so shape assertions cannot catch either.

import { describe, it, expect } from 'vitest';
import { classifyItem, buildBeltDiagnosis, CASES, SECTION_ID } from '../../../lib/drive-loop/sections/belt-diagnosis.js';

const item = (over = {}) => ({ id: 'i1', promoted_to_sd_key: null, item_disposition: 'pending', lane: null, remainder_state: 'promotable_now', sd: null, ...over });
const withSd = (sdOver = {}, itemOver = {}) => item({ promoted_to_sd_key: 'SD-1', sd: { status: 'draft', claiming_session_id: null, ...sdOver }, ...itemOver });

describe('TS-11 — the four cases are genuinely distinct', () => {
  it('THE BUCKET NO EXISTING CLASSIFIER HAS: a roadmap item with no SD is unsourced plan work', () => {
    // All three existing classifiers start from a population of SDs, so this item is invisible
    // to them entirely — it never enters their input. A belt diagnosis that cannot see it
    // reports a healthy belt while the plan goes unsourced.
    expect(classifyItem(item({ promoted_to_sd_key: null }))).toBe(CASES.UNSOURCED);
  });

  it('an item naming an SD key that did not resolve is still unsourced, not in-flight', () => {
    // The stamped-but-dangling case. Treating a dangling key as sourced would hide it.
    expect(classifyItem(item({ promoted_to_sd_key: 'SD-GHOST', sd: null }))).toBe(CASES.UNSOURCED);
  });

  it('THE CONFLATION: blocked and in-flight are separate answers', () => {
    const blocked = classifyItem(withSd({ status: 'blocked' }));
    const inFlight = classifyItem(withSd({ status: 'in_progress', claiming_session_id: 'sess-1' }));

    expect(blocked).toBe(CASES.BLOCKED);
    expect(inFlight).toBe(CASES.IN_FLIGHT);
    // The assertion that matters: they must not collapse. dep_blocked and
    // in_flight_or_sequence_blocked both fold these together, and the two need opposite
    // responses — one an unblock, the other to be left alone.
    expect(blocked).not.toBe(inFlight);
  });

  it('a blocked-on-* lane is blocked even when the SD itself looks fine', () => {
    expect(classifyItem(withSd({ status: 'draft' }, { lane: 'blocked-on-SD-OTHER-001' }))).toBe(CASES.BLOCKED);
  });

  it('unmet dependencies count as blocked without needing a blocked status', () => {
    expect(classifyItem(withSd({ status: 'draft', unmet_dependencies: ['SD-DEP-1'] }))).toBe(CASES.BLOCKED);
  });

  it('pending-chairman is evaluated FIRST, so a gated item is never reported as unblockable by the fleet', () => {
    // This item would also read as blocked. The gate names who must act, so it wins.
    const gated = withSd({ status: 'blocked' }, { remainder_state: 'gated_on_chairman' });
    expect(classifyItem(gated)).toBe(CASES.PENDING_CHAIRMAN);

    // And a gated item with no SD would otherwise read as unsourced.
    expect(classifyItem(item({ lane: 'chairman-gated' }))).toBe(CASES.PENDING_CHAIRMAN);
  });
});

describe('Section 3 — what is deliberately NOT one of the four', () => {
  it('a sourced, unblocked, UNCLAIMED SD is not in-flight', () => {
    // The most consequential negative. Treating not-blocked as in-flight is exactly how a
    // starved belt reports as busy — the failure the four-case diagnosis exists to expose.
    expect(classifyItem(withSd({ status: 'draft', claiming_session_id: null }))).toBeNull();
  });

  it('completed, cancelled, void and dropped items are not belt state', () => {
    expect(classifyItem(withSd({ status: 'completed' }))).toBeNull();
    expect(classifyItem(withSd({ status: 'cancelled' }))).toBeNull();
    expect(classifyItem(item({ remainder_state: 'void' }))).toBeNull();
    expect(classifyItem(item({ item_disposition: 'dropped' }))).toBeNull();
  });

  it('a cancelled SD does not leak into unsourced just because it is not in flight', () => {
    // A cancelled SD still has a promoted key. Order of checks decides this, and getting it
    // wrong would inflate unsourced work with abandoned items.
    expect(classifyItem(withSd({ status: 'cancelled' }))).toBeNull();
  });
});

describe('Section 3 — the built section', () => {
  const ITEMS = [
    item({ id: 'u1' }),                                                  // unsourced
    item({ id: 'u2', promoted_to_sd_key: 'SD-GHOST', sd: null }),        // unsourced (dangling)
    withSd({ status: 'blocked' }, { id: 'b1' }),                         // blocked
    withSd({ status: 'in_progress', claiming_session_id: 's' }, { id: 'f1' }), // in flight
    withSd({ status: 'draft' }, { id: 'c1', remainder_state: 'gated_on_chairman' }), // chairman
    withSd({ status: 'completed' }, { id: 'x1' }),                       // not belt state
    withSd({ status: 'draft' }, { id: 'w1' }),                           // sourced, waiting — not one of the four
  ];

  it('counts each case and cites its rows', () => {
    const s = buildBeltDiagnosis(ITEMS);
    expect(s.section).toBe(SECTION_ID);
    expect(s.cases[CASES.UNSOURCED].value).toBe(2);
    expect(s.cases[CASES.UNSOURCED].citation.row_ids).toEqual(['u1', 'u2']);
    expect(s.cases[CASES.BLOCKED].value).toBe(1);
    expect(s.cases[CASES.IN_FLIGHT].value).toBe(1);
    expect(s.cases[CASES.PENDING_CHAIRMAN].value).toBe(1);
  });

  it('does not silently absorb the two non-belt items into any bucket', () => {
    const s = buildBeltDiagnosis(ITEMS);
    const total = Object.values(s.cases).reduce((n, c) => n + c.value, 0);
    // 7 items in, 5 classified. If a bucket quietly swallowed the completed item or the
    // waiting-but-sourced one, this total would be 6 or 7 and every individual count would
    // still look reasonable.
    expect(total).toBe(5);
  });

  it('emits all four buckets even when empty, so a missing case is visible as 0', () => {
    const s = buildBeltDiagnosis([]);
    for (const c of Object.values(CASES)) {
      expect(s.cases[c].value).toBe(0);
      // An absent key would render as "no such case" rather than "none of this case" —
      // different claims, and only one of them is true.
      expect(s.cases[c]).toHaveProperty('predicate');
    }
  });

  it('every case carries a predicate naming what counts', () => {
    const s = buildBeltDiagnosis(ITEMS);
    expect(s.cases[CASES.UNSOURCED].predicate).toMatch(/no promoted SD/);
    expect(s.cases[CASES.IN_FLIGHT].predicate).toMatch(/NOT in-flight|actively claimed/);
  });
});
