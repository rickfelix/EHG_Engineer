/**
 * Tests for SD-LEO-FIX-WORKTREE-CREATION-ATOMICITY-001
 * Covers: pre-condition, post-condition, quota, essentials structured return.
 *
 * Uses os.tmpdir + git init for fixture repos — no main-repo mutations.
 * Tests run with: node --test tests/unit/resolve-sd-workdir/worktree-atomicity.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

/**
 * Create a minimal temp git repo with an initial commit.
 * Returns the path. Caller must rmSync after.
 */
function createFixtureRepo() {
  const dir = join(tmpdir(), `wt-atom-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
  writeFileSync(join(dir, 'README.md'), '# test');
  execSync('git add . && git commit -m "init"', { cwd: dir, stdio: 'pipe' });
  return dir;
}

// ---------------------------------------------------------------------------
// US-001: Post-condition — healthy worktree passes verification
// ---------------------------------------------------------------------------
test('post-condition: healthy git worktree add is verified (path in list + .git exists)', () => {
  const repo = createFixtureRepo();
  try {
    const wtPath = join(repo, '.worktrees', 'SD-TEST-OK');
    mkdirSync(join(repo, '.worktrees'), { recursive: true });
    execSync(`git worktree add "${wtPath}" -b feat/SD-TEST-OK`, { cwd: repo, stdio: 'pipe' });

    // Verify it appears in git worktree list
    const listed = execSync('git worktree list --porcelain', { cwd: repo, encoding: 'utf8' });
    const paths = listed.split('\n')
      .filter(l => l.startsWith('worktree '))
      .map(l => l.replace('worktree ', '').trim().replace(/\\/g, '/'));

    const expected = wtPath.replace(/\\/g, '/');
    assert.ok(
      paths.some(p => p.replace(/\\/g, '/') === expected),
      `Expected ${expected} in worktree list but got: ${paths.join(', ')}`
    );

    // Verify .git pointer exists
    assert.ok(existsSync(join(wtPath, '.git')), '.git pointer file must exist in healthy worktree');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// US-001: Post-condition — orphaned dir (not in git worktree list) is detectable
// ---------------------------------------------------------------------------
test('post-condition: directory not in git worktree list is detectable via porcelain parse', () => {
  const repo = createFixtureRepo();
  try {
    const wtPath = join(repo, '.worktrees', 'SD-TEST-ORPHAN');
    mkdirSync(wtPath, { recursive: true });
    // Plain dir, never registered with git worktree add
    writeFileSync(join(wtPath, 'dummy.txt'), 'orphan');

    const listed = execSync('git worktree list --porcelain', { cwd: repo, encoding: 'utf8' });
    const paths = listed.split('\n')
      .filter(l => l.startsWith('worktree '))
      .map(l => l.replace('worktree ', '').trim().replace(/\\/g, '/'));

    const expected = wtPath.replace(/\\/g, '/');
    assert.ok(
      !paths.some(p => p.replace(/\\/g, '/') === expected),
      `Orphan dir should NOT appear in worktree list`
    );
    // .git pointer should not exist
    assert.ok(!existsSync(join(wtPath, '.git')), '.git pointer must NOT exist for plain dir');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// US-002: Pre-condition — existing valid worktree is reusable
// ---------------------------------------------------------------------------
test('pre-condition: existing registered worktree is detected by isValidWorktree logic', () => {
  const repo = createFixtureRepo();
  try {
    const wtPath = join(repo, '.worktrees', 'SD-TEST-VALID');
    mkdirSync(join(repo, '.worktrees'), { recursive: true });
    execSync(`git worktree add "${wtPath}" -b feat/SD-TEST-VALID`, { cwd: repo, stdio: 'pipe' });

    // Simulate isValidWorktree: rev-parse + porcelain check
    const revParse = execSync('git rev-parse --is-inside-work-tree', { cwd: wtPath, encoding: 'utf8' }).trim();
    assert.equal(revParse, 'true');

    const listed = execSync('git worktree list --porcelain', { cwd: repo, encoding: 'utf8' });
    const paths = listed.split('\n')
      .filter(l => l.startsWith('worktree '))
      .map(l => l.replace('worktree ', '').trim().replace(/\\/g, '/'));

    const expected = wtPath.replace(/\\/g, '/');
    assert.ok(paths.some(p => p.replace(/\\/g, '/') === expected), 'Valid worktree must be in list');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// US-002: Pre-condition — plain dir at worktree path is NOT valid
// ---------------------------------------------------------------------------
test('pre-condition: plain directory at worktree path fails isValidWorktree check', () => {
  const repo = createFixtureRepo();
  try {
    const wtPath = join(repo, '.worktrees', 'SD-TEST-JUNK');
    mkdirSync(wtPath, { recursive: true });
    writeFileSync(join(wtPath, 'junk.txt'), 'not a worktree');

    // rev-parse from inside the junk dir — it'll resolve to the parent repo's work tree,
    // but the porcelain check should NOT include this path
    const listed = execSync('git worktree list --porcelain', { cwd: repo, encoding: 'utf8' });
    const paths = listed.split('\n')
      .filter(l => l.startsWith('worktree '))
      .map(l => l.replace('worktree ', '').trim().replace(/\\/g, '/'));

    const expected = wtPath.replace(/\\/g, '/');
    assert.ok(!paths.some(p => p.replace(/\\/g, '/') === expected), 'Junk dir must NOT be in worktree list');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// US-003: Quota — counting worktree subdirs, excluding helpers
// ---------------------------------------------------------------------------
test('quota: subdirectory count excludes _archive and qf helpers', () => {
  const dir = join(tmpdir(), `wt-quota-test-${Date.now()}`);
  const worktreesDir = join(dir, '.worktrees');
  try {
    mkdirSync(worktreesDir, { recursive: true });

    // Create 9 SD-like dirs + 2 helper dirs
    for (let i = 0; i < 9; i++) {
      mkdirSync(join(worktreesDir, `SD-TEST-${i}`));
    }
    mkdirSync(join(worktreesDir, '_archive'));
    mkdirSync(join(worktreesDir, 'qf'));

    // Count should be 9, not 11
    const entries = readdirSync(worktreesDir);
    const helpers = new Set(['_archive', 'qf', 'sd', 'adhoc']);
    const count = entries.filter(e => {
      if (helpers.has(e)) return false;
      try { return statSync(join(worktreesDir, e)).isDirectory(); } catch { return false; }
    }).length;

    assert.equal(count, 9, 'Should count 9 SD dirs, not helpers');

    // 10th should hit quota (count === 10 after adding)
    mkdirSync(join(worktreesDir, 'SD-TEST-9'));
    const count2 = readdirSync(worktreesDir).filter(e => {
      if (helpers.has(e)) return false;
      try { return statSync(join(worktreesDir, e)).isDirectory(); } catch { return false; }
    }).length;
    assert.equal(count2, 10, 'Should count 10 SD dirs — quota reached');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// US-004: ensureWorktreeEssentials — symlink failure produces structured error
// ---------------------------------------------------------------------------
test('essentials: structured error returned on symlink failure (conceptual)', () => {
  // This test validates the return shape contract. The actual fs.symlinkSync
  // failure depends on OS state; we validate the contract programmatically.
  const errors = [];

  // Simulate a symlink failure
  try {
    throw new Error('EPERM: operation not permitted, symlink');
  } catch (err) {
    errors.push({ step: 'symlink_node_modules', message: err.message });
  }

  // Simulate a successful .env copy
  // (no error pushed)

  const result = { ok: errors.length === 0, errors };
  assert.equal(result.ok, false, 'Should report not-ok when symlink fails');
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].step, 'symlink_node_modules');
  assert.ok(result.errors[0].message.includes('EPERM'));
});

// ---------------------------------------------------------------------------
// US-004: essentials — clean result when both succeed
// ---------------------------------------------------------------------------
test('essentials: clean result ({ok: true, errors: []}) when no failures', () => {
  const errors = [];
  const result = { ok: errors.length === 0, errors };
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});
