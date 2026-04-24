/**
 * Regression test for QF-20260424-803.
 *
 * Verifies that hasUnpushedCommits correctly recognizes commits that have
 * already been shipped to origin/main (squash-merge or otherwise) and does
 * NOT falsely flag them as unpushed_commits.
 *
 * Strategy: build a tiny throw-away git repo that mirrors the post-merge
 * state (worktree HEAD has commits whose patches exist on origin/main),
 * call hasUnpushedCommits against it, and assert clean.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hasUnpushedCommits } from '../post-merge-worktree-cleanup.js';

const sh = (cmd, opts) => execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim();

function setupRepoWithRemote() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qf-803-'));
  const remote = path.join(root, 'remote.git');
  const work = path.join(root, 'work');

  sh(`git init --bare "${remote}"`);
  sh(`git init "${work}"`);
  sh('git config user.email test@example.com', { cwd: work });
  sh('git config user.name test', { cwd: work });
  sh('git config commit.gpgsign false', { cwd: work });
  sh(`git remote add origin "${remote}"`, { cwd: work });

  // Initial commit on main
  fs.writeFileSync(path.join(work, 'README.md'), 'init\n');
  sh('git add README.md', { cwd: work });
  sh('git commit -m "init"', { cwd: work });
  sh('git branch -M main', { cwd: work });
  sh('git push -u origin main', { cwd: work });

  return { root, remote, work };
}

describe('hasUnpushedCommits — QF-20260424-803 regression', () => {
  let env;

  beforeEach(() => { env = setupRepoWithRemote(); });
  afterEach(() => { try { fs.rmSync(env.root, { recursive: true, force: true }); } catch { /* best effort */ } });

  it('returns clean when worktree HEAD has no extra commits vs origin/main', () => {
    const result = hasUnpushedCommits(env.work);
    expect(result.unpushed).toBe(false);
    expect(result.commits).toEqual([]);
  });

  it('flags genuinely-unpushed commits', () => {
    fs.writeFileSync(path.join(env.work, 'feature.js'), 'export const x = 1;\n');
    sh('git add feature.js', { cwd: env.work });
    sh('git commit -m "feat: x"', { cwd: env.work });
    const result = hasUnpushedCommits(env.work);
    expect(result.unpushed).toBe(true);
    expect(result.commits.length).toBe(1);
  });

  it('does NOT flag commits whose patches were squash-merged into origin/main', () => {
    // Step 1: create feature commit on a branch
    sh('git checkout -b feature/x', { cwd: env.work });
    fs.writeFileSync(path.join(env.work, 'feature.js'), 'export const x = 1;\n');
    sh('git add feature.js', { cwd: env.work });
    sh('git commit -m "feat: x"', { cwd: env.work });
    sh('git push -u origin feature/x', { cwd: env.work });

    // Step 2: simulate squash-merge into main (same patch, different sha)
    sh('git checkout main', { cwd: env.work });
    sh('git merge --squash feature/x', { cwd: env.work });
    sh('git commit -m "feat: x (squashed)"', { cwd: env.work });
    sh('git push origin main', { cwd: env.work });

    // Step 3: simulate post-merge state — worktree on feature branch with
    // its original commit, origin/main carries the squashed equivalent.
    sh('git checkout feature/x', { cwd: env.work });

    const result = hasUnpushedCommits(env.work);
    expect(result.unpushed).toBe(false);
    expect(result.commits).toEqual([]);
  });

  it('does NOT flag commits that are direct ancestors of origin/main (fast-forward merge)', () => {
    // Create a commit, push to origin/main directly (mimics merge with no squash)
    fs.writeFileSync(path.join(env.work, 'feature.js'), 'export const y = 2;\n');
    sh('git add feature.js', { cwd: env.work });
    sh('git commit -m "feat: y"', { cwd: env.work });
    sh('git push origin main', { cwd: env.work });

    // HEAD == origin/main → no commits in origin/main..HEAD
    const result = hasUnpushedCommits(env.work);
    expect(result.unpushed).toBe(false);
    expect(result.commits).toEqual([]);
  });
});
