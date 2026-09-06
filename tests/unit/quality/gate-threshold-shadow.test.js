import { describe, it, expect } from 'vitest';
import {
  computeShadowRescore, MIN_SAMPLE,
  resolveLiveRescoreThreshold, enumerateConfiguredThresholdPairs,
} from '../../../lib/quality/gate-threshold-shadow.js';
import { getPassThreshold } from '../../../scripts/modules/ai-quality-evaluator/scoring.js';

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

describe('SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-E FR-1: resolveLiveRescoreThreshold sources the LIVE threshold, never a stale historical one', () => {
  it('TS-1: returns the live config.js value for feature/prd (65), ignoring a stale fixture current_threshold (60)', () => {
    // feature.prd is 65 live (raised by QF-20260817-837); a view row's historical current_threshold
    // for the same pair can still read 60 for a stretch after the raise. The function must never
    // consult that historical value -- it only calls through to the live getPassThreshold.
    const staleHistoricalViewRow = { sd_type: 'feature', content_type: 'prd', current_threshold: 60 };
    const live = resolveLiveRescoreThreshold(staleHistoricalViewRow.sd_type, staleHistoricalViewRow.content_type);
    expect(live).toBe(65);
    expect(live).not.toBe(staleHistoricalViewRow.current_threshold);
  });

  it('matches getPassThreshold exactly for every live sd_type/content_type override', () => {
    expect(resolveLiveRescoreThreshold('infrastructure', 'prd')).toBe(getPassThreshold('prd', { sd_type: 'infrastructure' }));
    expect(resolveLiveRescoreThreshold('security', 'retrospective')).toBe(getPassThreshold('retrospective', { sd_type: 'security' }));
    expect(resolveLiveRescoreThreshold('bugfix', 'user_story')).toBe(getPassThreshold('user_story', { sd_type: 'bugfix' }));
  });

  it('resolves an sd_type\'s own default when content_type is null (the pair enumerateConfiguredThresholdPairs emits for a "default" key)', () => {
    expect(resolveLiveRescoreThreshold('refactor', null)).toBe(65);
  });
});

describe('SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-E FR-3: coverage-completeness over every configured pair', () => {
  it('TS-2 (positive): every pair enumerateConfiguredThresholdPairs emits resolves to a finite number matching getPassThreshold', () => {
    const pairs = enumerateConfiguredThresholdPairs();
    expect(pairs.length).toBeGreaterThan(0);
    for (const { sdType, contentType } of pairs) {
      const resolved = resolveLiveRescoreThreshold(sdType, contentType);
      expect(Number.isFinite(resolved)).toBe(true);
      expect(resolved).toBe(getPassThreshold(contentType, { sd_type: sdType }));
    }
  });

  it('TS-2 (negative, mutation-proof): the coverage predicate FAILS when an unresolvable pair is injected, proving it discriminates', () => {
    // Mirrors the CI predicate's own logic: "every pair resolves to a finite number". A resolver
    // that falls through to a shared default for anything unrecognized (as getPassThreshold does)
    // can never itself "fail" -- so the discriminating check is a resolver that reports failure
    // (undefined) for a pair outside its known set, exactly the shape a coverage gap would need to
    // be caught. This proves the CHECK, not the graceful-fallback resolver, is what must discriminate.
    const knownPairs = enumerateConfiguredThresholdPairs();
    const strictResolver = (sdType, contentType) => {
      const match = knownPairs.some((p) => p.sdType === sdType && p.contentType === contentType);
      return match ? resolveLiveRescoreThreshold(sdType, contentType) : undefined;
    };
    const allResolve = (pairs) => pairs.every((p) => Number.isFinite(strictResolver(p.sdType, p.contentType)));

    expect(allResolve(knownPairs)).toBe(true);
    const withInjectedGap = [...knownPairs, { sdType: 'nonexistent_type_zzz', contentType: 'ghost_content_type' }];
    expect(allResolve(withInjectedGap)).toBe(false);
  });
});
