/**
 * Regression test for QF-20260706-632.
 *
 * Live near-miss (Golf-2, QF-880 completion): running complete-quick-fix.js from the
 * shared main repo root with no QF-specific commit fell back to working-tree diff
 * analysis, attributed the entire pre-existing dirty baseline of ANOTHER session
 * (~264 files) to this QF, and attempted to git-add + commit all of it onto main. Only
 * the OS command-line length limit on the auto-generated commit message stopped it.
 *
 * analyzeGitDiff()'s working-tree fallback must now:
 *   1. REFUSE when testDir is not an isolated QF worktree (isInQFWorktree() false).
 *   2. Still work normally when testDir IS an isolated QF worktree (no regression).
 *   3. REFUSE even inside a QF worktree if the dirty file count exceeds a sanity cap.
 *
 * Uses REAL temporary git repos (git init / git worktree add) rather than mocking
 * execSync, so the fix is proven against actual git behavior.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { analyzeGitDiff, isInQFWorktree } from './git-operations.js';

function git(cwd, cmd) {
  return execSync(`git ${cmd}`, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
}

describe('analyzeGitDiff working-tree fallback fence (QF-20260706-632)', () => {
  let repoDir;
  let qfWorktreeDir;

  beforeAll(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'qf632-repo-'));
    git(repoDir, 'init -q -b main');
    git(repoDir, 'config user.email "test@test.local"');
    git(repoDir, 'config user.name "Test"');
    writeFileSync(join(repoDir, 'README.md'), 'initial\n');
    git(repoDir, 'add README.md');
    git(repoDir, 'commit -q -m "initial"');
    const headSha = git(repoDir, 'rev-parse HEAD').trim();
    // Fake an origin/main remote-tracking ref pointing at HEAD (no real remote needed)
    // so `git diff origin/main...HEAD` succeeds and returns empty — the exact precondition
    // that triggers the working-tree fallback.
    git(repoDir, `update-ref refs/remotes/origin/main ${headSha}`);

    qfWorktreeDir = join(repoDir, '.worktrees', 'qf', 'QF-20260706-632-fixture');
    git(repoDir, `worktree add -q -B qf-fixture-branch "${qfWorktreeDir}" main`);
  });

  afterAll(() => {
    try { git(repoDir, `worktree remove --force "${qfWorktreeDir}"`); } catch { /* best-effort */ }
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('isInQFWorktree correctly distinguishes the two fixture dirs', () => {
    expect(isInQFWorktree(repoDir)).toBe(false);
    expect(isInQFWorktree(qfWorktreeDir)).toBe(true);
  });

  it('REFUSES the working-tree fallback from the shared main root (not a QF worktree)', () => {
    // Simulate another session's dirty baseline sitting in the shared repo root.
    for (let i = 0; i < 5; i++) {
      writeFileSync(join(repoDir, `unrelated-${i}.txt`), 'peer session work\n');
    }
    const { filesChanged } = analyzeGitDiff(repoDir, 'some QF description');
    expect(filesChanged).toEqual([]);
  });

  it('still works normally from an isolated QF worktree (no regression)', () => {
    writeFileSync(join(qfWorktreeDir, 'my-qf-fix.txt'), 'the actual QF change\n');
    const { filesChanged } = analyzeGitDiff(qfWorktreeDir, 'some QF description');
    expect(filesChanged).toContain('my-qf-fix.txt');
  });

  it('REFUSES even inside a QF worktree once the dirty count exceeds the sanity cap', () => {
    for (let i = 0; i < 35; i++) {
      writeFileSync(join(qfWorktreeDir, `bulk-${i}.txt`), 'x\n');
    }
    const { filesChanged } = analyzeGitDiff(qfWorktreeDir, 'some QF description');
    expect(filesChanged).toEqual([]);
  });
});
