/**
 * SD-LEO-INFRA-ORPHAN-WORKTREE-SWEEP-001 — orphan .worktrees/ sweep.
 *
 * Real-fs tests (mkdtemp sandbox + shared-node_modules CANARY) proving:
 *  - FR-1/FR-3: the reapable orphan set = filesystem dirs MINUS (registered + recent + helpers).
 *  - FR-2: reclamation goes through the junction-safe path; a CANARY file in a shared
 *          node_modules store SURVIVES removal of an orphan that junctions to it (no raw-rm).
 *  - FR-3: dry-run is the default (removes nothing).
 *  - FR-4: per-orphan failures are fail-soft (one failure never aborts the sweep).
 *  - back-compat: classifyOrphanDirs default (minAgeMs=0) excludes nothing new and now
 *                 additionally returns the reapable PATHS.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  selectReapableOrphans,
  reclaimOrphans,
  dirSizeBytes,
  defaultRemoveOrphan,
  resolveMinAgeMs,
  DEFAULT_ORPHAN_MIN_AGE_MS,
} from '../../../lib/worktree-reaper/orphan-sweep.js';
import { classifyOrphanDirs } from '../../../lib/worktree-quota.js';

let root, worktreesDir, sharedStore, canary;

function mkLeftover(name, { withGit = false } = {}) {
  const dir = path.join(worktreesDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'file.txt'), 'x'.repeat(100));
  if (withGit) fs.writeFileSync(path.join(dir, '.git'), 'gitdir: /somewhere');
  return dir;
}

// Junction (Windows) / dir-symlink (POSIX) from <dir>/node_modules to the shared store.
function linkNodeModules(dir) {
  const nm = path.join(dir, 'node_modules');
  const type = process.platform === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(sharedStore, nm, type);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'orphan-sweep-'));
  worktreesDir = path.join(root, '.worktrees');
  fs.mkdirSync(worktreesDir, { recursive: true });
  sharedStore = path.join(root, 'shared_node_modules', '@supabase', 'supabase-js');
  fs.mkdirSync(sharedStore, { recursive: true });
  canary = path.join(sharedStore, 'CANARY.txt');
  fs.writeFileSync(canary, 'do-not-delete');
});

afterEach(() => {
  // Defensive teardown: unlink any junctions first so the test cleanup never follows them.
  try {
    for (const e of fs.readdirSync(worktreesDir)) {
      const nm = path.join(worktreesDir, e, 'node_modules');
      try { if (fs.lstatSync(nm).isSymbolicLink()) fs.unlinkSync(nm); } catch { /* none */ }
    }
  } catch { /* worktreesDir gone */ }
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
});

describe('selectReapableOrphans (FR-1/FR-3)', () => {
  it('selects orphans = fs dirs minus registered + recent + helpers', () => {
    const oldOrphan = mkLeftover('old-orphan');
    const registered = mkLeftover('registered-wt', { withGit: true });
    const recent = mkLeftover('fresh-dir');
    fs.mkdirSync(path.join(worktreesDir, '_archive'), { recursive: true }); // helper, never an orphan

    // Age the old orphan well past the threshold; leave 'fresh-dir' new.
    const now = Date.now();
    const old = new Date(now - 2 * 60 * 60 * 1000);
    fs.utimesSync(oldOrphan, old, old);

    const sel = selectReapableOrphans({
      worktreesDir,
      registered: [registered],          // registered worktree path → excluded
      now,
      minAgeMs: 30 * 60 * 1000,          // 30 min
    });

    const reapNames = sel.reapableDirs.map((r) => r.dir);
    expect(reapNames).toContain('old-orphan');
    expect(reapNames).not.toContain('registered-wt'); // registered → excluded
    expect(reapNames).not.toContain('fresh-dir');     // too recent → excluded
    expect(reapNames).not.toContain('_archive');      // helper → not counted
    expect(sel.excluded.find((e) => e.dir === 'fresh-dir')?.reason).toBe('too_recent');
  });

  it('descends into typed subdirs (qf/sd/adhoc) — the dominant real orphan case', () => {
    // A QF leftover under .worktrees/qf/<id> (exactly the kind left when `git worktree
    // remove` hits a Windows lock). A top-level-only scan would MISS this.
    fs.mkdirSync(path.join(worktreesDir, 'qf'), { recursive: true });
    const qfOrphan = mkLeftover(path.join('qf', 'QF-20260616-999'));
    fs.mkdirSync(path.join(worktreesDir, 'adhoc'), { recursive: true });
    const registeredQf = mkLeftover(path.join('adhoc', 'ADHOC-LIVE'), { withGit: true });
    // _archive contents must NEVER be reaped (it is the reaper's preserve destination).
    fs.mkdirSync(path.join(worktreesDir, '_archive', 'preserved-from-x'), { recursive: true });

    const now = Date.now();
    const old = new Date(now - 2 * 60 * 60 * 1000);
    fs.utimesSync(qfOrphan, old, old);

    const sel = selectReapableOrphans({
      worktreesDir,
      registered: [registeredQf],
      now,
      minAgeMs: 30 * 60 * 1000,
    });
    const reapNames = sel.reapableDirs.map((r) => r.dir);
    expect(reapNames).toContain('qf/QF-20260616-999'); // nested orphan caught + prefixed
    expect(reapNames).not.toContain('adhoc/ADHOC-LIVE'); // registered → excluded
    expect(reapNames.some((n) => n.includes('preserved-from-x'))).toBe(false); // _archive never scanned
  });
});

