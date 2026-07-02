/**
 * SD-LEO-INFRA-COUNT-VS-IDENTITY-GATE-CLASSGUARD-001 — lib/gates/identity-diff-gate.cjs.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { computeIdentityRegression, extractFailingIds, filterReachable } = require('../../../lib/gates/identity-diff-gate.cjs');

describe('computeIdentityRegression', () => {
  it('does NOT flag when the raw count rises but failing identities are identical to baseline', () => {
    // The shared-flake false-positive class: same test flakes on both runs, count is the same,
    // but any FRESH run could re-order/re-count depending on retries — identity is what matters.
    const prior = ['a.test.js::flaky test'];
    const current = ['a.test.js::flaky test'];
    const r = computeIdentityRegression(current, prior);
    expect(r.regression).toBe(false);
    expect(r.newIds).toEqual([]);
    expect(r.mode).toBe('identity');
  });

  it('flags when a new identity fails that passed on baseline', () => {
    const prior = ['a.test.js::flaky test'];
    const current = ['a.test.js::flaky test', 'b.test.js::new regression'];
    const r = computeIdentityRegression(current, prior);
    expect(r.regression).toBe(true);
    expect(r.newIds).toEqual(['b.test.js::new regression']);
    expect(r.mode).toBe('identity');
  });

  it('does not flag when current has fewer failures than prior (improvement)', () => {
    const prior = ['a.test.js::t1', 'b.test.js::t2'];
    const current = ['a.test.js::t1'];
    const r = computeIdentityRegression(current, prior);
    expect(r.regression).toBe(false);
    expect(r.newIds).toEqual([]);
  });

  it('falls back to count_fallback mode when priorFailingIds is absent (older baseline)', () => {
    const r = computeIdentityRegression(['a.test.js::t1', 'b.test.js::t2'], null, { failed: 2, priorFailedCount: 1 });
    expect(r.mode).toBe('count_fallback');
    expect(r.regression).toBe(true);
    expect(r.newIds).toEqual(['a.test.js::t1', 'b.test.js::t2']);
  });

  it('count_fallback does not flag when failed count did not rise', () => {
    const r = computeIdentityRegression(['a.test.js::t1'], undefined, { failed: 1, priorFailedCount: 1 });
    expect(r.mode).toBe('count_fallback');
    expect(r.regression).toBe(false);
  });

  it('handles empty/missing current gracefully', () => {
    const r = computeIdentityRegression(null, ['a.test.js::t1']);
    expect(r.regression).toBe(false);
    expect(r.newIds).toEqual([]);
  });
});

describe('extractFailingIds', () => {
  it('parses a representative vitest JSON shape into file::fullName identities', () => {
    const raw = {
      testResults: [
        {
          name: 'tests/unit/a.test.js',
          assertionResults: [
            { status: 'passed', fullName: 'a suite > passes' },
            { status: 'failed', fullName: 'a suite > fails' },
          ],
        },
        {
          name: 'tests/unit/b.test.js',
          assertionResults: [{ status: 'failed', fullName: 'b suite > also fails' }],
        },
      ],
    };
    expect(extractFailingIds(raw)).toEqual([
      'tests/unit/a.test.js::a suite > fails',
      'tests/unit/b.test.js::b suite > also fails',
    ]);
  });

  it('returns [] for missing/malformed input', () => {
    expect(extractFailingIds(null)).toEqual([]);
    expect(extractFailingIds({})).toEqual([]);
    expect(extractFailingIds({ testResults: [] })).toEqual([]);
  });
});

describe('filterReachable', () => {
  it('narrows newIds to only those whose file is in the changed-files set', () => {
    const newIds = ['a.test.js::t1', 'b.test.js::t2', 'c.test.js::t3'];
    const changed = ['a.test.js', 'c.test.js'];
    expect(filterReachable(newIds, changed)).toEqual(['a.test.js::t1', 'c.test.js::t3']);
  });

  it('passes through unfiltered when changedFiles is empty (no diff-scoping info available)', () => {
    const newIds = ['a.test.js::t1'];
    expect(filterReachable(newIds, [])).toEqual(newIds);
    expect(filterReachable(newIds, undefined)).toEqual(newIds);
  });

  it('returns [] when none of newIds are reachable', () => {
    expect(filterReachable(['a.test.js::t1'], ['z.test.js'])).toEqual([]);
  });
});
