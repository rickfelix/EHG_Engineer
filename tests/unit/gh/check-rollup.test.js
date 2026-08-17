/**
 * QF-20260816-043
 *
 * gh-merge-safe.mjs merged via `gh pr merge` with only state/mergeCommit checks — no
 * statusCheckRollup read. A follow-up PR pushed to a branch whose base commit was
 * already squash-merged registers ZERO GitHub check-suites, so every wait-for-CI gate
 * read "nothing pending" as vacuously green and the merge proceeded unvalidated.
 */
import { describe, it, expect } from 'vitest';
import { isEmptyCheckRollup } from '../../../lib/gh/check-rollup.mjs';

describe('isEmptyCheckRollup', () => {
  it('true for an empty array (the squash-merged-branch follow-up case)', () => {
    expect(isEmptyCheckRollup([])).toBe(true);
  });

  it('true for null/undefined (gh returned no rollup field at all)', () => {
    expect(isEmptyCheckRollup(null)).toBe(true);
    expect(isEmptyCheckRollup(undefined)).toBe(true);
  });

  it('true for a non-array value (defensive — malformed gh output)', () => {
    expect(isEmptyCheckRollup('not-an-array')).toBe(true);
    expect(isEmptyCheckRollup({})).toBe(true);
  });

  it('false for a populated rollup, regardless of individual check conclusions (defers to existing behavior)', () => {
    expect(isEmptyCheckRollup([{ name: 'ci', conclusion: 'SUCCESS' }])).toBe(false);
    expect(isEmptyCheckRollup([{ name: 'ci', conclusion: 'FAILURE' }])).toBe(false);
    expect(isEmptyCheckRollup([{ name: 'ci', status: 'IN_PROGRESS' }])).toBe(false);
  });

  it('false for a rollup with many entries (live-shape regression: a normal PR carries ~38)', () => {
    const populated = Array.from({ length: 38 }, (_, i) => ({ name: `check-${i}`, conclusion: 'SUCCESS' }));
    expect(isEmptyCheckRollup(populated)).toBe(false);
  });
});
