/**
 * Regression test for QF-20260604-479 / PAT-QF-EMPTY-DIFF-FALSE-COMPLETION-001.
 *
 * The QF completion pipeline must NOT false-complete a QF whose committed branch diff
 * vs origin/main is empty (0 files / 0 LOC). Witnessed: QF-20260604-749 / PR #4238 —
 * an empty commit scored compliance 100 and merged, shipping the bug unfixed.
 *
 * Two layers are covered:
 *   1. isEmptyDiff() — the diff-layer signal the orchestrator's terminal guard uses.
 *   2. compliance rubric error_resolved — fails closed on an empty diff (defense-in-depth),
 *      instead of passing vacuously because errorsAfterFix is empty.
 */

import { describe, it, expect } from 'vitest';
import { isEmptyDiff } from './git-operations.js';
import { QUICKFIX_RUBRIC } from '../../../lib/quickfix-compliance-rubric.js';

const errorResolved = QUICKFIX_RUBRIC.fix_quality.criteria.find((c) => c.id === 'error_resolved');

describe('isEmptyDiff (empty-diff guard helper)', () => {
  it('is TRUE only when there are no changed files AND no net LOC', () => {
    expect(isEmptyDiff([], 0)).toBe(true);
    expect(isEmptyDiff(undefined, 0)).toBe(true);
    expect(isEmptyDiff(null, undefined)).toBe(true);
    expect(isEmptyDiff([], null)).toBe(true);
  });

  it('is FALSE for any real change (files present, or non-zero LOC)', () => {
    expect(isEmptyDiff(['lib/foo.js'], 0)).toBe(false);
    expect(isEmptyDiff(['lib/foo.js'], 12)).toBe(false);
    // LOC is still counted even if the file list is empty (belt-and-suspenders).
    expect(isEmptyDiff([], 5)).toBe(false);
  });
});

describe('compliance rubric error_resolved (defense-in-depth)', () => {
  it('exists as a fix_quality criterion with a check fn', () => {
    expect(errorResolved).toBeTruthy();
    expect(typeof errorResolved.check).toBe('function');
  });

  it('FAILS (score 0) on an empty diff instead of passing vacuously', async () => {
    const res = await errorResolved.check({
      filesChanged: [],
      actualLoc: 0,
      actualSourceLoc: 0,
      errorsAfterFix: [],
    });
    expect(res.passed).toBe(false);
    expect(res.score).toBe(0);
  });

  it('still PASSES (score 15) on a real diff with no console error present', async () => {
    const res = await errorResolved.check({
      filesChanged: ['lib/foo.js'],
      actualSourceLoc: 10,
      errorsAfterFix: [],
      originalError: 'TypeError: x',
    });
    expect(res.passed).toBe(true);
    expect(res.score).toBe(15);
  });
});
