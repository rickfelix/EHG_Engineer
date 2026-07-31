/**
 * Unit tests for lib/execute/wip-guard.cjs
 * SD: SD-MULTISESSION-EXECUTION-TEAM-COMMAND-ORCH-001-C (Phase 3 of /execute)
 *
 * Pure-function tests using a temporary git repo for the dirty/clean assertions.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const wip = require('../lib/execute/wip-guard.cjs');

const TMP_REPO = path.join(os.tmpdir(), `wip-guard-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

function git(cmd, cwd = TMP_REPO) {
  return execSync(`git ${cmd}`, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

describe('wip-guard.checkWorktreeWIP', () => {
  beforeAll(() => {
    fs.mkdirSync(TMP_REPO, { recursive: true });
    git('init -q', TMP_REPO);
    git('config user.email "test@test.com"', TMP_REPO);
    git('config user.name "Test"', TMP_REPO);
    fs.writeFileSync(path.join(TMP_REPO, 'README.md'), 'initial\n');
    git('add .', TMP_REPO);
    git('commit -q -m "initial"', TMP_REPO);
  });

  afterAll(() => {
    try { fs.rmSync(TMP_REPO, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  test('clean worktree → dirty=false, files=[]', () => {
    const r = wip.checkWorktreeWIP(TMP_REPO);
    expect(r.dirty).toBe(false);
    expect(r.files).toEqual([]);
  });

  test('untracked file → dirty=true', () => {
    fs.writeFileSync(path.join(TMP_REPO, 'new-file.txt'), 'untracked\n');
    const r = wip.checkWorktreeWIP(TMP_REPO);
    expect(r.dirty).toBe(true);
    expect(r.files).toContain('new-file.txt');
    fs.unlinkSync(path.join(TMP_REPO, 'new-file.txt'));
  });

  test('modified tracked file → dirty=true', () => {
    fs.writeFileSync(path.join(TMP_REPO, 'README.md'), 'modified\n');
    const r = wip.checkWorktreeWIP(TMP_REPO);
    expect(r.dirty).toBe(true);
    expect(r.files).toContain('README.md');
    git('checkout -- README.md', TMP_REPO);
  });

  test('multiple dirty files', () => {
    fs.writeFileSync(path.join(TMP_REPO, 'a.txt'), 'a\n');
    fs.writeFileSync(path.join(TMP_REPO, 'b.txt'), 'b\n');
    const r = wip.checkWorktreeWIP(TMP_REPO);
    expect(r.dirty).toBe(true);
    expect(r.files.length).toBeGreaterThanOrEqual(2);
    expect(r.files).toContain('a.txt');
    expect(r.files).toContain('b.txt');
    fs.unlinkSync(path.join(TMP_REPO, 'a.txt'));
    fs.unlinkSync(path.join(TMP_REPO, 'b.txt'));
  });

  test('null worktreePath → dirty=false with note', () => {
    const r = wip.checkWorktreeWIP(null);
    expect(r.dirty).toBe(false);
    expect(r.note).toBe('no_worktree_path');
  });

  test('missing path → dirty=false with note', () => {
    const r = wip.checkWorktreeWIP('/definitely/does/not/exist/anywhere');
    expect(r.dirty).toBe(false);
    expect(r.note).toBe('worktree_path_missing');
  });

  test('non-git directory → dirty=false with note (git_status_failed)', () => {
    const nonGit = path.join(os.tmpdir(), `not-a-git-${Date.now()}`);
    fs.mkdirSync(nonGit);
    try {
      const r = wip.checkWorktreeWIP(nonGit);
      expect(r.dirty).toBe(false);
      expect(r.note).toMatch(/git_status_failed/);
    } finally {
      fs.rmSync(nonGit, { recursive: true, force: true });
    }
  });

  // SD-LEO-INFRA-FULL-UTILISATION-RECOVERY-001 (FR-3). The case above — a directory in NO repo —
  // is genuinely "nothing to lose". This is the OTHER case, and it is a real observed condition: a
  // leftover directory NESTED inside a repo (an unregistered .worktrees/<sd> is exactly this).
  // There `git status` walks UP and reports the PARENT tree's dirt as if it were this worktree's,
  // so a caller reading it would attribute someone else's changes to this seat. Same root cause as
  // isReapable's dirty_tree false positive (harness backlog 16c88c91).
  test('directory NESTED in another repo → dirty=true, not_a_worktree_root, and NO borrowed files', () => {
    const nested = path.join(TMP_REPO, 'leftover-not-a-worktree');
    fs.mkdirSync(nested, { recursive: true });
    // Make the PARENT repo dirty — this is the dirt that must NOT be attributed to `nested`.
    fs.writeFileSync(path.join(TMP_REPO, 'parent-dirty.txt'), 'parent tree change');
    try {
      const r = wip.checkWorktreeWIP(nested);
      expect(r.dirty).toBe(true);
      expect(r.note).toBe('not_a_worktree_root');
      expect(r.files).toEqual([]); // never borrow the parent's file list
    } finally {
      fs.rmSync(nested, { recursive: true, force: true });
      fs.rmSync(path.join(TMP_REPO, 'parent-dirty.txt'), { force: true });
    }
  });
});

describe('wip-guard.checkAllWorkersWIP', () => {
  test('all clean → anyDirty=false', () => {
    const workers = [
      { slot: 0, callsign: 'Alpha', worktree_path: null },
      { slot: 1, callsign: 'Bravo', worktree_path: null }
    ];
    const r = wip.checkAllWorkersWIP(workers);
    expect(r.anyDirty).toBe(false);
    expect(r.dirtyWorkers).toEqual([]);
    expect(r.cleanWorkers).toHaveLength(2);
  });

  test('one dirty + one clean → anyDirty=true', () => {
    fs.mkdirSync(TMP_REPO, { recursive: true });
    if (!fs.existsSync(path.join(TMP_REPO, '.git'))) {
      git('init -q', TMP_REPO);
      git('config user.email "test@test.com"', TMP_REPO);
      git('config user.name "Test"', TMP_REPO);
      fs.writeFileSync(path.join(TMP_REPO, 'README.md'), 'initial\n');
      git('add .', TMP_REPO);
      git('commit -q -m "initial"', TMP_REPO);
    }
    fs.writeFileSync(path.join(TMP_REPO, 'dirty.txt'), 'dirty\n');

    const workers = [
      { slot: 0, callsign: 'Alpha', worktree_path: TMP_REPO },
      { slot: 1, callsign: 'Bravo', worktree_path: null }
    ];
    const r = wip.checkAllWorkersWIP(workers);
    expect(r.anyDirty).toBe(true);
    expect(r.dirtyWorkers).toHaveLength(1);
    expect(r.dirtyWorkers[0].callsign).toBe('Alpha');
    expect(r.dirtyWorkers[0].files).toContain('dirty.txt');
    expect(r.cleanWorkers).toHaveLength(1);
    expect(r.cleanWorkers[0].callsign).toBe('Bravo');

    fs.unlinkSync(path.join(TMP_REPO, 'dirty.txt'));
  });

  test('handles null/empty worker list', () => {
    expect(wip.checkAllWorkersWIP(null)).toEqual({ anyDirty: false, dirtyWorkers: [], cleanWorkers: [] });
    expect(wip.checkAllWorkersWIP([])).toEqual({ anyDirty: false, dirtyWorkers: [], cleanWorkers: [] });
  });
});

describe('wip-guard.isProcessAlive', () => {
  test('current process pid is alive', () => {
    expect(wip.isProcessAlive(process.pid)).toBe(true);
  });

  test('null/undefined/0/negative pid → false', () => {
    expect(wip.isProcessAlive(null)).toBe(false);
    expect(wip.isProcessAlive(undefined)).toBe(false);
    expect(wip.isProcessAlive(0)).toBe(false);
    expect(wip.isProcessAlive(-1)).toBe(false);
  });

  test('non-numeric pid → false', () => {
    expect(wip.isProcessAlive('abc')).toBe(false);
    expect(wip.isProcessAlive({})).toBe(false);
  });

  test('definitely-dead pid → false', () => {
    // PID 99999999 is extremely unlikely to exist
    expect(wip.isProcessAlive(99999999)).toBe(false);
  });
});
