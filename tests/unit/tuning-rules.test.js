/**
 * SD-LEO-INFRA-GATE-THRESHOLD-TUNING-001 — the tuner must not loosen on weaker evidence than it
 * tightens on, and must not publish a number its own recommendation disclaims.
 *
 * EVERY SEEDED CASE BELOW IS A ROW MEASURED LIVE on 2026-08-04, not an invented one. A seeded case
 * drawn from real data cannot later be waved away as hypothetical.
 */

import { describe, it, expect } from 'vitest';
import { recommend, RECOMMENDATION, MIN_SAMPLE } from '../../lib/quality/tuning-rules.js';

// The six live DECREASE rows. Each proposed a bar that, after the cut, still sat ABOVE its mean.
const LIVE_DECREASE = [
  { name: 'bugfix', pass_rate: 25.2, avg_score: 41.9, current_threshold: 60, total: 234 },
  { name: 'database', pass_rate: 0, avg_score: 34.3, current_threshold: 65, total: 8 },
  { name: 'documentation', pass_rate: 15.4, avg_score: 41, current_threshold: 50, total: 13 },
  { name: 'feature', pass_rate: 15.6, avg_score: 40.5, current_threshold: 60, total: 244 },
  { name: 'infrastructure', pass_rate: 20.9, avg_score: 41.3, current_threshold: 55, total: 1457 },
  { name: 'orchestrator', pass_rate: 13.1, avg_score: 34.9, current_threshold: 50, total: 61 },
];

// The live INCREASE rows — the positive control. These must survive the new symmetry.
const LIVE_INCREASE = [
  { name: 'feature x prd', pass_rate: 100, avg_score: 80.4, current_threshold: 60, total: 53 },
  { name: 'infrastructure x retrospective', pass_rate: 100, avg_score: 91.3, current_threshold: 55, total: 15 },
  { name: 'refactor x retrospective', pass_rate: 100, avg_score: 88.4, current_threshold: 60, total: 11 },
  { name: 'refactor x user_story', pass_rate: 100, avg_score: 82.4, current_threshold: 60, total: 41 },
];

describe('TS-3 — SEEDED: the two arms carry equal evidentiary burden', () => {
  it('the measured n=6 / n=8 pair no longer resolves asymmetrically', () => {
    // THE DEFECT, verbatim from one live run: orchestrator x retrospective was DENIED an increase at
    // n=6 while database x user_story FIRED a decrease at n=8. Too little evidence to tighten, enough
    // to loosen — a ratchet visible without any outcome data.
    const deniedIncrease = recommend({ pass_rate: 100, avg_score: 88.7, current_threshold: 50, total: 6 });
    const firedDecrease = recommend({ pass_rate: 0, avg_score: 34.3, current_threshold: 65, total: 8 });
    expect(deniedIncrease.recommendation).toBe(RECOMMENDATION.INSUFFICIENT_DATA);
    expect(firedDecrease.recommendation).toBe(RECOMMENDATION.INSUFFICIENT_DATA);
    // The point is not that both are refused — it is that they are refused for the SAME reason.
    expect(firedDecrease.recommendation).toBe(deniedIncrease.recommendation);
  });

  it('a sample sufficient to LOOSEN is also sufficient to TIGHTEN', () => {
    const n = MIN_SAMPLE;
    expect(recommend({ pass_rate: 10, avg_score: 58, current_threshold: 60, total: n }).recommendation)
      .toBe(RECOMMENDATION.DECREASE);
    expect(recommend({ pass_rate: 100, avg_score: 90, current_threshold: 60, total: n }).recommendation)
      .toBe(RECOMMENDATION.INCREASE);
  });

  it('loosening never fires on evidence that would be refused for tightening', () => {
    const belowFloor = MIN_SAMPLE - 1;
    expect(recommend({ pass_rate: 0, avg_score: 58, current_threshold: 60, total: belowFloor }).recommendation)
      .toBe(RECOMMENDATION.INSUFFICIENT_DATA);
  });
});

