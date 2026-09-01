/**
 * QF-20260831-533: table-driven test over every `git branch -a` marker shape.
 *
 * Root cause: normalizeBranchLine() only stripped git's '*' current-branch marker, not the
 * '+' marker git prepends for a branch checked out in another linked worktree, so
 * "+ feat/SD-XXX" stayed glued together and defeated exact-match branch lookups
 * (validateBranchExists/resolveFeatureBranch) for every worktree-based session.
 */
import { describe, it, expect } from 'vitest';
import { normalizeBranchLine } from '../../../scripts/lib/branch-resolver/domains/discovery.js';

describe('normalizeBranchLine', () => {
  const cases = [
    ['* main', 'main'],
    ['  feat/x', 'feat/x'],
    ['+ feat/SD-LEO-FIX-ALTIFYAI-UAT-FETCH-001', 'feat/SD-LEO-FIX-ALTIFYAI-UAT-FETCH-001'],
    ['remotes/origin/feat/z', 'feat/z'],
    ['feat/no-marker', 'feat/no-marker'],
    ['*   extra-spaces-after-marker', 'extra-spaces-after-marker'],
  ];

  for (const [input, expected] of cases) {
    it(`normalizes "${input}" -> "${expected}"`, () => {
      expect(normalizeBranchLine(input)).toBe(expected);
    });
  }
});
