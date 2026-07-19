/**
 * Regression test for QF-20260719-760.
 *
 * Live incident (2026-07-19, worker signal dfd48574): on the stale shared root
 * with 5 concurrent sessions, complete-quick-fix.js for a zero-diff QF
 * (QF-20260719-038, force-complete referencing already-merged PR #6252)
 * silently git-committed+pushed 3 UNRELATED dirty files (CLAUDE_ADAM.md,
 * CLAUDE_ADAM_DIGEST.md, claude-generation-manifest.json) belonging to a
 * concurrent regen process, under the QF's commit message.
 *
 * Root cause: commitAndPushChanges treats filesChanged (the BRANCH's diff vs
 * origin/main) as the QF's scope. On a shared tree whose branch history
 * already touched those files, a concurrent session's dirty copies classify
 * as "scoped" and get swept into the commit.
 *
 * The guard: when the tree is NOT an isolated QF worktree AND out-of-scope
 * dirty files are present (the contention signature), refuse the auto-commit
 * entirely instead of trusting the scope partition.
 *
 * Uses REAL temporary git repos (like working-tree-fallback-fence.test.js)
 * so the guard is proven against actual git behavior.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { commitAndPushChanges } from './git-operations.js';

function git(cwd, cmd) {
  return execSync(`git ${cmd}`, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
}

const QF = {
  id: 'QF-20260719-760',
  title: 'shared-tree contention guard fixture',
  description: 'fixture',
  type: 'bug',
  severity: 'high',
};

// A prompt that would approve everything — the guard must return BEFORE any
// prompt/auto-confirm path can commit.
const yesPrompt = async () => 'yes';

describe('commitAndPushChanges shared-tree-contention guard (QF-20260719-760)', () => {
  let repoDir;
  let qfWorktreeDir;

  beforeAll(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'qf760-repo-'));
    git(repoDir, 'init -q -b main');
    git(repoDir, 'config user.email "test@test.local"');
    git(repoDir, 'config user.name "Test"');
    writeFileSync(join(repoDir, 'scoped-file.txt'), 'initial\n');
    git(repoDir, 'add scoped-file.txt');
    git(repoDir, 'commit -q -m "initial"');

    qfWorktreeDir = join(repoDir, '.worktrees', 'qf', 'QF-20260719-760-fixture');
    git(repoDir, `worktree add -q -B qf-760-fixture "${qfWorktreeDir}" main`);
  });

  afterAll(() => {
    try { git(repoDir, `worktree remove --force "${qfWorktreeDir}"`); } catch { /* best-effort */ }
    rmSync(repoDir, { recursive: true, force: true });
  });

  it('REFUSES auto-commit on a shared root when out-of-scope dirty files are present', async () => {
    const headBefore = git(repoDir, 'rev-parse HEAD').trim();
    // "Scoped" dirty file (overlaps filesChanged, i.e. branch history) + a
    // concurrent session's unrelated dirty file — the incident signature.
    writeFileSync(join(repoDir, 'scoped-file.txt'), 'dirty scoped change\n');
    writeFileSync(join(repoDir, 'peer-session-file.txt'), 'concurrent session work\n');

    const sha = await commitAndPushChanges(
      repoDir, QF, { commitSha: headBefore }, 10, ['scoped-file.txt'],
      null, true, yesPrompt, { nonInteractive: true }
    );

    expect(sha).toBe(headBefore);
    expect(git(repoDir, 'rev-parse HEAD').trim()).toBe(headBefore);
    // Both files must still be dirty — nothing was staged or committed.
    const status = git(repoDir, 'status --short');
    expect(status).toContain('scoped-file.txt');
    expect(status).toContain('peer-session-file.txt');
  });

  it('still commits ONLY scoped files from an isolated QF worktree (no regression)', async () => {
    const headBefore = git(qfWorktreeDir, 'rev-parse HEAD').trim();
    writeFileSync(join(qfWorktreeDir, 'scoped-file.txt'), 'the actual QF change\n');
    writeFileSync(join(qfWorktreeDir, 'stray-note.txt'), 'stray unrelated file\n');

    const sha = await commitAndPushChanges(
      qfWorktreeDir, QF, { commitSha: headBefore }, 10, ['scoped-file.txt'],
      null, true, yesPrompt, { nonInteractive: true }
    );

    const headAfter = git(qfWorktreeDir, 'rev-parse HEAD').trim();
    expect(headAfter).not.toBe(headBefore);
    expect(sha).toBe(headAfter);
    const committed = git(qfWorktreeDir, 'diff-tree --no-commit-id --name-only -r HEAD').trim().split('\n');
    expect(committed).toEqual(['scoped-file.txt']);
    // The stray file is ignored (existing behavior), not swept into the commit.
    expect(git(qfWorktreeDir, 'status --short')).toContain('stray-note.txt');
  });
});
