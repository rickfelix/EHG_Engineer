/**
 * QF-20260701-833 — compare-to-main-snapshot.mjs's BASELINE_REGRESSION check must be
 * IDENTITY-based, not COUNT-based. The old check flagged a regression on ANY rise in
 * the raw failed-test count vs the base-branch snapshot, so an unrelated flaky test
 * bouncing (or a live-DB/CI-secret hiccup) false-blocked PRs whose diff introduced no
 * new failure. Evidenced on PR #5330 (byte-identical 107 failures across reruns, all
 * in files unrelated to the diff) and recurred on PR #5334 / #5337 (same 2 unrelated
 * tests both times). Pure-function coverage, no DB/env required.
 */
import { describe, it, expect } from 'vitest';
import { extractFailingIds, decideRegression } from '../../scripts/compare-to-main-snapshot.mjs';

describe('extractFailingIds', () => {
  it('extracts file::fullName identities for failed assertions only', () => {
    const raw = {
      testResults: [
        {
          name: 'tests/a.test.js',
          assertionResults: [
            { fullName: 'a passes', status: 'passed' },
            { fullName: 'a fails', status: 'failed' },
          ],
        },
        {
          name: 'tests/b.test.js',
          assertionResults: [{ fullName: 'b fails too', status: 'failed' }],
        },
      ],
    };
    expect(extractFailingIds(raw)).toEqual([
      'tests/a.test.js::a fails',
      'tests/b.test.js::b fails too',
    ]);
  });

  it('returns an empty array for a fully-passing run or missing testResults', () => {
    expect(extractFailingIds({ testResults: [] })).toEqual([]);
    expect(extractFailingIds({})).toEqual([]);
  });
});

describe('decideRegression — identity mode', () => {
  it('is NOT a regression when the PR failing set is a subset of the base failing set (unrelated pre-existing flakes)', () => {
    const currentIds = ['tests/consumer-impact-gate.test.js::TS-6 a', 'tests/consumer-impact-gate.test.js::TS-6 b'];
    const priorFailingIds = [
      'tests/consumer-impact-gate.test.js::TS-6 a',
      'tests/consumer-impact-gate.test.js::TS-6 b',
      'tests/other.test.js::unrelated',
    ];
    const decision = decideRegression(currentIds, priorFailingIds, { failed: 2, priorFailedCount: 105 });
    expect(decision).toEqual({ regression: false, newIds: [], mode: 'identity' });
  });

  it('IS a regression when the PR introduces a failing test identity not present on main', () => {
    const currentIds = ['tests/consumer-impact-gate.test.js::TS-6 a', 'tests/new-broken.test.js::oops'];
    const priorFailingIds = ['tests/consumer-impact-gate.test.js::TS-6 a'];
    const decision = decideRegression(currentIds, priorFailingIds, { failed: 2, priorFailedCount: 1 });
    expect(decision.regression).toBe(true);
    expect(decision.newIds).toEqual(['tests/new-broken.test.js::oops']);
    expect(decision.mode).toBe('identity');
  });

  it('is NOT a regression even if the raw count rises, as long as no NEW identity appears (the exact false-positive class this QF fixes)', () => {
    // Simulates PR #5334/#5337: main baseline=105, PR run=107, but the 2 "extra"
    // failures are identities already known-flaky and present in the base set too.
    const priorFailingIds = Array.from({ length: 105 }, (_, i) => `tests/f${i}.test.js::t`).concat([
      'tests/unit/gates/consumer-impact-gate.test.js::TS-6 a',
      'tests/unit/gates/consumer-impact-gate.test.js::TS-6 b',
    ]);
    const currentIds = priorFailingIds; // identical set, count "107" either way
    const decision = decideRegression(currentIds, priorFailingIds, { failed: 107, priorFailedCount: 105 });
    expect(decision.regression).toBe(false);
  });

  it('IS a regression when the count goes DOWN but a genuinely new failure was introduced (count-based would have missed this)', () => {
    const priorFailingIds = ['tests/a.test.js::x', 'tests/b.test.js::y', 'tests/c.test.js::z'];
    // Two old flakes got fixed, but a new one was introduced — net count drops 3 -> 2.
    const currentIds = ['tests/a.test.js::x', 'tests/new.test.js::regression'];
    const decision = decideRegression(currentIds, priorFailingIds, { failed: 2, priorFailedCount: 3 });
    expect(decision.regression).toBe(true);
    expect(decision.newIds).toEqual(['tests/new.test.js::regression']);
  });
});

describe('decideRegression — count-fallback mode (pre-QF baseline snapshot)', () => {
  it('falls back to count-based comparison when priorFailingIds is null (graceful degradation)', () => {
    const decision = decideRegression(['tests/x.test.js::x'], null, { failed: 107, priorFailedCount: 105 });
    expect(decision).toEqual({ regression: true, newIds: [], mode: 'count-fallback' });
  });

  it('count-fallback passes when the count has not risen', () => {
    const decision = decideRegression(['tests/x.test.js::x'], null, { failed: 105, priorFailedCount: 105 });
    expect(decision.regression).toBe(false);
    expect(decision.mode).toBe('count-fallback');
  });
});
