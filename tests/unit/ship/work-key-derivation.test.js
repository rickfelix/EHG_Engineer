/**
 * SD-LEO-INFRA-SHIP-WITNESS-COVERAGE-001 FR-4, TS-2/TS-3.
 */
import { describe, it, expect } from 'vitest';
import { deriveWorkKey, deriveWorkKeyFromBranch, deriveWorkKeyFromTitle } from '../../../lib/ship/work-key-derivation.mjs';

describe('deriveWorkKeyFromBranch (TS-2)', () => {
  it('extracts an SD key from a feat/ branch, stopping cleanly before the lowercase slug', () => {
    expect(deriveWorkKeyFromBranch('feat/SD-LEO-INFRA-SHIP-WITNESS-COVERAGE-001-close-paths'))
      .toBe('SD-LEO-INFRA-SHIP-WITNESS-COVERAGE-001');
  });

  it('extracts a QF key from a qf/ branch with no trailing slug', () => {
    expect(deriveWorkKeyFromBranch('qf/QF-20260703-999')).toBe('QF-20260703-999');
  });

  it('extracts a QF key from a qf/ branch WITH a trailing slug too', () => {
    expect(deriveWorkKeyFromBranch('qf/QF-20260703-999-fix-sentinel')).toBe('QF-20260703-999');
  });

  it('works with no type-prefix at all (bare key as the whole branch name)', () => {
    expect(deriveWorkKeyFromBranch('SD-FIX-NAV-001')).toBe('SD-FIX-NAV-001');
  });

  it('returns null for a branch with no recognizable key', () => {
    expect(deriveWorkKeyFromBranch('feat/add-dark-mode-toggle')).toBeNull();
  });

  it('returns null for null/undefined/non-string input (defensive)', () => {
    expect(deriveWorkKeyFromBranch(null)).toBeNull();
    expect(deriveWorkKeyFromBranch(undefined)).toBeNull();
    expect(deriveWorkKeyFromBranch(42)).toBeNull();
  });
});

describe('deriveWorkKeyFromTitle (TS-3 fallback)', () => {
  it('extracts a QF key from a conventional-commit-style title', () => {
    expect(deriveWorkKeyFromTitle('fix(QF-20260703-999): backlog-rank sentinel dependency')).toBe('QF-20260703-999');
  });

  it('extracts an SD key from a title', () => {
    expect(deriveWorkKeyFromTitle('feat(SD-LEO-INFRA-SHIP-WITNESS-COVERAGE-001): close unwitnessed paths')).toBe('SD-LEO-INFRA-SHIP-WITNESS-COVERAGE-001');
  });

  it('returns null for a title with no recognizable key', () => {
    expect(deriveWorkKeyFromTitle('Bump lodash from 4.17.20 to 4.17.21')).toBeNull();
  });

  it('does not produce a phantom key from a glued uppercase prefix (TESTING sub-agent finding)', () => {
    expect(deriveWorkKeyFromTitle('MSD-100: unrelated ticket reference')).toBeNull();
    expect(deriveWorkKeyFromTitle('WSD-200 also should not match')).toBeNull();
  });
});

describe('deriveWorkKey (branch-first, title-fallback, never fabricated)', () => {
  it('prefers the branch-derived key when both are present', () => {
    expect(deriveWorkKey({ branchName: 'feat/SD-BRANCH-001-slug', title: 'fix(SD-TITLE-002): x' })).toBe('SD-BRANCH-001');
  });

  it('falls back to the title when the branch has no recognizable key', () => {
    expect(deriveWorkKey({ branchName: 'feat/rename-helper', title: 'chore(QF-20260703-111): rename helper' })).toBe('QF-20260703-111');
  });

  it('returns null (never a fabricated guess) when neither branch nor title carries a key', () => {
    expect(deriveWorkKey({ branchName: 'feat/add-dark-mode', title: 'Add dark mode toggle' })).toBeNull();
  });

  it('null-safe with no args', () => {
    expect(deriveWorkKey()).toBeNull();
  });
});
