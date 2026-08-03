/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — leg 2 (FR-3): uptake of the ranked top 5.
 *
 * The interesting cases are all at the edges of the window and at the empty input. The middle of
 * the range is arithmetic and proves nothing, so most of this file is boundaries and the ways a
 * malformed row could manufacture a passing score.
 */

import { describe, it, expect } from 'vitest';
import {
  scoreLeg2, claimedWithin, CLAIM_WINDOW_MS, LEG_POINTS, UPTAKE_THRESHOLD,
} from '../../../../lib/drive-loop/score/leg2-uptake.js';

const NOW = Date.parse('2026-08-03T12:00:00Z');
const at = (ms) => new Date(ms).toISOString();
/** An SD with one claim event at the given offset BEFORE now. */
const sd = (id, agoMs) => ({
  id,
  metadata: agoMs === null ? {} : { claim_history: [{ session_id: 's', claimed_at: at(NOW - agoMs) }] },
});
const five = (...offsets) => offsets.map((o, i) => sd(`sd${i + 1}`, o));

describe('leg2 — uptake of the ranked top 5', () => {
  it('the 24h boundary is pinned, not inferred', () => {
    expect(claimedWithin(sd('a', CLAIM_WINDOW_MS - 1000), NOW)).toBe(true);   // inside
    expect(claimedWithin(sd('a', CLAIM_WINDOW_MS), NOW)).toBe(true);          // exactly at, inclusive
    expect(claimedWithin(sd('a', CLAIM_WINDOW_MS + 1000), NOW)).toBe(false);  // outside
  });

  it('a FUTURE-dated claim is not uptake', () => {
    // Clock skew or a bad write must not manufacture a passing score. Without the `t <= nowMs`
    // guard, a stamp an hour in the future reads as "0ms ago" under a naive abs() and counts.
    expect(claimedWithin({ id: 'a', metadata: { claim_history: [{ claimed_at: at(NOW + 3_600_000) }] } }, NOW)).toBe(false);
  });

  it('an unparseable or absent stamp is not uptake', () => {
    expect(claimedWithin({ id: 'a', metadata: { claim_history: [{ claimed_at: 'not-a-date' }] } }, NOW)).toBe(false);
    expect(claimedWithin({ id: 'a', metadata: { claim_history: [{}] } }, NOW)).toBe(false);
    expect(claimedWithin({ id: 'a', metadata: {} }, NOW)).toBe(false);
    expect(claimedWithin({ id: 'a' }, NOW)).toBe(false);
    // claim_history not an array — a shape change upstream must read as no-uptake, not throw.
    expect(claimedWithin({ id: 'a', metadata: { claim_history: {} } }, NOW)).toBe(false);
  });

  it('[VACUITY] an EMPTY ranking scores 0 and fraction 0, never full marks', () => {
    // 0/0 is undefined; reporting it as 1.0 would award full uptake for a ranking nobody produced.
    const r = scoreLeg2({ rankedTop5: [], nowMs: NOW });
    expect(r.fraction.value).toBe(0);
    expect(r.points.value).toBe(0);
  });

  it('awards the points at the threshold and withholds them below it', () => {
    const H = CLAIM_WINDOW_MS / 2;
    const OLD = CLAIM_WINDOW_MS * 2;
    const fourOfFive = scoreLeg2({ rankedTop5: five(H, H, H, H, OLD), nowMs: NOW });
    expect(fourOfFive.fraction.value).toBeCloseTo(0.8);
    expect(fourOfFive.points.value).toBe(LEG_POINTS);

    const threeOfFive = scoreLeg2({ rankedTop5: five(H, H, H, OLD, OLD), nowMs: NOW });
    expect(threeOfFive.fraction.value).toBeCloseTo(0.6);
    expect(threeOfFive.points.value).toBe(0);
  });

  it('the threshold is injectable, so ratifying a different one cannot disturb the measurement', () => {
    // The point of the separation: same input, same fraction, different scoring rule.
    const items = five(CLAIM_WINDOW_MS / 2, CLAIM_WINDOW_MS * 2, CLAIM_WINDOW_MS * 2, CLAIM_WINDOW_MS * 2, CLAIM_WINDOW_MS * 2);
    const strict = scoreLeg2({ rankedTop5: items, nowMs: NOW });
    const lax = scoreLeg2({ rankedTop5: items, nowMs: NOW, threshold: 0.2 });
    expect(strict.fraction.value).toBe(lax.fraction.value);
    expect(strict.points.value).toBe(0);
    expect(lax.points.value).toBe(LEG_POINTS);
  });

  it('the UNRATIFIED threshold is disclosed in the emission, not just in a comment', () => {
    // A reader of the row must learn that the scoring rule is a placeholder. If this ever gets
    // quietly deleted, the score starts looking settled when it is not.
    const r = scoreLeg2({ rankedTop5: five(0, 0, 0, 0, 0), nowMs: NOW });
    expect(r.points.limitation).toMatch(/THRESHOLD IS NOT RATIFIED/);
    expect(r.points.predicate).toMatch(new RegExp(String(UPTAKE_THRESHOLD)));
  });

  it('the claim_history grain limitation travels on BOTH emissions', () => {
    // FR-3's ruling: the limitation rides with every emission an auditor reads, not a design doc.
    const r = scoreLeg2({ rankedTop5: five(0), nowMs: NOW });
    for (const node of [r.fraction, r.points]) {
      expect(node.limitation).toMatch(/claim_history entries carry no row id of their own/);
      expect(node.citation.row_ids).toEqual(['sd1']);
    }
  });

  it('refuses an implicit clock rather than defaulting to Date.now()', () => {
    expect(() => scoreLeg2({ rankedTop5: five(0) })).toThrow(/nowMs must be provided/);
  });
});
