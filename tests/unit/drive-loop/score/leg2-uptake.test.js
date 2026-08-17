/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — leg 2 (FR-3): uptake of the ranked top 5.
 *
 * The interesting cases are all at the edges of the window and at the empty input. The middle of
 * the range is arithmetic and proves nothing, so most of this file is boundaries and the ways a
 * malformed row could manufacture a passing score.
 */

import {
  describe, it, expect, vi,
} from 'vitest';
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
      // Wording updated with the FR-3 grain: the limitation now states a fact about the DATA
      // (entries have no ids, hence a composite locator) rather than excusing a missing citation.
      expect(node.limitation).toMatch(/claim_history entries carry no id of their own/);
      expect(node.limitation).toMatch(/COMPOSITE grain emitted in citation\.grains/);
      expect(node.citation.row_ids).toEqual(['sd1']);
      expect(node.citation.grains, 'the locator must ride with the limitation').toHaveLength(1);
    }
  });

  it('refuses an implicit clock rather than defaulting to Date.now()', () => {
    expect(() => scoreLeg2({ rankedTop5: five(0) })).toThrow(/nowMs must be provided/);
  });

  it('[QF-20260816-166] claimGrain runs exactly ONE pass per SD, not one for grains and one for claimed', () => {
    // Each SD below has exactly one claim_history entry, so claimGrain makes exactly one
    // Date.parse call per invocation. If grains and claimed were still computed via two
    // independent rankedTop5 passes (map + filter), this would be 2*N, not N.
    const parseSpy = vi.spyOn(Date, 'parse');
    const rows = five(0, 0, 0);
    parseSpy.mockClear();
    scoreLeg2({ rankedTop5: rows, nowMs: NOW });
    expect(parseSpy).toHaveBeenCalledTimes(rows.length);
    parseSpy.mockRestore();
  });
});

describe('FR-3 composite grain — the locator, not a rationale for its absence', () => {
  // VALIDATION found that this leg cited SD ids only and shipped a limitation explaining why the
  // finer grain was unavailable — "a rationale shipped in place of the assertion". FR-3 asks for
  // sd row-id + claim_history INDEX + entry TIMESTAMP precisely BECAUSE the entries have no ids.
  const NOW = Date.parse('2026-08-04T12:00:00Z');
  const sdWith = (id, stamps) => ({ id, metadata: { claim_history: stamps.map((s) => ({ claimed_at: s })) } });

  it('emits sd row-id + array INDEX + entry TIMESTAMP', () => {
    const sd = sdWith('sd1', ['2026-01-01T00:00:00Z', '2026-08-04T06:00:00Z']);
    const r = scoreLeg2({ rankedTop5: [sd], nowMs: NOW });
    expect(r.fraction.citation.grains).toEqual([
      { sd_id: 'sd1', claim_index: 1, claimed_at: '2026-08-04T06:00:00Z' },
    ]);
    // The index is load-bearing: it names WHICH entry counted, and the stale first entry proves
    // the index is real rather than always 0.
    expect(r.fraction.citation.grains[0].claim_index).toBe(1);
  });

  it('grains appear on BOTH emissions, and row_ids are still the SDs', () => {
    const r = scoreLeg2({ rankedTop5: [sdWith('sd1', ['2026-08-04T06:00:00Z'])], nowMs: NOW });
    expect(r.points.citation.grains).toHaveLength(1);
    expect(r.fraction.citation.row_ids).toEqual(['sd1']);
  });

  it('[TWO-SIDED] an SD with NO qualifying entry contributes no grain', () => {
    // Without this, a grain builder that emitted one per SD regardless would pass the tests above
    // while citing events that never happened.
    const stale = sdWith('old', ['2026-01-01T00:00:00Z']);
    const future = sdWith('future', ['2027-01-01T00:00:00Z']);
    const r = scoreLeg2({ rankedTop5: [stale, future], nowMs: NOW });
    expect(r.fraction.citation.grains).toBeUndefined();
    expect(r.fraction.value).toBe(0);
  });

  it('the count and the citation describe the SAME set', () => {
    // claimedWithin() and claimGrain() are one predicate now; if they ever disagreed the score
    // would cite a different set than it counted, which is unfalsifiable from the output.
    const rows = [sdWith('a', ['2026-08-04T06:00:00Z']), sdWith('b', ['2020-01-01T00:00:00Z'])];
    const r = scoreLeg2({ rankedTop5: rows, nowMs: NOW });
    expect(r.fraction.citation.grains.map((g) => g.sd_id)).toEqual(r.fraction.citation.row_ids);
  });

  it('the limitation now states a fact about the DATA, not a missing citation', () => {
    const r = scoreLeg2({ rankedTop5: [sdWith('sd1', ['2026-08-04T06:00:00Z'])], nowMs: NOW });
    expect(r.fraction.limitation).toMatch(/COMPOSITE grain emitted in citation\.grains/);
  });
});
