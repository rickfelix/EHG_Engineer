import { describe, it, expect } from 'vitest';
import { computeShadowRescore, MIN_SAMPLE } from '../../../lib/quality/gate-threshold-shadow.js';

const fixture = (scores) => scores.map((weighted_score) => ({ weighted_score }));

describe('QF-20260902-515: gate-threshold shadow re-score', () => {
  it('counts PASS-to-FAIL flips for an INCREASE candidate (60 -> 65)', () => {
    // 62 and 64 pass at 60 but fail at 65; 70 passes both; 40 fails both.
    const rows = fixture([40, 62, 64, 70]);
    const r = computeShadowRescore(rows, 60, 65);
    expect(r.n).toBe(4);
    expect(r.currentPass).toBe(3);
    expect(r.candidatePass).toBe(1);
    expect(r.passToFailFlips).toBe(2);
    expect(r.failToPassFlips).toBe(0);
    expect(r.currentPassRatePct).toBe(75);
    expect(r.candidatePassRatePct).toBe(25);
  });

  it('counts FAIL-to-PASS flips for a DECREASE candidate (65 -> 60)', () => {
    // 62 and 64 fail at 65 but pass at 60; 70 passes both; 40 fails both.
    const rows = fixture([40, 62, 64, 70]);
    const r = computeShadowRescore(rows, 65, 60);
    expect(r.passToFailFlips).toBe(0);
    expect(r.failToPassFlips).toBe(2);
  });

  it('a score exactly AT the candidate threshold passes (>=, not >)', () => {
    const rows = fixture([65]);
    const r = computeShadowRescore(rows, 60, 65);
    expect(r.candidatePass).toBe(1);
    expect(r.passToFailFlips).toBe(0);
  });

  it('produces zero flips when no scores straddle the two thresholds', () => {
    const rows = fixture([10, 90]);
    const r = computeShadowRescore(rows, 60, 65);
    expect(r.passToFailFlips).toBe(0);
    expect(r.failToPassFlips).toBe(0);
    expect(r.currentPass).toBe(1);
    expect(r.candidatePass).toBe(1);
  });

  it('flags BELOW_FLOOR under MIN_SAMPLE and MEETS_FLOOR at/above it', () => {
    const below = computeShadowRescore(fixture(new Array(MIN_SAMPLE - 1).fill(80)), 60, 65);
    const meets = computeShadowRescore(fixture(new Array(MIN_SAMPLE).fill(80)), 60, 65);
    expect(below.sampleFloorVerdict).toBe('BELOW_FLOOR');
    expect(meets.sampleFloorVerdict).toBe('MEETS_FLOOR');
  });

  it('returns null pass rates for an empty population without throwing', () => {
    const r = computeShadowRescore([], 60, 65);
    expect(r.n).toBe(0);
    expect(r.currentPassRatePct).toBeNull();
    expect(r.candidatePassRatePct).toBeNull();
    expect(r.sampleFloorVerdict).toBe('BELOW_FLOOR');
  });

  it('matches the documented specimen: security/user_story n17, no flip beyond the held tolerance', () => {
    // 17 rows, all scoring well clear of the 65->70 candidate band except one at exactly 70.
    const scores = new Array(16).fill(75).concat([70]);
    const r = computeShadowRescore(fixture(scores), 65, 70);
    expect(r.n).toBe(17);
    expect(r.passToFailFlips).toBe(0);
  });
});
