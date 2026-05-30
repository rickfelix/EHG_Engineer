/**
 * Unit tests for the ENF-15 force-push branch resolver (dbcd817c / QF-20260529-492).
 *
 * Pins both directions: a topic-branch push from a worktree resolves to the topic
 * branch (no false protected_branch_denylist), AND any push that writes a protected
 * branch (incl. multi-refspec and HEAD:main) still surfaces the protected name so the
 * gate blocks it. Bare pushes resolve via the push cwd through an injected exec.
 */
import { describe, it, expect, vi } from 'vitest';
import pkg from '../../scripts/hooks/lib/force-push-branch.cjs';
const { pushRefspecDsts, forcePushTargetBranches, effectiveForcePushBranch, PROTECTED_RE } = pkg;

describe('pushRefspecDsts — explicit refspec destinations', () => {
  it('extracts a feature branch from `origin <branch>`', () => {
    expect(pushRefspecDsts('git push --force-with-lease origin feat/SD-X')).toEqual(['feat/SD-X']);
  });
  it('extracts main when pushing to main', () => {
    expect(pushRefspecDsts('git push --force origin main')).toEqual(['main']);
  });
  it('takes the DST of a src:dst refspec (HEAD:main → main)', () => {
    expect(pushRefspecDsts('git push --force-with-lease origin HEAD:main')).toEqual(['main']);
  });
  it('returns ALL destinations for a multi-refspec push', () => {
    expect(pushRefspecDsts('git push --force origin main feat/X')).toEqual(['main', 'feat/X']);
  });
  it('handles `git -C <dir>` prefix + a quoted dir', () => {
    expect(pushRefspecDsts('git -C "/c/wt/QF-1" push --force-with-lease origin qf/QF-1')).toEqual(['qf/QF-1']);
  });
  it('strips a leading + and refs/heads/', () => {
    expect(pushRefspecDsts('git push origin +refs/heads/feat/SD-Y')).toEqual(['feat/SD-Y']);
  });
  it('treats a lone remote (no slash/colon) as no explicit branch', () => {
    expect(pushRefspecDsts('git push --force-with-lease origin')).toEqual([]);
  });
  it('returns [] when there is no git push', () => {
    expect(pushRefspecDsts('echo git push --force')).not.toContain('main');
  });
});

describe('forcePushTargetBranches — bare push falls back to the push cwd', () => {
  it('uses the session cwd branch when no refspec is given', () => {
    const exec = vi.fn(() => 'feat/SD-Z');
    expect(forcePushTargetBranches('git push --force-with-lease', '/c/wt/SD-Z', exec)).toEqual(['feat/SD-Z']);
    expect(exec).toHaveBeenCalledWith('git rev-parse --abbrev-ref HEAD', { cwd: '/c/wt/SD-Z' });
  });
  it('resolves main for a bare push from main cwd (still blockable)', () => {
    const exec = vi.fn(() => 'main');
    expect(forcePushTargetBranches('git push --force-with-lease', '/c/main', exec)).toEqual(['main']);
  });
  it('prefers an explicit refspec over the cwd', () => {
    const exec = vi.fn(() => 'main');
    expect(forcePushTargetBranches('git push --force-with-lease origin feat/SD-A', '/c/main', exec)).toEqual(['feat/SD-A']);
    expect(exec).not.toHaveBeenCalled();
  });
  it('resolves the `git -C <dir>` target for a bare push', () => {
    const exec = vi.fn((c, o) => (o && o.cwd === '/c/wt/B' ? 'feat/SD-B' : 'main'));
    expect(forcePushTargetBranches('git -C /c/wt/B push --force-with-lease', '/c/main', exec)).toEqual(['feat/SD-B']);
  });
  it('returns [] when resolution throws (fail-closed at caller)', () => {
    const exec = vi.fn(() => { throw new Error('not a git repo'); });
    expect(forcePushTargetBranches('git push --force-with-lease', '', exec)).toEqual([]);
  });
});

describe('effectiveForcePushBranch — protected target wins (fail-closed, multi-refspec safe)', () => {
  it('returns the protected branch when present among candidates', () => {
    expect(effectiveForcePushBranch(['main', 'feat/X'])).toBe('main');
    expect(effectiveForcePushBranch(['feat/X', 'develop'])).toBe('develop');
  });
  it('returns the last candidate when none are protected', () => {
    expect(effectiveForcePushBranch(['feat/A', 'qf/QF-1'])).toBe('qf/QF-1');
  });
  it('returns empty string for no candidates (caller blocks as not-allowlisted)', () => {
    expect(effectiveForcePushBranch([])).toBe('');
    expect(PROTECTED_RE.test('')).toBe(false);
  });
});