describe('TS-2 — SEEDED: a row can never contradict its own recommendation', () => {
  it('security x prd (n=2) publishes NO threshold alongside INSUFFICIENT DATA', () => {
    // MEASURED LIVE: this row read "INSUFFICIENT DATA: Need more assessments (minimum 5)" and
    // published suggested_threshold = 70 against a current 65, on the same row.
    const r = recommend({ pass_rate: 100, avg_score: 81.5, current_threshold: 65, total: 2 });
    expect(r.recommendation).toBe(RECOMMENDATION.INSUFFICIENT_DATA);
    expect(r.suggested_threshold).toBeNull();
  });

  it('no outcome ever pairs a non-acting recommendation with a moved number', () => {
    const rows = [
      { pass_rate: 100, avg_score: 81.5, current_threshold: 65, total: 2 },
      { pass_rate: 100, avg_score: 77.7, current_threshold: 65, total: 3 },
      { pass_rate: 84.2, avg_score: 79.5, current_threshold: 60, total: 101 },
      { pass_rate: 89.6, avg_score: 82.7, current_threshold: 60, total: 77 },
      ...LIVE_DECREASE,
    ];
    for (const row of rows) {
      const r = recommend(row);
      const acts = r.recommendation === RECOMMENDATION.DECREASE || r.recommendation === RECOMMENDATION.INCREASE;
      if (!acts) expect(r.suggested_threshold).toBeNull();
      else expect(r.suggested_threshold).not.toBeNull();
    }
  });
});

describe('TS-1 / cosmetic-change guard — none of the six live DECREASEs survives', () => {
  it.each(LIVE_DECREASE)('$name does not recommend a decrease that would not reach the population', (row) => {
    const r = recommend(row);
    expect(r.recommendation).not.toBe(RECOMMENDATION.DECREASE);
    expect(r.suggested_threshold).toBeNull();
  });

  it('the five with enough samples are refused as INEFFECTIVE, not merely under-evidenced', () => {
    // database (n=8) is refused for sample size; the other five have ample data and are refused
    // because the change itself would achieve nothing — a distinction worth keeping visible, since
    // "collect more data" and "this is the wrong lever" call for different responses.
    const ineffective = LIVE_DECREASE.filter((r) => r.total >= MIN_SAMPLE)
      .map((r) => recommend(r).recommendation);
    expect(ineffective).toHaveLength(5);
    for (const v of ineffective) expect(v).toBe(RECOMMENDATION.INEFFECTIVE_CHANGE);
  });
});

describe('TS-5 — POSITIVE CONTROL: symmetry must not be achieved by disabling both arms', () => {
  it.each(LIVE_INCREASE)('$name still recommends INCREASE', (row) => {
    // Without this, weakening the tighten arm — or refusing everything — would pass every negative
    // scenario above while leaving a tuner that recommends nothing at all.
    const r = recommend(row);
    expect(r.recommendation).toBe(RECOMMENDATION.INCREASE);
    expect(r.suggested_threshold).toBe(Math.min(row.current_threshold + 5, 85));
  });

  it('a genuine DECREASE still fires when scores really are clustered just under the bar', () => {
    // The rule must remain capable of loosening. A near-miss population is exactly the case the
    // original DECREASE arm was written for, and it is preserved.
    const r = recommend({ pass_rate: 30, avg_score: 57, current_threshold: 60, total: 40 });
    expect(r.recommendation).toBe(RECOMMENDATION.DECREASE);
    expect(r.suggested_threshold).toBe(55);
  });

  it('OPTIMAL and MONITOR still classify the middle band', () => {
    expect(recommend({ pass_rate: 84.2, avg_score: 79.5, current_threshold: 60, total: 101 }).recommendation)
      .toBe(RECOMMENDATION.OPTIMAL);
    expect(recommend({ pass_rate: 89.6, avg_score: 82.7, current_threshold: 60, total: 77 }).recommendation)
      .toBe(RECOMMENDATION.MONITOR);
  });
});
