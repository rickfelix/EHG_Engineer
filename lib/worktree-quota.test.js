/**
 * Tests for lib/worktree-quota.js
 *
 * SD-LEO-FIX-WORKTREE-QUOTA-COUNTER-001 — covers AC1 through AC7 and TS-1..TS-7.
 *
 * Fixture pattern: a temp directory with `git init`, optional commits, and
 * N calls to `git worktree add` to simulate real git-registered worktrees.
 * Orphan directories are produced by plain `fs.mkdirSync` (no git registration).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import {
  countActiveWorktrees,
  countFilesystemWorktreeDirs,
  listActiveWorktrees,
  emitOrphanWarningIfAny,
  createQuotaExceededError,
  enforceWorktreeQuota,
  MAX_WORKTREE_COUNT,
  WORKTREE_QUOTA_HELPERS,
} from './worktree-quota.js';

function git(repoRoot, args) {
  return execSync('git ' + args, { cwd: repoRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function makeTempRepo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wtq-test-'));
  const repoRoot = fs.realpathSync(tmp);
  execSync('git init -q -b main', { cwd: repoRoot, stdio: 'pipe' });
  execSync('git config user.email t@e.st', { cwd: repoRoot, stdio: 'pipe' });
  execSync('git config user.name Tester', { cwd: repoRoot, stdio: 'pipe' });
  execSync('git config commit.gpgsign false', { cwd: repoRoot, stdio: 'pipe' });
  fs.writeFileSync(path.join(repoRoot, 'README.md'), 'test');
  execSync('git add README.md && git commit -q -m init', { cwd: repoRoot, stdio: 'pipe' });
  return repoRoot;
}

function addRegisteredWorktree(repoRoot, name) {
  const worktreesDir = path.join(repoRoot, '.worktrees');
  fs.mkdirSync(worktreesDir, { recursive: true });
  const wtPath = path.join(worktreesDir, name);
  const branch = 'wt/' + name;
  execSync('git worktree add -q -b ' + branch + ' "' + wtPath + '"', { cwd: repoRoot, stdio: 'pipe' });
  return wtPath;
}

function addOrphanDirectory(repoRoot, name) {
  const worktreesDir = path.join(repoRoot, '.worktrees');
  fs.mkdirSync(worktreesDir, { recursive: true });
  const orphan = path.join(worktreesDir, name);
  fs.mkdirSync(orphan, { recursive: true });
  fs.writeFileSync(path.join(orphan, 'README.md'), 'orphan');
  return orphan;
}

describe('lib/worktree-quota', () => {
  let repoRoot;

  beforeEach(() => {
    repoRoot = makeTempRepo();
  });

  afterEach(() => {
    try {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    } catch { /* best effort on Windows */ }
  });

  describe('countActiveWorktrees (TS-1..TS-4)', () => {
    it('TS-4: returns 0 for a fresh repo with no .worktrees/ directory', () => {
      expect(countActiveWorktrees(repoRoot)).toBe(0);
    });

    it('TS-1: ignores orphan directories (primary fix)', () => {
      addRegisteredWorktree(repoRoot, 'wt-a');
      addRegisteredWorktree(repoRoot, 'wt-b');
      addRegisteredWorktree(repoRoot, 'wt-c');
      addOrphanDirectory(repoRoot, 'orphan-1');
      addOrphanDirectory(repoRoot, 'orphan-2');
      addOrphanDirectory(repoRoot, 'orphan-3');
      addOrphanDirectory(repoRoot, 'orphan-4');
      addOrphanDirectory(repoRoot, 'orphan-5');

      expect(countActiveWorktrees(repoRoot)).toBe(3);
      expect(countFilesystemWorktreeDirs(path.join(repoRoot, '.worktrees'))).toBe(8);
    });

    it('TS-2: registered count correct at arbitrary boundary', () => {
      for (let i = 0; i < 5; i += 1) addRegisteredWorktree(repoRoot, 'wt-' + i);
      expect(countActiveWorktrees(repoRoot)).toBe(5);
    });

    it('TS-3: helper directories excluded naturally (never registered)', () => {
      addRegisteredWorktree(repoRoot, 'wt-a');
      addRegisteredWorktree(repoRoot, 'wt-b');
      for (const helper of ['_archive', 'qf', 'sd', 'adhoc']) {
        fs.mkdirSync(path.join(repoRoot, '.worktrees', helper, 'nested'), { recursive: true });
      }

      expect(countActiveWorktrees(repoRoot)).toBe(2);
    });

    it('returns 0 when git CLI fails (non-repo path)', () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wtq-empty-'));
      try {
        expect(countActiveWorktrees(emptyDir)).toBe(0);
      } finally {
        fs.rmSync(emptyDir, { recursive: true, force: true });
      }
    });
  });

  describe('listActiveWorktrees', () => {
    it('excludes the main repo worktree from the list', () => {
      addRegisteredWorktree(repoRoot, 'wt-a');
      const active = listActiveWorktrees(repoRoot);
      expect(active).toHaveLength(1);
      expect(active[0].path.replace(/\\/g, '/')).toContain('.worktrees/wt-a');
    });
  });

  describe('emitOrphanWarningIfAny (AC-5, TS-5, TS-7)', () => {
    it('TS-5: emits structured warning when fsCount > registeredCount', () => {
      const logger = vi.fn();
      const orphans = emitOrphanWarningIfAny(20, 10, logger);

      expect(orphans).toBe(10);
      expect(logger).toHaveBeenCalledTimes(1);
      const msg = logger.mock.calls[0][0];
      expect(msg).toContain('[worktree-quota] ORPHAN_DETECTED');
      expect(msg).toContain('10 orphan directories');
      expect(msg).toContain('fs=20');
      expect(msg).toContain('git-registered=10');
    });

    it('TS-7: does NOT emit warning on a clean tree (counts match)', () => {
      const logger = vi.fn();
      const orphans = emitOrphanWarningIfAny(5, 5, logger);

      expect(orphans).toBe(0);
      expect(logger).not.toHaveBeenCalled();
    });

    it('does NOT emit warning when fsCount < registeredCount (unusual but non-blocking)', () => {
      const logger = vi.fn();
      const orphans = emitOrphanWarningIfAny(3, 5, logger);

      expect(orphans).toBe(0);
      expect(logger).not.toHaveBeenCalled();
    });
  });

  describe('createQuotaExceededError (AC-4, US-005)', () => {
    it('preserves error message text and errorCode exactly', () => {
      const err = createQuotaExceededError(20, 20);
      expect(err.errorCode).toBe('WORKTREE_QUOTA_EXCEEDED');
      expect(err.message).toBe(
        'Worktree limit reached (20/20). Run cleanup or remove stale worktrees before creating new ones.'
      );
    });

    it('defaults to MAX_WORKTREE_COUNT when max omitted', () => {
      const err = createQuotaExceededError(25);
      expect(err.message).toContain('(25/' + MAX_WORKTREE_COUNT + ')');
    });
  });

  describe('enforceWorktreeQuota (AC-1 through AC-5 end-to-end)', () => {
    it('AC-3 / TS-5: succeeds when 10 registered + 10 orphan (counter=10 < max)', () => {
      for (let i = 0; i < 10; i += 1) addRegisteredWorktree(repoRoot, 'wt-' + i);
      for (let i = 0; i < 10; i += 1) addOrphanDirectory(repoRoot, 'orphan-' + i);
      const logger = vi.fn();

      const result = enforceWorktreeQuota(
        repoRoot,
        path.join(repoRoot, '.worktrees'),
        { logger }
      );

      expect(result.count).toBe(10);
      expect(result.orphanCount).toBe(10);
      expect(logger).toHaveBeenCalledTimes(1);
      expect(logger.mock.calls[0][0]).toContain('ORPHAN_DETECTED');
    });

    it('AC-4 / TS-6: throws WORKTREE_QUOTA_EXCEEDED at the real boundary', () => {
      for (let i = 0; i < 3; i += 1) addRegisteredWorktree(repoRoot, 'wt-' + i);
      const logger = vi.fn();

      expect(() =>
        enforceWorktreeQuota(
          repoRoot,
          path.join(repoRoot, '.worktrees'),
          { max: 3, logger }
        )
      ).toThrow(/Worktree limit reached \(3\/3\)/);

      try {
        enforceWorktreeQuota(
          repoRoot,
          path.join(repoRoot, '.worktrees'),
          { max: 3, logger }
        );
      } catch (e) {
        expect(e.errorCode).toBe('WORKTREE_QUOTA_EXCEEDED');
      }
    });

    it('AC-5 / TS-7: no orphan log on clean tree during enforcement', () => {
      for (let i = 0; i < 3; i += 1) addRegisteredWorktree(repoRoot, 'wt-' + i);
      const logger = vi.fn();

      enforceWorktreeQuota(
        repoRoot,
        path.join(repoRoot, '.worktrees'),
        { logger }
      );

      expect(logger).not.toHaveBeenCalled();
    });
  });

  describe('exports', () => {
    it('re-exports MAX_WORKTREE_COUNT as 20 (plan constraint)', () => {
      expect(MAX_WORKTREE_COUNT).toBe(20);
    });

    it('re-exports WORKTREE_QUOTA_HELPERS with documented helper names', () => {
      expect(WORKTREE_QUOTA_HELPERS).toBeInstanceOf(Set);
      expect(WORKTREE_QUOTA_HELPERS.has('_archive')).toBe(true);
      expect(WORKTREE_QUOTA_HELPERS.has('qf')).toBe(true);
      expect(WORKTREE_QUOTA_HELPERS.has('sd')).toBe(true);
      expect(WORKTREE_QUOTA_HELPERS.has('adhoc')).toBe(true);
    });
  });
});
