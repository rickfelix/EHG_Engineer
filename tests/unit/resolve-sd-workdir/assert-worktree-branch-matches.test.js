/**
 * Regression test for QF-20260905-634: resolve-sd-workdir.js's three worktree-attach
 * sites (createWorktree's reuse check, the DB path, the scan path) read the checked-out
 * branch but never COMPARED it to feat/<sdKey> or the slot-free reuse marker -- a reused
 * directory sitting on a foreign, already-merged branch was handed to the worker silently,
 * hiding real unmerged commits on feat/<sdKey>. assertWorktreeBranchMatches is the shared
 * predicate all three sites now call before attaching.
 *
 * Uses os.tmpdir + git init fixture repos (mirrors worktree-atomicity.test.js's pattern) --
 * no main-repo mutations. Run with: node --test tests/unit/resolve-sd-workdir/assert-worktree-branch-matches.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { writeReuseMarker } from '../../../lib/fleet/worktree-reuse-marker.js';
import { assertWorktreeBranchMatches } from '../../../scripts/resolve-sd-workdir.js';

function createFixtureRepo() {
  const dir = join(tmpdir(), `wt-branch-match-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
  writeFileSync(join(dir, 'README.md'), '# test');
  execSync('git add . && git commit -m "init"', { cwd: dir, stdio: 'pipe' });
  return dir;
}

test('a directory already on feat/<sdKey> attaches unchanged (no checkout, no mismatch)', async () => {
  const repo = createFixtureRepo();
  try {
    execSync('git checkout -b feat/SD-TEST', { cwd: repo, stdio: 'pipe' });
    const result = await assertWorktreeBranchMatches('SD-TEST', repo, repo);
    assert.deepEqual(result, { ok: true, branch: 'feat/SD-TEST' });
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('a reused directory on a foreign merged branch, clean tree, corrects to feat/<sdKey>', async () => {
  const repo = createFixtureRepo();
  try {
    const initialBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repo, encoding: 'utf8' }).trim();
    execSync('git checkout -b feat/SD-TEST', { cwd: repo, stdio: 'pipe' });
    execSync(`git checkout ${initialBranch} -b docs/some-other-merged-branch`, { cwd: repo, stdio: 'pipe' });
    const result = await assertWorktreeBranchMatches('SD-TEST', repo, repo);
    assert.equal(result.ok, true);
    assert.equal(result.branch, 'feat/SD-TEST');
    assert.equal(result.corrected, true);
    const nowOn = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repo, encoding: 'utf8' }).trim();
    assert.equal(nowOn, 'feat/SD-TEST');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('same foreign-branch case with a DIRTY tree refuses rather than discarding work', async () => {
  const repo = createFixtureRepo();
  try {
    const initialBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repo, encoding: 'utf8' }).trim();
    execSync('git checkout -b feat/SD-TEST', { cwd: repo, stdio: 'pipe' });
    execSync(`git checkout ${initialBranch} -b docs/some-other-merged-branch`, { cwd: repo, stdio: 'pipe' });
    writeFileSync(join(repo, 'uncommitted.txt'), 'wip');
    const result = await assertWorktreeBranchMatches('SD-TEST', repo, repo);
    assert.equal(result.ok, false);
    assert.equal(result.foreign, 'docs/some-other-merged-branch');
    assert.equal(result.expected, 'feat/SD-TEST');
    const nowOn = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repo, encoding: 'utf8' }).trim();
    assert.equal(nowOn, 'docs/some-other-merged-branch', 'must not have switched branches on a dirty tree');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('foreign branch with feat/<sdKey> unavailable anywhere refuses (nothing to check out)', async () => {
  const repo = createFixtureRepo();
  try {
    execSync('git checkout -b docs/some-other-merged-branch', { cwd: repo, stdio: 'pipe' });
    const result = await assertWorktreeBranchMatches('SD-NEVER-EXISTED', repo, repo);
    assert.equal(result.ok, false);
    assert.equal(result.foreign, 'docs/some-other-merged-branch');
    assert.equal(result.expected, 'feat/SD-NEVER-EXISTED');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('a marker-keyed directory (mid-flight reuse handoff) attaches unchanged, no checkout attempted', async () => {
  const repo = createFixtureRepo();
  try {
    execSync('git checkout -b docs/prior-occupant-branch', { cwd: repo, stdio: 'pipe' });
    writeReuseMarker(repo, { key: 'SD-TEST' });
    const result = await assertWorktreeBranchMatches('SD-TEST', repo, repo);
    assert.deepEqual(result, { ok: true, branch: 'docs/prior-occupant-branch', markerKeyed: true });
    const nowOn = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repo, encoding: 'utf8' }).trim();
    assert.equal(nowOn, 'docs/prior-occupant-branch', 'marker authority must not trigger a checkout');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