describe('reclaimOrphans dry-run (FR-3)', () => {
  it('removes nothing by default', () => {
    const d = mkLeftover('orphan-1');
    const res = reclaimOrphans([{ dir: 'orphan-1', full: d }], { execute: false, repoRoot: root });
    expect(res.dry_run).toBe(true);
    expect(res.reclaimed_count).toBe(1);
    expect(fs.existsSync(d)).toBe(true); // still on disk
  });
});

describe('reclaimOrphans junction safety — CANARY survives (FR-2)', () => {
  it('reclaims an orphan that junctions to shared node_modules without gutting the store', () => {
    const orphan = mkLeftover('orphan-junctioned');
    linkNodeModules(orphan);
    expect(fs.existsSync(canary)).toBe(true);

    const res = reclaimOrphans([{ dir: 'orphan-junctioned', full: orphan }], {
      execute: true,
      repoRoot: root, // not a git repo → removeWorktreeViaGit fails → safeRecursiveRm fallback
    });

    expect(res.reclaimed_count).toBe(1);
    expect(res.failed.length).toBe(0);
    expect(fs.existsSync(orphan)).toBe(false);  // orphan removed
    expect(fs.existsSync(canary)).toBe(true);   // shared store CANARY survived (junction not followed)
  });
});

describe('reclaimOrphans fail-soft (FR-4)', () => {
  it('a removal error on one orphan does not stop the others', () => {
    const a = mkLeftover('a');
    const b = mkLeftover('b');
    const c = mkLeftover('c');
    const remove = (full) => {
      if (full.endsWith('b')) throw new Error('boom');
      fs.rmSync(full, { recursive: true, force: true });
      return { ok: true, method: 'test-rm' };
    };
    const res = reclaimOrphans(
      [{ dir: 'a', full: a }, { dir: 'b', full: b }, { dir: 'c', full: c }],
      { execute: true, repoRoot: root, remove },
    );
    expect(res.reclaimed_count).toBe(2);
    expect(res.failed.length).toBe(1);
    expect(res.failed[0].dir).toBe('b');
    expect(fs.existsSync(a)).toBe(false);
    expect(fs.existsSync(b)).toBe(true);  // failed one left in place
    expect(fs.existsSync(c)).toBe(false);
  });
});

describe('dirSizeBytes — never follows junctions', () => {
  it('counts file bytes but not the shared store behind a junction', () => {
    const d = mkLeftover('sized'); // file.txt = 100 bytes
    linkNodeModules(d);            // junction to a large shared store
    const bytes = dirSizeBytes(d);
    expect(bytes).toBe(100); // only the real file; junction target excluded
  });
});

describe('classifyOrphanDirs back-compat (additive)', () => {
  it('default minAgeMs=0 excludes nothing new and returns reapable PATHS', () => {
    const o1 = mkLeftover('o1');
    mkLeftover('o2');
    const res = classifyOrphanDirs(worktreesDir, []); // no minAgeMs
    expect(res.reapable).toBe(2);
    expect(res.reapableDirs.map((r) => r.dir).sort()).toEqual(['o1', 'o2']);
    expect(res.excluded.find((e) => e.reason === 'too_recent')).toBeUndefined();
    expect(res.reapableDirs.find((r) => r.dir === 'o1').full).toBe(o1);
  });
});

describe('resolveMinAgeMs', () => {
  it('defaults when unset and parses a valid override', () => {
    expect(resolveMinAgeMs({})).toBe(DEFAULT_ORPHAN_MIN_AGE_MS);
    expect(resolveMinAgeMs({ WORKTREE_ORPHAN_MIN_AGE_MS: '60000' })).toBe(60000);
    expect(resolveMinAgeMs({ WORKTREE_ORPHAN_MIN_AGE_MS: 'garbage' })).toBe(DEFAULT_ORPHAN_MIN_AGE_MS);
  });
});
