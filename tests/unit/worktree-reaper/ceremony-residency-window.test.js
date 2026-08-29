/**
 * QF-20260829-726 — location-aware default residency window.
 *
 * Ruled disposition of reaper specimen-3: the residency guard EXISTS and ran correctly — the
 * defect was calibration. DEFAULT_RESIDENCY_WINDOW_MIN=30 is too short for ceremony-paced trees
 * (manually-created, outside .worktrees/, no sd-start/qf-start marker) where the chairman answers
 * queue items with ~2h gaps. A tree outside .worktrees/ now defaults to CEREMONY_RESIDENCY_WINDOW_MIN
 * (240min / 4h) instead of the 30min pool default.
 *
 * TWO-SIDED per the QF's acceptance bar:
 *   (a) an idle-3h ceremony tree outside .worktrees/ is NOT removed under the new default.
 *   (b) a genuinely stale 3-day tree (either location) still IS removed.
 *   (c) an explicit env override still wins over BOTH defaults.
 */
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  treeResidencyBlocksRemoval,
  REAP_BLOCKED_TREE_RESIDENT,
  DEFAULT_RESIDENCY_WINDOW_MIN,
  CEREMONY_RESIDENCY_WINDOW_MIN,
} from '../../../lib/worktree-reaper/residency-guard.js';

const MIN = 60 * 1000;
const NOW = 1_800_000_000_000;
const noGit = () => ({ code: 128, stdout: '' });
const quiet = () => {};

// Windows path.sep is '\\'; the guard is separator-tolerant, so these fixture paths (never
// touching a real filesystem -- statFn/gitRunner are injected) exercise the same branch on
// every platform CI runs on.
const CEREMONY_TREE = 'C:/scratch/scribe/rls-receipts-20260829'; // manually-created, no .worktrees/
const POOL_TREE = 'C:/repo/.worktrees/SD-EXAMPLE-001'; // sd-start/qf-start managed

describe('QF-20260829-726: location-aware default residency window', () => {
  afterEach(() => { delete process.env.WORKTREE_RESIDENCY_WINDOW_MIN; });

  test('(a) a 3h-idle ceremony tree (outside .worktrees/) is NOT removed under the new default', () => {
    const r = treeResidencyBlocksRemoval(CEREMONY_TREE, {
      nowMs: NOW,
      statFn: () => ({ mtimeMs: NOW - 3 * 60 * MIN }), // 3h idle
      gitRunner: noGit,
      logger: quiet,
    });
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe(REAP_BLOCKED_TREE_RESIDENT);
    expect(r.detail.window_ms).toBe(CEREMONY_RESIDENCY_WINDOW_MIN * MIN);
  });

  test('a 3h-idle POOL tree (inside .worktrees/) is REMOVED under the unchanged 30min default -- the calibration is location-specific', () => {
    const r = treeResidencyBlocksRemoval(POOL_TREE, {
      nowMs: NOW,
      statFn: () => ({ mtimeMs: NOW - 3 * 60 * MIN }), // 3h idle
      gitRunner: noGit,
      logger: quiet,
    });
    expect(r.blocked).toBe(false);
    expect(r.detail.window_ms).toBe(DEFAULT_RESIDENCY_WINDOW_MIN * MIN);
  });

  test('(b) a genuinely stale 3-day ceremony tree is STILL removed despite the longer default', () => {
    const r = treeResidencyBlocksRemoval(CEREMONY_TREE, {
      nowMs: NOW,
      statFn: () => ({ mtimeMs: NOW - 3 * 24 * 60 * MIN }), // 3 days idle
      gitRunner: noGit,
      logger: quiet,
    });
    expect(r.blocked).toBe(false);
  });

  test('(c) WORKTREE_RESIDENCY_WINDOW_MIN env override wins over the ceremony default (tightens it)', () => {
    process.env.WORKTREE_RESIDENCY_WINDOW_MIN = '10';
    const r = treeResidencyBlocksRemoval(CEREMONY_TREE, {
      nowMs: NOW,
      statFn: () => ({ mtimeMs: NOW - 30 * MIN }), // 30min idle -- inside the 240min ceremony default, outside a 10min override
      gitRunner: noGit,
      logger: quiet,
    });
    expect(r.blocked).toBe(false);
    expect(r.detail.window_ms).toBe(10 * MIN);
  });

  test('(c) WORKTREE_RESIDENCY_WINDOW_MIN env override wins over the pool default (loosens it)', () => {
    process.env.WORKTREE_RESIDENCY_WINDOW_MIN = '500';
    const r = treeResidencyBlocksRemoval(POOL_TREE, {
      nowMs: NOW,
      statFn: () => ({ mtimeMs: NOW - 3 * 60 * MIN }), // 3h idle -- outside the 30min pool default, inside a 500min override
      gitRunner: noGit,
      logger: quiet,
    });
    expect(r.blocked).toBe(true);
    expect(r.detail.window_ms).toBe(500 * MIN);
  });

  test('an explicit windowMin param wins over BOTH the env override and the location-aware default', () => {
    process.env.WORKTREE_RESIDENCY_WINDOW_MIN = '500';
    const r = treeResidencyBlocksRemoval(CEREMONY_TREE, {
      nowMs: NOW,
      windowMin: 5,
      statFn: () => ({ mtimeMs: NOW - 10 * MIN }), // 10min idle -- outside a 5min explicit window
      gitRunner: noGit,
      logger: quiet,
    });
    expect(r.blocked).toBe(false);
    expect(r.detail.window_ms).toBe(5 * MIN);
  });

  test('a path ending exactly at .worktrees (no trailing segment) is treated as inside the pool', () => {
    const r = treeResidencyBlocksRemoval('C:/repo/.worktrees', {
      nowMs: NOW,
      statFn: () => ({ mtimeMs: NOW - 3 * 60 * MIN }), // 3h idle
      gitRunner: noGit,
      logger: quiet,
    });
    expect(r.blocked).toBe(false); // 3h > 30min pool default
    expect(r.detail.window_ms).toBe(DEFAULT_RESIDENCY_WINDOW_MIN * MIN);
  });
});
