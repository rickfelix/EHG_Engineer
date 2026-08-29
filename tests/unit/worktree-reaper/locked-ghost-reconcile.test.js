/**
 * QF-20260829-412 — worktree-reaper: deregister properly (unlock-then-prune) + reconcile at START.
 *
 * Root cause (measured live 2026-08-29, harness_backlog 7a73d93c): the reaper's fs-rm+prune
 * fallback deletes the worktree DIRECTORY without `git worktree unlock`, so a LOCKED
 * registration survives `git worktree prune` forever once its directory is gone —
 * countActiveWorktrees() counts the phantom, and the pool shrinks one slot per failed removal.
 *
 * Coverage:
 *   (a) parsePorcelain now captures `locked` / `locked <reason>` lines (previously dropped)
 *   (b) reconcileLockedGhosts selects ONLY locked+directory-absent entries (the hard criterion —
 *       a locked entry whose directory still EXISTS means a peer is mid-creation and must never
 *       be touched)
 *   (c) reconcileLockedGhosts is a pure report in dry-run (execute:false) — no git mutation
 *   (d) end-to-end against a REAL scratch git repo: lock a worktree, delete its directory by
 *       hand (simulating the fs-rm-without-unlock defect), confirm `git worktree list` still
 *       shows it, then confirm reconcileLockedGhosts(execute:true) clears it for real
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parsePorcelain, listActiveWorktrees } from '../../../lib/worktree-quota.js';
import { reconcileLockedGhosts } from '../../../scripts/worktree-reaper.mjs';

describe('parsePorcelain — locked line parsing (previously dropped entirely)', () => {
  it('captures a bare `locked` line with no reason', () => {
    const raw = 'worktree /repo/.worktrees/QF-1\nHEAD abc123\nbranch refs/heads/qf/QF-1\nlocked\n';
    const [wt] = parsePorcelain(raw);
    expect(wt.locked).toBe(true);
    expect(wt.lockedReason).toBeUndefined();
  });

  it('captures `locked <reason>` with the reason text', () => {
    const raw = 'worktree /repo/.worktrees/QF-2\nHEAD abc123\nbranch refs/heads/qf/QF-2\nlocked initializing\n';
    const [wt] = parsePorcelain(raw);
    expect(wt.locked).toBe(true);
    expect(wt.lockedReason).toBe('initializing');
  });

  it('leaves `locked` undefined for a normal (unlocked) entry', () => {
    const raw = 'worktree /repo/.worktrees/QF-3\nHEAD abc123\nbranch refs/heads/qf/QF-3\n';
    const [wt] = parsePorcelain(raw);
    expect(wt.locked).toBeUndefined();
  });

  it('does not let a locked entry bleed into the next worktree block', () => {
    const raw = 'worktree /repo/.worktrees/QF-1\nlocked ghost\nworktree /repo/.worktrees/QF-2\n';
    const [wt1, wt2] = parsePorcelain(raw);
    expect(wt1.locked).toBe(true);
    expect(wt2.locked).toBeUndefined();
  });
});

describe('reconcileLockedGhosts — selection logic (dry-run, no git calls)', () => {
  it('selects a locked entry whose directory is absent (the ghost signature)', () => {
    const ghostPath = path.join(os.tmpdir(), `pbp-ghost-${Date.now()}-absent`);
    const worktrees = [{ path: ghostPath, locked: true }];
    const found = reconcileLockedGhosts(worktrees, { repoRoot: '/repo', execute: false });
    expect(found).toHaveLength(1);
    expect(found[0].path).toBe(ghostPath);
  });

  it('HARD CRITERION: excludes a locked entry whose directory still EXISTS (peer mid-creation)', () => {
    const livePath = fs.mkdtempSync(path.join(os.tmpdir(), 'pbp-live-'));
    try {
      const worktrees = [{ path: livePath, locked: true }];
      const found = reconcileLockedGhosts(worktrees, { repoRoot: '/repo', execute: false });
      expect(found).toHaveLength(0);
    } finally {
      fs.rmSync(livePath, { recursive: true, force: true });
    }
  });

  it('excludes a non-locked entry even if its directory is absent', () => {
    const absentPath = path.join(os.tmpdir(), `pbp-notlocked-${Date.now()}`);
    const worktrees = [{ path: absentPath, locked: false }];
    const found = reconcileLockedGhosts(worktrees, { repoRoot: '/repo', execute: false });
    expect(found).toHaveLength(0);
  });

  it('is a pure report in dry-run mode — never mutates anything (no repoRoot access attempted)', () => {
    // repoRoot is a path that does not exist; if reconcileLockedGhosts tried to run git
    // against it in dry-run mode, this would throw. It must not.
    const ghostPath = path.join(os.tmpdir(), `pbp-ghost-dryrun-${Date.now()}`);
    const worktrees = [{ path: ghostPath, locked: true }];
    expect(() => reconcileLockedGhosts(worktrees, { repoRoot: '/definitely/does/not/exist', execute: false }))
      .not.toThrow();
  });
});

describe('reconcileLockedGhosts — end-to-end against a real scratch git repo', () => {
  let scratchRepo;
  let wtPath;

  afterEach(() => {
    if (scratchRepo) fs.rmSync(scratchRepo, { recursive: true, force: true });
    scratchRepo = null;
  });

  it('clears a locked-ghost registration for real: git worktree list stops showing it after reconcile', () => {
    scratchRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'pbp-scratch-repo-'));
    const git = (args) => execFileSync('git', args, { cwd: scratchRepo, encoding: 'utf8' });

    git(['init', '-q']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'Test']);
    fs.writeFileSync(path.join(scratchRepo, 'README.md'), 'x');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'init']);

    wtPath = path.join(scratchRepo, '.worktrees', 'QF-scratch-ghost');
    git(['worktree', 'add', '-b', 'qf/QF-scratch-ghost', wtPath]);
    git(['worktree', 'lock', wtPath, '--reason', 'initializing']);

    // Simulate the defect: delete the directory WITHOUT unlocking first (what the
    // pre-fix fs-rm+prune fallback did).
    fs.rmSync(wtPath, { recursive: true, force: true });

    // Confirm the ghost signature: still registered, locked, directory gone, and a
    // bare prune refuses to clear it (this is the exact bug being fixed).
    const before = listActiveWorktrees(scratchRepo);
    const ghostBefore = before.find((wt) => wt.path.replace(/\\/g, '/').endsWith('QF-scratch-ghost'));
    expect(ghostBefore).toBeDefined();
    expect(ghostBefore.locked).toBe(true);
    expect(fs.existsSync(wtPath)).toBe(false);
    git(['worktree', 'prune']); // bare prune must NOT clear a locked entry
    const stillThere = listActiveWorktrees(scratchRepo)
      .some((wt) => wt.path.replace(/\\/g, '/').endsWith('QF-scratch-ghost'));
    expect(stillThere).toBe(true);

    // The fix: reconcile at execute:true actually clears it.
    reconcileLockedGhosts(before, { repoRoot: scratchRepo, execute: true });

    const after = listActiveWorktrees(scratchRepo);
    const ghostAfter = after.find((wt) => wt.path.replace(/\\/g, '/').endsWith('QF-scratch-ghost'));
    expect(ghostAfter).toBeUndefined();
  });
});
