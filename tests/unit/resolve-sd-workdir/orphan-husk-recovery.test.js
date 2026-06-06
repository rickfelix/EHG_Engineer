/**
 * Tests for SD-FDBK-ENH-START-LEAVES-LOCKED-001
 * Covers the orphan/locked-worktree-husk recovery foundation in
 * scripts/resolve-sd-workdir.js (recoverOrphanWorktree).
 *
 * Repro that motivated this: a reaper removed a worktree's git registration but a
 * process cwd-handle left the empty .worktrees/<SD> dir locked, so rm/rename fail
 * "in use" and the SD became permanently unclaimable. The fix: instead of refusing
 * when the path exists-but-unregistered, sd-start runs `git worktree prune` then
 * `git worktree add --force` — which WRITES into the husk (writes succeed even when
 * delete is blocked), re-registering + repopulating it.
 *
 * These tests pin the two foundations the fix relies on, using os.tmpdir + git init
 * fixtures (no main-repo mutations), mirroring worktree-atomicity.test.js.
 * Run with: node --test tests/unit/resolve-sd-workdir/orphan-husk-recovery.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

function createFixtureRepo() {
  const dir = join(tmpdir(), `wt-husk-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
  writeFileSync(join(dir, 'README.md'), '# test');
  execSync('git add . && git commit -m "init"', { cwd: dir, stdio: 'pipe' });
  return dir;
}

const isRegistered = (repoRoot, wtPath) => {
  const listed = execSync('git worktree list --porcelain', { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' });
  const want = wtPath.replace(/\\/g, '/');
  return listed.split('\n').filter(l => l.startsWith('worktree '))
    .map(l => l.replace('worktree ', '').trim().replace(/\\/g, '/'))
    .some(rp => rp === want);
};

// Foundation 1: an existing, content-bearing, UNREGISTERED dir at the worktree
// path is not a registered worktree (this is the orphan-husk state the fix triggers on).
test('orphan husk: a content dir at the worktree path is not git-registered', () => {
  const repo = createFixtureRepo();
  try {
    const wtPath = join(repo, '.worktrees', 'SD-HUSK-001');
    mkdirSync(wtPath, { recursive: true });
    writeFileSync(join(wtPath, 'leftover.txt'), 'husk residue'); // simulate locked-husk residue
    assert.equal(isRegistered(repo, wtPath), false, 'husk dir must NOT be a registered worktree');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

// Foundation 2: `git worktree add --force <existing-EMPTY-dir> <branch>` recovers
// the husk and re-registers + repopulates it. The real repro is an EMPTY locked
// dir (a reaper deleted the contents but a cwd-handle left the dir undeletable);
// writes into that empty dir succeed even when delete/rename is blocked.
test('orphan husk: git worktree add --force adopts an existing empty unregistered dir', () => {
  const repo = createFixtureRepo();
  try {
    execSync('git branch feat/SD-HUSK-001', { cwd: repo, stdio: 'pipe' });
    const wtPath = join(repo, '.worktrees', 'SD-HUSK-001');
    mkdirSync(wtPath, { recursive: true }); // empty husk (reaper-deleted contents)
    assert.equal(isRegistered(repo, wtPath), false, 'precondition: husk not registered');

    // The recovery the fix performs: prune (stale registration) then --force adopt.
    execSync(`git worktree prune`, { cwd: repo, stdio: 'pipe' });
    execSync(`git worktree add --force "${wtPath}" feat/SD-HUSK-001`, { cwd: repo, stdio: 'pipe' });

    assert.equal(isRegistered(repo, wtPath), true, 'husk must be registered after --force recovery');
    assert.ok(existsSync(join(wtPath, 'README.md')), 'worktree must be repopulated (branch content present)');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

// Foundation 3: --force -b path recovers an empty husk when the branch is absent.
test('orphan husk: git worktree add --force -b recovers when branch is absent', () => {
  const repo = createFixtureRepo();
  try {
    const wtPath = join(repo, '.worktrees', 'SD-HUSK-002');
    mkdirSync(wtPath, { recursive: true }); // empty husk
    execSync(`git worktree add --force -b feat/SD-HUSK-002 "${wtPath}" HEAD`, { cwd: repo, stdio: 'pipe' });
    assert.equal(isRegistered(repo, wtPath), true, 'husk must be registered after --force -b recovery');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
