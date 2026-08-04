/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — Section 4: dispatch order + next act.
 *
 * The discriminating property is that an ACT is not a REASON. FR-5 names the near-miss:
 * wsjf-priority-fetcher returns a descriptive string ("high value, low effort, unblocked"), which
 * reads like guidance and tells nobody what to do. Every act here must be a member of the closed
 * set, and that is asserted on every emitted row rather than spot-checked.
 */

import { describe, it, expect } from 'vitest';
import { buildNextActs, nextAct, ownerOf, isAct, ACTS, SECTION_ID } from '../../../lib/drive-loop/sections/next-acts.js';

const item = (id, rank, sd = null, title = `t${id}`) => ({ id, title, metadata: { dispatch_rank: rank }, sd });

describe('section 4 — an ACT is not a REASON', () => {
  it('[DISCRIMINATOR] every emitted act is a member of the closed set, never prose', () => {
    const r = buildNextActs([
      item('a', 1, { status: 'ready' }),
      item('b', 2, { status: 'blocked', blocked_on_decision: true }),
      item('c', 3, null),
      item('d', 4, { claiming_session_id: 's1' }),
    ]);
    for (const row of r.order.value) {
      expect(isAct(row.act), `"${row.act}" is not an act — a descriptive string would satisfy a `
        + 'free-text field and move nobody').toBe(true);
      // A reason string would contain spaces/commas; an act is a single token. Belt and braces.
      expect(row.act).toMatch(/^[a-z_]+$/);
    }
  });

  it('maps each condition to the act that actually moves it', () => {
    expect(nextAct({ sd: null })).toBe(ACTS.SOURCE);                                     // no SD yet
    expect(nextAct({ sd: { status: 'blocked' } })).toBe(ACTS.UNBLOCK);                     // go clear it
    expect(nextAct({ sd: { status: 'blocked', blocked_on_decision: true } })).toBe(ACTS.AWAIT_DECISION);
    expect(nextAct({ sd: { unmet_dependencies: ['x'] } })).toBe(ACTS.UNBLOCK);
    expect(nextAct({ sd: { claiming_session_id: 's1' } })).toBe(ACTS.RESUME);              // holder continues
    expect(nextAct({ sd: { status: 'ready' } })).toBe(ACTS.CLAIM);
  });

  it('AWAIT_DECISION is distinct from UNBLOCK — one is actionable by anyone, one is not', () => {
    // Collapsing these would send someone to unblock a thing only the decider can move.
    expect(nextAct({ sd: { status: 'blocked', blocked_on_decision: true } }))
      .not.toBe(nextAct({ sd: { status: 'blocked' } }));
  });
});

describe('section 4 — order and ownership', () => {
  it('orders by the EXISTING dispatch_rank', () => {
    const r = buildNextActs([item('c', 30), item('a', 10), item('b', 20)]);
    expect(r.order.value.map((x) => x.item_id)).toEqual(['a', 'b', 'c']);
    expect(r.order.citation.row_ids).toEqual(['a', 'b', 'c']);
  });

  it('[VACUITY] an item with NO dispatch_rank is EXCLUDED, not defaulted to 0', () => {
    // Defaulting to 0 would sort unranked work to the FRONT of the dispatch queue — the loudest
    // possible wrong answer, and it would look like a deliberate priority.
    const r = buildNextActs([item('ranked', 5), { id: 'unranked', title: 'u', metadata: {}, sd: null }]);
    expect(r.order.value.map((x) => x.item_id)).toEqual(['ranked']);
    expect(r.order.limitation).toMatch(/1 item\(s\) have no dispatch_rank/);
  });

  it('an unowned item is reported UNOWNED, never given the routing lane', () => {
    // lane is sourcing-engine intake routing. Using it would fill the field on nearly every row and
    // name the wrong party, which is worse than an honest null.
    const withLane = { id: 'x', title: 't', metadata: { dispatch_rank: 1 }, lane: 'blocked-on-SD-Y', sd: { status: 'ready' } };
    expect(ownerOf(withLane).owner).toBeNull();
    const r = buildNextActs([withLane]);
    expect(r.order.value[0].owner).toBeNull();
    expect(r.unowned_count.value).toBe(1);
  });

  it('owner comes from the claim, then owner_lane, with the basis stated', () => {
    expect(ownerOf({ sd: { claiming_session_id: 's1', owner_lane: 'L' } })).toEqual({ owner: 's1', basis: 'active claim on the SD' });
    expect(ownerOf({ sd: { owner_lane: 'L' } })).toEqual({ owner: 'L', basis: 'SD owner_lane' });
  });

  it('[VACUITY] no items at all is UNMEASURABLE, not an empty-and-therefore-clear belt', () => {
    // "nothing to dispatch" and "could not read the backlog" must not render identically.
    const r = buildNextActs([]);
    expect(r.order.value).toBeNull();
    expect(r.order.predicate).toBeTruthy();
    expect(r.section).toBe(SECTION_ID);
  });
});
