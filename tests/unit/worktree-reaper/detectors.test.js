/**
 * Unit tests for lib/worktree-reaper/detectors.js
 * SD-LEO-INFRA-FORMALIZED-WORKTREE-REAPER-001
 *
 * Each detector gets at least one positive + one negative case, plus edge
 * cases for boundary conditions (fresh claims, missing metadata, shipped but
 * without a PR, exactly-at-threshold ages, etc.).
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';

import {
  isZombieOnMain,
  isNested,
  hasOrphanSD,
  isPatchEquivalentToMain,
  isIdle,
} from '../../../lib/worktree-reaper/detectors.js';

// ── isZombieOnMain ─────────────────────────────────────────────────────

describe('isZombieOnMain (AC1)', () => {
  const claimMap = new Map();

  it('matches when branch is main and no claim exists', () => {
    const res = isZombieOnMain(
      { path: '/repo/.worktrees/SD-X', branch: 'main' },
      { claimMap: new Map() },
    );
    expect(res.matched).toBe(true);
    expect(res.reason).toBe('on_main_no_claim');
    expect(res.evidence.branch).toBe('main');
  });

  it('handles refs/heads/main prefix', () => {
    const res = isZombieOnMain(
      { path: '/repo/.worktrees/SD-X', branch: 'refs/heads/main' },
      { claimMap: new Map() },
    );
    expect(res.matched).toBe(true);
  });

  it('does not match when branch is a feature branch', () => {
    const res = isZombieOnMain(
      { path: '/repo/.worktrees/SD-X', branch: 'feat/SD-X' },
      { claimMap },
    );
    expect(res.matched).toBe(false);
    expect(res.reason).toBe('branch_not_main');
  });

  it('does not match when on main but an active claim exists for the path', () => {
    const wtPath = '/repo/.worktrees/SD-X';
    const map = new Map();
    map.set(
      path.resolve(wtPath).replace(/\\/g, '/').toLowerCase(),
      { sd_key: 'SD-X', heartbeat_at: new Date().toISOString() },
    );
    const res = isZombieOnMain({ path: wtPath, branch: 'main' }, { claimMap: map });
    expect(res.matched).toBe(false);
    expect(res.reason).toBe('on_main_but_claim_active');
    expect(res.evidence.claim_sd_key).toBe('SD-X');
  });
});

// ── isNested ───────────────────────────────────────────────────────────

describe('isNested (AC2)', () => {
  it('matches when path contains .worktrees/ twice (nested spawn)', () => {
    const res = isNested({
      path: 'C:/repo/.worktrees/SD-PARENT/.worktrees/SD-CHILD',
    });
    expect(res.matched).toBe(true);
    expect(res.reason).toBe('nested_path');
    expect(res.evidence.depth).toBe(2);
  });

  it('handles Windows backslash paths', () => {
    const res = isNested({
      path: 'C:\\repo\\.worktrees\\SD-PARENT\\.worktrees\\SD-CHILD',
    });
    expect(res.matched).toBe(true);
    expect(res.evidence.depth).toBe(2);
  });

  it('does not match a normal single-level worktree', () => {
    const res = isNested({ path: '/repo/.worktrees/SD-X' });
    expect(res.matched).toBe(false);
    expect(res.evidence.depth).toBe(1);
  });

  it('does not match the main repo (no .worktrees/ at all)', () => {
    const res = isNested({ path: '/repo' });
    expect(res.matched).toBe(false);
    expect(res.evidence.depth).toBe(0);
  });

  it('handles triply-nested as matched (depth 3)', () => {
    const res = isNested({
      path: '/repo/.worktrees/A/.worktrees/B/.worktrees/C',
    });
    expect(res.matched).toBe(true);
    expect(res.evidence.depth).toBe(3);
  });
});

// ── hasOrphanSD ────────────────────────────────────────────────────────

describe('hasOrphanSD (AC3)', () => {
  const readFileStub = (contents) => () => contents;

  it('matches when declared sdKey is not in sdMap or qfMap', () => {
    const res = hasOrphanSD(
      { path: '/repo/.worktrees/SD-GHOST', key: 'SD-GHOST' },
      {
        sdMap: new Set(),
        qfMap: new Set(),
        readFile: readFileStub(null),
      },
    );
    expect(res.matched).toBe(true);
    expect(res.reason).toBe('sdkey_not_in_db');
    expect(res.evidence.candidates).toContain('SD-GHOST');
  });

  it('does not match when sdMap contains the basename', () => {
    const res = hasOrphanSD(
      { path: '/repo/.worktrees/SD-REAL', key: 'SD-REAL' },
      {
        sdMap: new Set(['SD-REAL']),
        qfMap: new Set(),
        readFile: readFileStub(null),
      },
    );
    expect(res.matched).toBe(false);
    expect(res.reason).toBe('sdkey_found');
    expect(res.evidence.source).toBe('sd');
  });

  it('does not match when declared key from .worktree.json is in qfMap', () => {
    const res = hasOrphanSD(
      { path: '/repo/.worktrees/weird-path-xyz', key: 'weird-path-xyz' },
      {
        sdMap: new Set(),
        qfMap: new Set(['QF-20260424-001']),
        readFile: readFileStub(JSON.stringify({ sdKey: 'QF-20260424-001' })),
      },
    );
    expect(res.matched).toBe(false);
    expect(res.reason).toBe('sdkey_found');
    expect(res.evidence.source).toBe('qf');
  });

  it('does not match when basename is a known non-SD prefix', () => {
    const res = hasOrphanSD(
      { path: '/repo/.worktrees/concurrent-auto-12345', key: 'concurrent-auto-12345' },
      { sdMap: new Set(), qfMap: new Set(), readFile: readFileStub(null) },
    );
    expect(res.matched).toBe(false);
    expect(res.reason).toBe('non_sd_prefix');
  });

  it('matches when basename is a non-SD name and no metadata resolves it (conservative orphan)', () => {
    const res = hasOrphanSD(
      { path: '/repo/.worktrees/random-dir', key: 'random-dir' },
      { sdMap: new Set(), qfMap: new Set(), readFile: readFileStub(null) },
    );
    expect(res.matched).toBe(true);
    expect(res.reason).toBe('sdkey_not_in_db');
    expect(res.evidence.candidates).toContain('random-dir');
  });

  it('matches basename <sd_key>-<suffix> via prefix fallback (multi-worktree SD)', () => {
    const res = hasOrphanSD(
      { path: '/repo/.worktrees/SD-FOO-001-api', key: 'SD-FOO-001-api' },
      {
        sdMap: new Set(['SD-FOO-001']),
        qfMap: new Set(),
        readFile: readFileStub(null),
      },
    );
    expect(res.matched).toBe(false);
    expect(res.reason).toBe('sdkey_found_via_suffix');
    expect(res.evidence.matched_prefix).toBe('SD-FOO-001');
    expect(res.evidence.suffix).toBe('api');
  });

  it('does not falsely match via suffix when prefix is unknown', () => {
    const res = hasOrphanSD(
      { path: '/repo/.worktrees/RANDOM-KEY-abc', key: 'RANDOM-KEY-abc' },
      {
        sdMap: new Set(['SD-FOO-001']),
        qfMap: new Set(),
        readFile: readFileStub(null),
      },
    );
    expect(res.matched).toBe(true);
    expect(res.reason).toBe('sdkey_not_in_db');
  });

  it('reads .ehg-session.json workKey when .worktree.json is absent', () => {
    let callCount = 0;
    const readFile = (fp) => {
      callCount++;
      if (fp.endsWith('.worktree.json')) return null;
      if (fp.endsWith('.ehg-session.json')) return JSON.stringify({ workKey: 'SD-SESSION' });
      return null;
    };
    const res = hasOrphanSD(
      { path: '/repo/.worktrees/weird', key: 'weird' },
      { sdMap: new Set(['SD-SESSION']), qfMap: new Set(), readFile },
    );
    expect(res.matched).toBe(false);
    expect(res.reason).toBe('sdkey_found');
    expect(callCount).toBeGreaterThanOrEqual(2);
  });
});

// ── isPatchEquivalentToMain ────────────────────────────────────────────

describe('isPatchEquivalentToMain (AC4)', () => {
  const mkRunner = (result) => () => result;

  it('matches when cherry stdout is empty and PR is merged', async () => {
    const res = await isPatchEquivalentToMain(
      { path: '/repo/.worktrees/SD-X', branch: 'feat/SD-X' },
      {
        runGit: mkRunner({ stdout: '', stderr: '', code: 0 }),
        runGh: mkRunner({
          stdout: JSON.stringify([{ number: 123, state: 'MERGED', mergedAt: '2026-04-24T00:00:00Z' }]),
          stderr: '',
          code: 0,
        }),
      },
    );
    expect(res.matched).toBe(true);
    expect(res.reason).toBe('patch_equivalent_squash_merged');
    expect(res.evidence.merged_pr.number).toBe(123);
  });

  it('matches when all cherry lines are "-" (absorbed) even with no PR record', async () => {
    const res = await isPatchEquivalentToMain(
      { path: '/repo/.worktrees/SD-X', branch: 'feat/SD-X' },
      {
        runGit: mkRunner({
          stdout: '- aaaaaaaa Some commit\n- bbbbbbbb Another commit',
          stderr: '',
          code: 0,
        }),
        runGh: mkRunner({ stdout: '[]', stderr: '', code: 0 }),
      },
    );
    expect(res.matched).toBe(true);
    expect(res.reason).toBe('patch_equivalent_absorbed_without_pr');
  });

  it('does not match when cherry reports "+" lines (unique commits)', async () => {
    const res = await isPatchEquivalentToMain(
      { path: '/repo/.worktrees/SD-X', branch: 'feat/SD-X' },
      {
        runGit: mkRunner({
          stdout: '+ ccccccc Unique commit\n- ddddddd Absorbed commit',
          stderr: '',
          code: 0,
        }),
        runGh: mkRunner({ stdout: '[]', stderr: '', code: 0 }),
      },
    );
    expect(res.matched).toBe(false);
    expect(res.reason).toBe('branch_has_unique_commits');
    expect(res.evidence.unique_count).toBe(1);
  });

  it('does not match when branch is main itself', async () => {
    const res = await isPatchEquivalentToMain(
      { path: '/repo', branch: 'main' },
      { runGit: mkRunner({ stdout: '', stderr: '', code: 0 }), runGh: mkRunner({ stdout: '[]', stderr: '', code: 0 }) },
    );
    expect(res.matched).toBe(false);
    expect(res.reason).toBe('branch_is_main');
  });

  it('still matches when gh is unavailable but cherry is clean', async () => {
    const res = await isPatchEquivalentToMain(
      { path: '/repo/.worktrees/SD-X', branch: 'feat/SD-X' },
      {
        runGit: mkRunner({ stdout: '', stderr: '', code: 0 }),
        runGh: () => { throw new Error('gh: command not found'); },
      },
    );
    expect(res.matched).toBe(true);
    expect(res.reason).toBe('patch_equivalent_gh_unavailable');
  });

  it('does not match when cherry exits non-zero', async () => {
    const res = await isPatchEquivalentToMain(
      { path: '/repo/.worktrees/SD-X', branch: 'feat/SD-X' },
      {
        runGit: mkRunner({ stdout: '', stderr: 'fatal: unknown revision', code: 128 }),
        runGh: mkRunner({ stdout: '[]', stderr: '', code: 0 }),
      },
    );
    expect(res.matched).toBe(false);
    expect(res.reason).toBe('cherry_nonzero_exit');
  });
});

// ── isIdle ─────────────────────────────────────────────────────────────

describe('isIdle (AC5)', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('matches when last commit is older than threshold and no unique commits', () => {
    const now = Date.UTC(2026, 3, 24);
    const oldCommitSec = Math.floor((now - 30 * DAY) / 1000);
    const runGit = (args) => {
      if (args[0] === 'log') return { stdout: String(oldCommitSec), stderr: '', code: 0 };
      if (args[0] === 'cherry') return { stdout: '', stderr: '', code: 0 };
      return { stdout: '', stderr: '', code: 0 };
    };
    const res = isIdle(
      { path: '/repo/.worktrees/SD-OLD', branch: 'feat/SD-OLD' },
      {
        thresholdMs: 7 * DAY,
        now,
        claimMap: new Map(),
        runGit,
        stat: () => ({ mtimeMs: now - 30 * DAY }),
      },
    );
    expect(res.matched).toBe(true);
    expect(res.reason).toBe('idle_beyond_threshold');
    expect(res.evidence.uniqueCount).toBe(0);
  });

  it('does not match when a claim is active', () => {
    const wtPath = '/repo/.worktrees/SD-ACTIVE';
    const map = new Map();
    map.set(
      path.resolve(wtPath).replace(/\\/g, '/').toLowerCase(),
      { sd_key: 'SD-ACTIVE' },
    );
    const res = isIdle(
      { path: wtPath, branch: 'feat/SD-ACTIVE' },
      {
        thresholdMs: 7 * DAY,
        now: Date.UTC(2026, 3, 24),
        claimMap: map,
        runGit: () => ({ stdout: '0', stderr: '', code: 0 }),
        stat: () => ({ mtimeMs: 0 }),
      },
    );
    expect(res.matched).toBe(false);
    expect(res.reason).toBe('claim_active');
  });

  it('does not match when age is within threshold', () => {
    const now = Date.UTC(2026, 3, 24);
    const freshCommitSec = Math.floor((now - 2 * DAY) / 1000);
    const res = isIdle(
      { path: '/repo/.worktrees/SD-FRESH', branch: 'feat/SD-FRESH' },
      {
        thresholdMs: 7 * DAY,
        now,
        claimMap: new Map(),
        runGit: () => ({ stdout: String(freshCommitSec), stderr: '', code: 0 }),
        stat: () => ({ mtimeMs: now - 2 * DAY }),
      },
    );
    expect(res.matched).toBe(false);
    expect(res.reason).toBe('within_threshold');
  });

  it('does not match when branch has unique unpushed commits', () => {
    const now = Date.UTC(2026, 3, 24);
    const oldCommitSec = Math.floor((now - 30 * DAY) / 1000);
    const runGit = (args) => {
      if (args[0] === 'log') return { stdout: String(oldCommitSec), stderr: '', code: 0 };
      if (args[0] === 'cherry') {
        return { stdout: '+ abc Unique work\n+ def More work', stderr: '', code: 0 };
      }
      return { stdout: '', stderr: '', code: 0 };
    };
    const res = isIdle(
      { path: '/repo/.worktrees/SD-OLD-BUT-UNPUSHED', branch: 'feat/X' },
      {
        thresholdMs: 7 * DAY,
        now,
        claimMap: new Map(),
        runGit,
        stat: () => ({ mtimeMs: now - 30 * DAY }),
      },
    );
    expect(res.matched).toBe(false);
    expect(res.reason).toBe('has_unpushed_unique_commits');
    expect(res.evidence.uniqueCount).toBe(2);
  });

  it('does not match when there is no timing signal (fresh empty worktree)', () => {
    const res = isIdle(
      { path: '/repo/.worktrees/SD-EMPTY', branch: 'feat/X' },
      {
        thresholdMs: 7 * DAY,
        now: Date.UTC(2026, 3, 24),
        claimMap: new Map(),
        runGit: () => ({ stdout: '', stderr: '', code: 1 }),
        stat: () => null,
      },
    );
    expect(res.matched).toBe(false);
    expect(res.reason).toBe('no_timing_signal');
  });

  it('throws if thresholdMs is missing', () => {
    expect(() =>
      isIdle(
        { path: '/repo/.worktrees/X', branch: 'feat/X' },
        { claimMap: new Map(), runGit: () => ({ stdout: '', code: 0 }) },
      ),
    ).toThrow(/thresholdMs/);
  });
});
