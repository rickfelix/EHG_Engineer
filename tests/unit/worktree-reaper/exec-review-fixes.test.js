/**
 * Regressions for the four defects TESTING and SECURITY found in the -B implementation at
 * EXEC-TO-PLAN. Each was REPRODUCED before being fixed; these pin the fixes.
 *
 *  F3/F1  — a pruned or .git-less tree was made permanently unreapable by FR-7, which is
 *           the stranding shape this SD family exists to unstick, re-created one layer
 *           down. It also broke cleanup-pending-sweep (bare mkdtemp fixtures).
 *  SEC-01 — a junction in an INTERMEDIATE path segment escaped the cleanup provider's
 *           containment check; SECURITY destroyed a real file under .worktrees through it.
 *  SEC-03 — a stat error became evidence of absence, and on Windows the errors most
 *           correlated with occupancy (EPERM/EBUSY) are exactly the ones that cleared it.
 *  SEC-05 — a future timestamp produced a negative age and blocked FOREVER.
 */
import { describe, test, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { isReapable, REAP_REASONS } from '../../../lib/worktree-reapability.js';
import {
  treeResidencyBlocksRemoval,
  REAP_BLOCKED_TREE_RESIDENT,
  REAP_RESIDENCY_UNKNOWN,
} from '../../../lib/worktree-reaper/residency-guard.js';
import { cleanupFilesystem } from '../../../lib/cleanup/filesystem-provider.js';

const git = (a, c) => execFileSync('git', a, { cwd: c, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const cleanups = [];
afterEach(() => { for (const fn of cleanups.splice(0)) { try { fn(); } catch { /* best effort */ } } });

describe('F3/F1 — "no git state here" is definitive, not unknown', () => {
  test('a PRUNED worktree is reapable again (it was permanently stranded)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'f3-'));
    cleanups.push(() => fs.rmSync(root, { recursive: true, force: true }));
    git(['init', '-q', '-b', 'main'], root);
    git(['config', 'user.email', 'a@b.c'], root);
    git(['config', 'user.name', 't'], root);
    fs.writeFileSync(path.join(root, 's.txt'), 's');
    git(['add', '-A'], root); git(['commit', '-q', '-m', 's'], root);
    const wt = path.join(root, '.worktrees', 'SD-PRUNE-001');
    git(['worktree', 'add', '-q', '-b', 'feat/SD-PRUNE-001', wt], root);
    fs.rmSync(path.join(root, '.git', 'worktrees', 'SD-PRUNE-001'), { recursive: true, force: true });

    // ARMING: every git command in that tree really does fail now.
    let rawExit = 0;
    try { git(['status', '--porcelain'], wt); } catch (e) { rawExit = e.status; }
    expect(rawExit).toBe(128);

    expect(isReapable(wt)).toEqual({ reapable: true, reason: REAP_REASONS.ORPHAN_CLEAN });
  });

  test('OPPOSITE POLARITY: a tree that OWNS its git state and still fails stays unverifiable', () => {
    // Without this, the F3 fix would degrade into "any git failure means reapable",
    // which is the original FR-7 defect restored.
    const owned = (a) => (a[0] === 'rev-parse' ? { code: 0, stdout: process.cwd() } : { code: 128, stdout: '' });
    expect(isReapable(process.cwd(), { gitRunner: owned }).reason).toBe(REAP_REASONS.UNVERIFIABLE);
  });
});

describe('SEC-01 — containment is a filesystem fact, not a string fact', () => {
  test('a junction in an intermediate segment cannot smuggle a worktree path past the refusal', () => {
    const cwd = process.cwd();
    const victimDir = path.join(cwd, '.worktrees', '__sec01_regression__');
    const victimFile = path.join(victimDir, 'work.js');
    const portal = path.join(cwd, 'tmp', '__sec01_portal__');
    fs.mkdirSync(victimDir, { recursive: true });
    fs.writeFileSync(victimFile, 'precious');
    fs.mkdirSync(path.join(cwd, 'tmp'), { recursive: true });
    cleanups.push(() => fs.rmSync(victimDir, { recursive: true, force: true }));
    try {
      fs.symlinkSync(path.join(cwd, '.worktrees'), portal, 'junction');
    } catch {
      return; // link creation unavailable in this environment — nothing to assert
    }
    cleanups.push(() => fs.rmSync(portal, { recursive: true, force: true }));

    return cleanupFilesystem('v', { paths: [path.join(portal, '__sec01_regression__')] }).then((r) => {
      expect(r.cleaned).toEqual([]);
      expect(r.errors[0].error).toMatch(/guarded reaper|worktree-manager/i);
      expect(fs.existsSync(victimFile)).toBe(true);
    });
  });
});

describe('SEC-03 — a stat error is not evidence of absence', () => {
  const quiet = () => {};
  test.each(['EPERM', 'EBUSY', 'EACCES', 'EIO'])('%s fails CLOSED (on Windows these correlate with occupancy)', (code) => {
    const boom = () => { const e = new Error(code); e.code = code; throw e; };
    const r = treeResidencyBlocksRemoval(process.cwd(), {
      nowMs: Date.now(), statFn: boom, gitRunner: () => ({ code: 128, stdout: '' }), logger: quiet,
    });
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe(REAP_RESIDENCY_UNKNOWN);
  });

  test('ENOENT is a REAL answer — nothing occupies a path that does not exist', () => {
    const gone = () => { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; };
    const r = treeResidencyBlocksRemoval(process.cwd(), {
      nowMs: Date.now(), statFn: gone, gitRunner: () => ({ code: 128, stdout: '' }), logger: quiet,
    });
    expect(r.blocked).toBe(false);
  });
});

describe('SEC-05 — a future timestamp cannot block forever', () => {
  const quiet = () => {};
  const now = 1_800_000_000_000;
  const YEAR = 365 * 24 * 60 * 60 * 1000;

  test('a tree stamped years in the future is resident for ONE window, not forever', () => {
    const future = { nowMs: now, statFn: () => ({ mtimeMs: now + 3 * YEAR }), gitRunner: () => ({ code: 128, stdout: '' }), logger: quiet };
    expect(treeResidencyBlocksRemoval(process.cwd(), future).reason).toBe(REAP_BLOCKED_TREE_RESIDENT);

    // Evaluated well past the window it is no longer resident — the clamp lets it age out.
    const later = { ...future, nowMs: now + 3 * YEAR + 60 * 60 * 1000, statFn: () => ({ mtimeMs: now + 3 * YEAR }) };
    expect(treeResidencyBlocksRemoval(process.cwd(), later).blocked).toBe(false);
  });
});
