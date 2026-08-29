/**
 * QF-20260829-033 — an unkeyed worktree outside .worktrees/ (manually `git worktree add`-created;
 * sd-start.js/qf-start.js always resolve a key by construction, so this class can only exist
 * outside both) gets a LONGER residency window than the standard 30min default, since it has no
 * identity-based second line of defense (no claim, no sd_key) and relies on tree residency alone.
 * Three measured specimens (harness_backlog 478dc543) were reaped mid multi-hour chairman
 * ceremony despite being genuinely in use, each idle (no commit/file-write) for well over 30min
 * while a human was still deliberating on an SMS decision queue.
 *
 * Deliberately in tests/unit/ (not tests/integration/) — all of tests/integration/**\/*.test.js is
 * globally routed to the DB-gated tier (vitest.config.js DB_INCLUDE), skipped at runtime without a
 * designated non-prod ref, regardless of whether an individual file actually touches a DB. These
 * tests are pure fs/git, so the unit tier is the correct home and keeps them CI-visible by default.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { isExternalUnkeyedWorktree, EXTERNAL_UNKEYED_RESIDENCY_WINDOW_MIN } from '../../../scripts/worktree-reaper.mjs';
import { treeResidencyBlocksRemoval } from '../../../lib/worktree-reaper/residency-guard.js';

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

describe('isExternalUnkeyedWorktree', () => {
  const worktreesDir = path.join('C:', 'repo', '.worktrees');

  it('true for an unkeyed worktree outside .worktrees/', () => {
    expect(isExternalUnkeyedWorktree(path.join('C:', 'repo', '..', 'repo-scribe-doctrine'), worktreesDir, null)).toBe(true);
  });

  it('false for a worktree inside .worktrees/, even if unkeyed', () => {
    expect(isExternalUnkeyedWorktree(path.join(worktreesDir, 'some-unresolvable-dir'), worktreesDir, null)).toBe(false);
  });

  it('false for an external worktree that DOES resolve a key', () => {
    expect(isExternalUnkeyedWorktree(path.join('C:', 'repo', '..', 'repo-ops-drill'), worktreesDir, 'SD-XXX-001')).toBe(false);
  });
});

describe('QF-20260829-033: two-sided residency window for external/unkeyed worktrees (live-git fixture)', () => {
  // nowMs is INJECTED relative to the fixture's own HEAD commit time (not the wall clock) —
  // mirrors tests/unit/worktree-reaper/tree-residency-guard.test.js's established pattern. A
  // freshly-created worktree's HEAD/mtime are both "now" at creation; controlling apparent AGE via
  // nowMs (rather than backdating fs.utimesSync, which HEAD would override anyway) is what
  // actually exercises the window comparison.
  const HOUR = 60 * 60 * 1000;
  let repo;
  let wt;
  let headMs;

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'reaper-qf033-'));
    git(['init', '-q', '-b', 'main'], repo);
    git(['config', 'user.email', 'qf033@test.local'], repo);
    git(['config', 'user.name', 'qf033'], repo);
    git(['commit', '--allow-empty', '-q', '-m', 'init'], repo);
    wt = path.join(repo, '..', `${path.basename(repo)}-scribe-doctrine`);
    git(['worktree', 'add', '-q', '--detach', wt], repo);
    headMs = Number(git(['log', '-1', '--format=%ct'], wt).trim()) * 1000;
  });

  afterEach(() => {
    try { fs.rmSync(wt, { recursive: true, force: true }); } catch { /* ignore */ }
    try { execFileSync('git', ['worktree', 'prune'], { cwd: repo }); } catch { /* ignore */ }
    try { fs.rmSync(repo, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('SKIPPED: a 2h-old unkeyed external tree is protected under the 4h external window, though it would fail the default 30min window', () => {
    const nowMs = headMs + 2 * HOUR;

    // Would be reaped under the DEFAULT window (30min < 2h old)...
    const underDefault = treeResidencyBlocksRemoval(wt, { nowMs, windowMin: 30 });
    expect(underDefault.blocked).toBe(false);

    // ...but is protected under the wider external-unkeyed window this QF adds.
    const underExternal = treeResidencyBlocksRemoval(wt, { nowMs, windowMin: EXTERNAL_UNKEYED_RESIDENCY_WINDOW_MIN });
    expect(underExternal.blocked).toBe(true);
  });

  it('REAPED: a genuinely idle unkeyed external tree (past even the 4h window) still clears — the wider window is not a permanent shield', () => {
    const nowMs = headMs + 5 * HOUR;
    const underExternal = treeResidencyBlocksRemoval(wt, { nowMs, windowMin: EXTERNAL_UNKEYED_RESIDENCY_WINDOW_MIN });
    expect(underExternal.blocked).toBe(false);
  });
});
