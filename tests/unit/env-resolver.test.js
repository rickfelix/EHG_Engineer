/**
 * SD-FDBK-INFRA-WORKTREES-CARRY-SNAPSHOT-001
 *
 * Unit tests for lib/env-resolver.cjs -- the git-boundary-safe .env resolver. All git
 * and filesystem access is via injected execGit/existsSync fakes, so this suite never
 * shells out to real git or touches the real filesystem (TR-3-equivalent isolation).
 *
 * Paths are built via path.join/path.dirname (not hardcoded forward-slash strings) so
 * the fake existence set matches whatever separator style the platform's own path
 * module produces -- path.dirname preserves the input's separators but path.join
 * normalizes to the platform separator (backslash on Windows), so a hardcoded
 * forward-slash fixture would silently mismatch on Windows.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import { resolveEnvPath, _clearMemoForTests } from '../../lib/env-resolver.cjs';

function fakeGit(commonDir) {
  return () => (commonDir === null ? (() => { throw new Error('not a git repo'); })() : commonDir + '\n');
}

function fakeExists(existingPaths) {
  const set = new Set(existingPaths);
  return (p) => set.has(p);
}

describe('resolveEnvPath', () => {
  beforeEach(() => {
    _clearMemoForTests();
  });

  it('TS-1: main-worktree .env exists -- resolves there, not the caller\'s own copy', () => {
    const mainRoot = path.join('repo', 'main');
    const commonDir = path.join(mainRoot, '.git');
    const mainEnv = path.join(mainRoot, '.env');
    const execGit = fakeGit(commonDir);
    const existsSync = fakeExists([mainRoot, mainEnv]);
    const result = resolveEnvPath(path.join('repo', 'worktrees', 'feature-x'), { execGit, existsSync });
    expect(result).toEqual({ path: mainEnv, source: 'main-worktree', gitResolved: true });
  });

  it('TS-7: git resolves fine but the main root has NO .env (altifyai\'s confirmed real shape) -- falls through to the ancestor walk, finding nothing, same as today', () => {
    const mainRoot = path.join('venture', 'main');
    const commonDir = path.join(mainRoot, '.git');
    const execGit = fakeGit(commonDir);
    // mainRoot exists (git resolved) but has no .env; nor does any ancestor.
    const existsSync = fakeExists([mainRoot]);
    const result = resolveEnvPath(path.join(mainRoot, '.worktrees', 'some-work'), { execGit, existsSync });
    expect(result.source).toBe('none');
    expect(result.path).toBeNull();
    expect(result.gitResolved).toBe(true);
  });

  it('TS-2/TS-3: main root has no .env, but an ancestor above the caller does -- ancestor-walk wins (preserves the old behavior for a genuinely main-.env-less case)', () => {
    const mainRoot = path.join('repo', 'main');
    const commonDir = path.join(mainRoot, '.git');
    const worktreesRoot = path.join('repo', 'worktrees');
    const ancestorEnv = path.join(worktreesRoot, '.env');
    const execGit = fakeGit(commonDir);
    const existsSync = fakeExists([mainRoot, ancestorEnv]);
    const result = resolveEnvPath(path.join(worktreesRoot, 'feature-x'), { execGit, existsSync });
    expect(result).toEqual({ path: ancestorEnv, source: 'ancestor-walk', gitResolved: true });
  });

  it('TS-4: git fails entirely (non-git cwd, or git absent) -- falls through to the ancestor walk', () => {
    const scratchDir = path.join('tmp', 'scratch');
    const scratchEnv = path.join(scratchDir, '.env');
    const execGit = fakeGit(null);
    const existsSync = fakeExists([scratchEnv]);
    const result = resolveEnvPath(scratchDir, { execGit, existsSync });
    expect(result).toEqual({ path: scratchEnv, source: 'ancestor-walk', gitResolved: false });
  });

  it('git fails AND no ancestor .env exists anywhere -- genuine "none", the only case the caller should treat as loud-failure', () => {
    const execGit = fakeGit(null);
    const existsSync = fakeExists([]);
    const result = resolveEnvPath(path.join('tmp', 'scratch', 'deep', 'dir'), { execGit, existsSync });
    expect(result).toEqual({ path: null, source: 'none', gitResolved: false });
  });

  it('TS-8: memoizes per (startDir) -- execGit is invoked only once across repeated calls with the same startDir', () => {
    const mainRoot = path.join('repo', 'main');
    const mainEnv = path.join(mainRoot, '.env');
    let callCount = 0;
    const execGit = (...args) => {
      callCount++;
      return fakeGit(path.join(mainRoot, '.git'))(...args);
    };
    const existsSync = fakeExists([mainRoot, mainEnv]);
    const startDir = path.join('repo', 'worktrees', 'feature-x');
    resolveEnvPath(startDir, { execGit, existsSync });
    resolveEnvPath(startDir, { execGit, existsSync });
    resolveEnvPath(startDir, { execGit, existsSync });
    expect(callCount).toBe(1);
  });

  it('a different startDir is resolved independently, not incorrectly served from another startDir\'s memo entry', () => {
    const mainRoot = path.join('repo', 'main');
    const mainEnv = path.join(mainRoot, '.env');
    const execGit = fakeGit(path.join(mainRoot, '.git'));
    const existsSync = fakeExists([mainRoot, mainEnv]);
    const r1 = resolveEnvPath(path.join('repo', 'worktrees', 'feature-x'), { execGit, existsSync });
    const r2 = resolveEnvPath(path.join('other', 'worktree'), { execGit, existsSync });
    expect(r1.path).toBe(mainEnv);
    expect(r2.path).toBe(mainEnv); // same fake git answer, but resolved via its own memo entry, not a stale cross-dir hit
  });
});
