/**
 * SD-LEO-INFRA-CI-BASELINE-ROT-DETECT-001 — cumulative-rot detection.
 *
 * Sample-first evidence (from Bravo's QF-20260612-915 verify-premise) locked in
 * as tests: main's failure count rotted 102 -> 134 over 13d but decide() never
 * fired because each step stayed under the median-jump trigger. These prove the
 * new detectBaselineRot() catches that, stays immune to single flaky bounces,
 * and that decide() itself is UNCHANGED (additive-only, TR-1).
 */
import { describe, it, expect } from 'vitest';
import { detectBaselineRot, decide, genuineReachableRegressions } from '../../scripts/ci/red-merge-detector.mjs';

// newest-first snapshot in the shape decide()/detectBaselineRot() consume.
const snap = (failed_count, commit_sha) => ({ findings: [{ failed_count, branch: 'main', commit_sha }] });
const seq = (...counts) => counts.map((c) => snap(c));

describe('detectBaselineRot — absolute ceiling', () => {
  it('fires on an ALREADY-rotted flat window (~134, the real observed state)', () => {
    const r = detectBaselineRot(seq(134, 134, 133, 140, 133, 134, 133, 140));
    expect(r.rotted).toBe(true);
    expect(r.rule).toBe('absolute_ceiling');
  });

  it('does NOT fire when only the latest single reading hits the ceiling (single-bounce immunity)', () => {
    // latest spike 140, prior readings healthy ~100 → absolute needs BOTH recent readings
    const r = detectBaselineRot(seq(140, 100, 99, 101, 100, 98));
    expect(r.rotted).toBe(false);
  });

  it('respects an env-style ceiling override via opts', () => {
    expect(detectBaselineRot(seq(105, 104, 100, 100), { ceiling: 200 }).rule).not.toBe('absolute_ceiling');
    expect(detectBaselineRot(seq(105, 104, 100, 100), { ceiling: 103 }).rotted).toBe(true);
  });
});

describe('detectBaselineRot — cumulative trend (slow decay decide() is blind to)', () => {
  it('fires on a sustained climb where each step stays under the per-merge jump and below the ceiling', () => {
    // recent half ~104, older half ~86 → +18 climb; both latest readings sustainedly elevated; all < ceiling 110
    const r = detectBaselineRot(seq(105, 104, 103, 102, 88, 86, 85, 84), { ceiling: 200 });
    expect(r.rotted).toBe(true);
    expect(r.rule).toBe('cumulative_trend');
  });

  it('does NOT fire on a single flaky spike in the recent half (no false positive)', () => {
    // a lone 140 spike inflates the recent median, but the OTHER recent reading is ~100 → not sustained
    const r = detectBaselineRot(seq(140, 100, 99, 100, 98, 99), { ceiling: 200 });
    expect(r.rotted).toBe(false);
  });

  it('does NOT fire on a flat healthy window', () => {
    expect(detectBaselineRot(seq(84, 85, 86, 84, 85, 86), { ceiling: 200 }).rotted).toBe(false);
  });
});

describe('detectBaselineRot — guards', () => {
  it('returns not-rotted with <2 readings', () => {
    expect(detectBaselineRot(seq(134)).rotted).toBe(false);
    expect(detectBaselineRot([]).rotted).toBe(false);
  });
});

describe('decide() regression guard — additive change must not alter it', () => {
  it('still fires file_qf on a confirmed rise above the settled median', () => {
    const v = decide(seq(105, 104, 100, 100, 100).map((s, i) => (i === 0 ? snap(105, 'abc1234567') : s)), []);
    expect(v.action).toBe('file_qf');
  });

  it('still returns noop on a flat window (no confirmed rise)', () => {
    const v = decide(seq(100, 100, 100, 100, 100), []);
    expect(v.action).toBe('noop');
  });

  it('still returns noop on a single transient spike (persistence preserved)', () => {
    const v = decide(seq(100, 118, 100, 100, 100), []);
    expect(v.action).toBe('noop');
  });
});

describe('QF-20260704-047: genuineReachableRegressions (identity+reachability gate)', () => {
  const withIds = (failed_count, ids) => ({ findings: [{ failed_count, failed_test_ids: ids }] });

  it('suppresses (QF-20260704-263 repro): a newly-failing test whose file the merge never touched', () => {
    const latest = withIds(108, ['a.test.js::x', 'sd-completed-handler.test.js::Progress Percentage']);
    const prev = withIds(107, ['a.test.js::x']);
    const changedFiles = ['lib/adam/adherence-probes.js', 'scripts/adam-self-adherence-review.mjs'];
    expect(genuineReachableRegressions(latest, prev, changedFiles)).toEqual([]);
  });

  it('still returns the regression when the blamed commit touches the newly-failing test file', () => {
    const latest = withIds(108, ['a.test.js::x', 'sd-completed-handler.test.js::Progress Percentage']);
    const prev = withIds(107, ['a.test.js::x']);
    const changedFiles = ['sd-completed-handler.test.js'];
    expect(genuineReachableRegressions(latest, prev, changedFiles)).toEqual(['sd-completed-handler.test.js::Progress Percentage']);
  });

  it('returns null (fall back to count-fire) when a snapshot predates failed_test_ids', () => {
    expect(genuineReachableRegressions({ findings: [{ failed_count: 108 }] }, withIds(107, ['a.test.js::x']), [])).toBeNull();
  });
});
