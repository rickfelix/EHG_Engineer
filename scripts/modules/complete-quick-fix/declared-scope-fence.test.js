/**
 * Regression tests for QF-20260902-685.
 *
 * Root cause (both witnessed incidents: worker signal afcda2a0 / QF-20260824-627, and
 * QF-20260901-305 / PR #7950): when complete-quick-fix.js's early "already-merged PR" reconcile
 * fast-path throws on an unsupported flag combo (or no --pr-url was given yet), it falls through
 * to the normal pipeline, which calls analyzeGitDiff() to re-derive filesChanged from LOCAL git
 * state. On a post-merge worktree, the committed branch diff is trivially empty, so the
 * working-tree fallback fires and blindly sweeps EVERY dirty/untracked file in the worktree
 * (harness state markers, a stray unrelated test fixture) into filesChanged -- indistinguishable
 * from the QF's real content.
 *
 * Fix:
 *   1. analyzeGitDiff() now accepts an optional `declaredFiles` list (the merged PR's own file
 *      list, from `gh pr view --json files`, exposed by autoDetectGitInfo as gitInfo.prFiles).
 *      When present, it IS filesChanged -- no local git/working-tree scanning at all.
 *   2. refuseIfSharedRoot() refuses completion outright when testDir is not an isolated QF
 *      worktree, naming the worktree path to use instead.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { analyzeGitDiff, refuseIfSharedRoot, isInQFWorktree } from './git-operations.js';

function git(cwd, cmd) {
  return execSync(`git ${cmd}`, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
}

describe('analyzeGitDiff declaredFiles scope (QF-20260902-685 bullet 1)', () => {
  let repoDir;

  beforeAll(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'qf685-declared-'));
    git(repoDir, 'init -q -b main');
    git(repoDir, 'config user.email "test@test.local"');
    git(repoDir, 'config user.name "Test"');
    writeFileSync(join(repoDir, 'README.md'), 'initial\n');
    git(repoDir, 'add README.md');
    git(repoDir, 'commit -q -m "initial"');
  });

  afterAll(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('uses ONLY the declared files, ignoring a foreign untracked file physically present in the worktree', () => {
    // Simulates the exact incident shape: a real merged PR touched 'src/fix.js', but the local
    // worktree ALSO carries an unrelated untracked file at completion time.
    writeFileSync(join(repoDir, 'src-fix-placeholder.js'), 'not actually read\n');
    writeFileSync(join(repoDir, 'foreign-untracked-noise.json'), '{"unrelated":true}\n');

    const { filesChanged, diffAnalysis } = analyzeGitDiff(repoDir, 'fixture QF', ['src/fix.js', 'src/fix.test.js']);

    expect(filesChanged).toEqual(['src/fix.js', 'src/fix.test.js']);
    expect(filesChanged).not.toContain('foreign-untracked-noise.json');
    expect(diffAnalysis.diffSourceTier).toBe('pr-file-list');
  });

  it('dedupes the declared list (defensive — a malformed PR file list should never double-count)', () => {
    const { filesChanged } = analyzeGitDiff(repoDir, 'fixture QF', ['a.js', 'a.js', 'b.js']);
    expect(filesChanged).toEqual(['a.js', 'b.js']);
  });

  it('falls back to normal local-scan behavior when declaredFiles is omitted (no PR yet — unchanged)', () => {
    const headSha = git(repoDir, 'rev-parse HEAD').trim();
    git(repoDir, `update-ref refs/remotes/origin/main ${headSha}`);
    const { diffAnalysis } = analyzeGitDiff(repoDir, 'fixture QF');
    expect(diffAnalysis.diffSourceTier).not.toBe('pr-file-list');
  });
});

describe('refuseIfSharedRoot (QF-20260902-685 bullet 2)', () => {
  let repoDir;
  let qfWorktreeDir;

  beforeAll(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'qf685-sharedroot-'));
    git(repoDir, 'init -q -b main');
    git(repoDir, 'config user.email "test@test.local"');
    git(repoDir, 'config user.name "Test"');
    writeFileSync(join(repoDir, 'README.md'), 'initial\n');
    git(repoDir, 'add README.md');
    git(repoDir, 'commit -q -m "initial"');

    qfWorktreeDir = join(repoDir, '.worktrees', 'QF-20260902-685-fixture');
    git(repoDir, `worktree add -q -B qf-685-fixture "${qfWorktreeDir}" main`);
  });

  afterAll(() => {
    try { git(repoDir, `worktree remove --force "${qfWorktreeDir}"`); } catch { /* best-effort */ }
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('REFUSES when testDir is the shared root (not an isolated QF worktree)', () => {
    expect(isInQFWorktree(repoDir)).toBe(false);
    const result = refuseIfSharedRoot(repoDir, 'QF-20260902-685');
    expect(result.refused).toBe(true);
    expect(result.message).toContain('QF-20260902-685');
    expect(result.message).toContain('.worktrees/QF-20260902-685');
  });

  it('does NOT refuse from an isolated QF worktree (no regression)', () => {
    expect(isInQFWorktree(qfWorktreeDir)).toBe(true);
    const result = refuseIfSharedRoot(qfWorktreeDir, 'QF-20260902-685');
    expect(result.refused).toBe(false);
  });
});
