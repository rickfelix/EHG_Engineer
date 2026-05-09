/**
 * Integration test for rollbackWorktreeFilesystemSync brute-force fallback path.
 * SD-FDBK-INFRA-CONCURRENT-NPM-RECONCILIATION-001 FR-3.
 *
 * Strategy:
 *  - Outer describe runs on ALL platforms: creates a temp git repo + worktree,
 *    locks the worktree (via .git/worktrees/<name>/locked file — git-native),
 *    calls rollbackWorktreeFilesystemSync, asserts result.fellBackToRmSync===true.
 *  - Inner describe runs only when junction creation succeeds (Windows with
 *    appropriate privileges). Creates a node_modules junction inside the
 *    worktree pointing to a sibling tempdir holding marker files; after
 *    rollback runs, asserts the SIBLING tempdir + markers survive (i.e.,
 *    safeRecursiveRm correctly unlinked the junction without recursing into it).
 *
 * Soft-skip pattern follows tests/unit/worktree-manager.test.js:386-393:
 *  try fs.symlinkSync(...,'junction'); catch -> early return with notice.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { rollbackWorktreeFilesystemSync } from '../../../lib/worktree-manager.js';

const TMP_BASE = path.join(os.tmpdir(), `worktree-junction-test-${crypto.randomUUID().slice(0, 8)}`);

function safeRm(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
}

function setupTestRepo() {
  fs.mkdirSync(TMP_BASE, { recursive: true });
  const repoRoot = path.join(TMP_BASE, 'repo');
  const worktreePath = path.join(TMP_BASE, 'worktree');
  fs.mkdirSync(repoRoot, { recursive: true });

  execSync('git init -q', { cwd: repoRoot, stdio: 'pipe' });
  execSync('git config user.email test@example.com', { cwd: repoRoot, stdio: 'pipe' });
  execSync('git config user.name Test', { cwd: repoRoot, stdio: 'pipe' });

  // Initial commit so HEAD exists
  fs.writeFileSync(path.join(repoRoot, 'README.md'), '# test\n');
  execSync('git add README.md', { cwd: repoRoot, stdio: 'pipe' });
  execSync('git commit -q -m init', { cwd: repoRoot, stdio: 'pipe' });

  execSync(`git worktree add -q -b junction-test "${worktreePath}"`, {
    cwd: repoRoot,
    stdio: 'pipe',
  });

  return { repoRoot, worktreePath };
}

function lockWorktreeViaFile(repoRoot, worktreePath) {
  // .git/worktrees/<name>/locked — git's native worktree-lock file.
  // Causes `git worktree remove --force` to error with "is locked".
  const wtName = path.basename(worktreePath);
  const lockedPath = path.join(repoRoot, '.git', 'worktrees', wtName, 'locked');
  fs.writeFileSync(lockedPath, 'integration test — forcing brute-force fallback\n');
  return lockedPath;
}

describe('rollbackWorktreeFilesystemSync — brute-force fallback (cross-platform)', () => {
  let env;

  beforeAll(() => {
    env = setupTestRepo();
  });

  afterAll(() => {
    safeRm(TMP_BASE);
  });

  it('falls back to safeRecursiveRm when git worktree remove fails (locked worktree)', () => {
    lockWorktreeViaFile(env.repoRoot, env.worktreePath);

    // Sanity: worktree dir exists before rollback
    expect(fs.existsSync(env.worktreePath)).toBe(true);

    const result = rollbackWorktreeFilesystemSync(env.worktreePath, env.repoRoot, {
      maxAttempts: 2,
      delaysMs: [10],
    });

    // Brute-force path executed
    expect(result.fellBackToRmSync).toBe(true);
    // Worktree dir is gone
    expect(fs.existsSync(env.worktreePath)).toBe(false);
  });
});

describe('rollbackWorktreeFilesystemSync — junction TARGET preservation (Windows-only)', () => {
  // Soft-skip pattern: try junction creation; if it fails (non-Windows OR
  // Windows-without-admin), early-return with notice. Mirrors existing
  // tests/unit/worktree-manager.test.js:386-393.

  it('junction TARGET tempdir + marker files survive after rollback', () => {
    const baseDir = path.join(os.tmpdir(), `wt-junction-survival-${crypto.randomUUID().slice(0, 8)}`);
    const repoRoot = path.join(baseDir, 'repo');
    const worktreePath = path.join(baseDir, 'worktree');
    const targetTempdir = path.join(baseDir, 'junction-target');

    try {
      // Setup git repo + worktree.
      fs.mkdirSync(repoRoot, { recursive: true });
      execSync('git init -q', { cwd: repoRoot, stdio: 'pipe' });
      execSync('git config user.email test@example.com', { cwd: repoRoot, stdio: 'pipe' });
      execSync('git config user.name Test', { cwd: repoRoot, stdio: 'pipe' });
      fs.writeFileSync(path.join(repoRoot, 'README.md'), '# test\n');
      execSync('git add README.md', { cwd: repoRoot, stdio: 'pipe' });
      execSync('git commit -q -m init', { cwd: repoRoot, stdio: 'pipe' });
      execSync(`git worktree add -q -b junction-survival-test "${worktreePath}"`, {
        cwd: repoRoot,
        stdio: 'pipe',
      });

      // Create a sibling tempdir to be the junction TARGET.
      fs.mkdirSync(targetTempdir, { recursive: true });
      const markerPath = path.join(targetTempdir, 'survives.txt');
      fs.writeFileSync(markerPath, 'this file must still exist after rollback');

      // Try to create the junction. If this throws (non-Windows or no admin),
      // soft-skip with a notice (mirrors tests/unit/worktree-manager.test.js:386-393).
      const junctionPath = path.join(worktreePath, 'node_modules');
      try {
        fs.symlinkSync(targetTempdir, junctionPath, 'junction');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          `[soft-skip] junction creation unavailable on this platform/privileges: ${err.message}. ` +
            'Skipping Windows-only junction-target survival assertion.'
        );
        safeRm(baseDir);
        return;
      }

      // Force git remove failure via .locked file.
      const wtName = path.basename(worktreePath);
      fs.writeFileSync(
        path.join(repoRoot, '.git', 'worktrees', wtName, 'locked'),
        'forcing brute-force fallback\n'
      );

      // Sanity checks.
      expect(fs.existsSync(worktreePath)).toBe(true);
      expect(fs.existsSync(junctionPath)).toBe(true);
      expect(fs.existsSync(markerPath)).toBe(true);

      // Run rollback — must hit brute-force path.
      const result = rollbackWorktreeFilesystemSync(worktreePath, repoRoot, {
        maxAttempts: 2,
        delaysMs: [10],
      });

      expect(result.fellBackToRmSync).toBe(true);
      expect(fs.existsSync(worktreePath)).toBe(false);
      // KEY ASSERTION: the junction TARGET tempdir + marker file must survive.
      expect(fs.existsSync(targetTempdir)).toBe(true);
      expect(fs.existsSync(markerPath)).toBe(true);
      const markerContents = fs.readFileSync(markerPath, 'utf8');
      expect(markerContents).toBe('this file must still exist after rollback');
    } finally {
      safeRm(baseDir);
    }
  });
});
