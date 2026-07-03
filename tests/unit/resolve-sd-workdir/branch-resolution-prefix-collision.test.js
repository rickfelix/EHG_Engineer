/**
 * Regression test for QF-20260703-130: the worktree branch resolver used an
 * unanchored `feat/${sdKey}*` glob, so a parent SD key that is a strict alphanumeric
 * prefix of a descendant's key (e.g. "-F" vs "-F1") could resolve to the descendant's
 * branch instead of its own.
 *
 * Uses os.tmpdir + git init for fixture repos — no main-repo mutations.
 */
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolveExistingBranch } from '../../../scripts/resolve-sd-workdir.js';

function createFixtureRepo() {
  const dir = join(tmpdir(), `wt-prefix-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
  writeFileSync(join(dir, 'README.md'), '# test');
  execSync('git add . && git commit -m "init"', { cwd: dir, stdio: 'pipe' });
  return dir;
}

describe('resolveExistingBranch — prefix-collision safety (QF-20260703-130)', () => {
  it('does not match a descendant\'s branch when only the descendant exists', () => {
    const repo = createFixtureRepo();
    try {
      // Only the CHILD's branch exists — the parent's own branch was never created.
      execSync('git branch feat/SD-TEST-F1', { cwd: repo, stdio: 'pipe' });

      const resolved = resolveExistingBranch('SD-TEST-F', repo);

      expect(resolved, 'parent should get a fresh branch, not match the descendant').toBeNull();
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('finds an exact-match branch even when a descendant branch also exists', () => {
    const repo = createFixtureRepo();
    try {
      execSync('git branch feat/SD-TEST-G', { cwd: repo, stdio: 'pipe' });
      execSync('git branch feat/SD-TEST-G1', { cwd: repo, stdio: 'pipe' });

      expect(resolveExistingBranch('SD-TEST-G', repo)).toBe('feat/SD-TEST-G');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('still finds a separator-suffixed variant branch', () => {
    const repo = createFixtureRepo();
    try {
      execSync('git branch feat/SD-TEST-H.retry', { cwd: repo, stdio: 'pipe' });

      expect(resolveExistingBranch('SD-TEST-H', repo)).toBe('feat/SD-TEST-H.retry');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
