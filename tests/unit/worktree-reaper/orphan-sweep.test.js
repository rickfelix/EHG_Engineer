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

/**
 * Age a leftover tree — DIRECTORY AND CONTENTS.
 *
 * SD-LEO-INFRA-ORPHAN-SWEEP-HARD-001 (FR-2): these fixtures previously called
 * `fs.utimesSync(dir, old, old)` and aged the CONTAINER ONLY, leaving the file inside freshly
 * written. Under the old guard — which stat'd the top-level directory inode — that read as two
 * hours old and the tests passed. Under FR-2, which reads the newest DESCENDANT mtime, the same
 * fixture correctly reads as SECONDS old and is excluded as too_recent.
 *
 * The tests were not wrong about intent; their fixture encoded the very blindness FR-2 removes.
 * A directory whose contents were written moments ago IS recent, and the incident is precisely
 * what that confusion costs: a tree edited 3.5h earlier read as ancient because only the container
 * was consulted. So the fixtures are corrected to age the whole tree — the guard is not weakened
 * to accommodate them.
 */
function ageTree(dir, ms) {
  const when = new Date(Date.now() - ms);
  for (const e of fs.readdirSync(dir)) {
    const p = path.join(dir, e);
    try { if (!fs.lstatSync(p).isSymbolicLink()) fs.utimesSync(p, when, when); } catch { /* skip */ }
  }
  fs.utimesSync(dir, when, when);
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
  // SD-LEO-INFRA-ORPHAN-SWEEP-HARD-001 (FR-1): archived orphans now live one level deeper, at
  // _archive/<name>-<ts>/node_modules. Without descending into _archive the teardown's recursive
  // rmSync below is no longer junction-guarded and could follow a junction into the shared store —
  // the exact harm the CANARY test exists to detect, caused by the cleanup rather than the code.
  const unlinkJunctionsIn = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir); } catch { return; }
    for (const e of entries) {
      const nm = path.join(dir, e, 'node_modules');
      try { if (fs.lstatSync(nm).isSymbolicLink()) fs.unlinkSync(nm); } catch { /* none */ }
    }
  };
  unlinkJunctionsIn(worktreesDir);
  unlinkJunctionsIn(path.join(worktreesDir, '_archive'));
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
});

describe('selectReapableOrphans (FR-1/FR-3)', () => {
  it('selects orphans = fs dirs minus registered + recent + helpers', () => {
    const oldOrphan = mkLeftover('old-orphan');
    const registered = mkLeftover('registered-wt', { withGit: true });
    const recent = mkLeftover('fresh-dir');
    fs.mkdirSync(path.join(worktreesDir, '_archive'), { recursive: true }); // helper, never an orphan

    // Age the old orphan well past the threshold — CONTENTS INCLUDED (see ageTree); leave
    // 'fresh-dir' new. FR-2 reads the newest DESCENDANT mtime, so ageing only the container
    // would leave this tree correctly classified as seconds old.
    const now = Date.now();
    ageTree(oldOrphan, 2 * 60 * 60 * 1000);

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
    ageTree(qfOrphan, 2 * 60 * 60 * 1000);

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
    // SD-LEO-INFRA-ORPHAN-SWEEP-HARD-001 (FR-1) REPAIR — READ THIS BEFORE EDITING.
    //
    // This test was the repo's ONLY behavioural proof that orphan reclamation does not follow a
    // node_modules junction and gut the shared store. It proved it by DELETING a junctioned tree
    // and checking the canary survived.
    //
    // FR-1 made reclamation rename-only. The two original assertions then became TRUE FOR THE
    // WRONG REASONS and the test went on passing while measuring nothing:
    //   existsSync(orphan)===false  — still true, because a rename MOVES the source away.
    //   existsSync(canary)===true   — now TRIVIALLY true, because nothing deletes any more.
    // A test whose failure mode has been removed is indistinguishable from a healthy one.
    // (PAT-TEST-PINS-FACT-NOT-BEHAVIOUR-001.)
    //
    // The destination assertions below are what restore its teeth: they check the junction moved
    // AS A LINK, still resolves to the shared store, and that the store was never traversed.
    const orphan = mkLeftover('orphan-junctioned');
    linkNodeModules(orphan);
    expect(fs.existsSync(canary)).toBe(true);
    const storeEntriesBefore = fs.readdirSync(sharedStore).length;

    const res = reclaimOrphans([{ dir: 'orphan-junctioned', full: orphan }], {
      execute: true,
      repoRoot: root, // not a git repo → the best-effort `git worktree prune` is skipped
    });

    expect(res.reclaimed_count).toBe(1);
    expect(res.failed.length).toBe(0);
    expect(fs.existsSync(orphan)).toBe(false);  // source path vacated (moved, not deleted)
    expect(fs.existsSync(canary)).toBe(true);   // shared store CANARY survived

    // --- FR-1 destination assertions: the archive actually holds the content ---
    const archiveRoot = path.join(worktreesDir, '_archive');
    const archived = fs.readdirSync(archiveRoot).filter((d) => d.startsWith('orphan-junctioned-'));
    expect(archived).toHaveLength(1);
    const dest = path.join(archiveRoot, archived[0]);

    // The real file moved with it — proves this was a move, not a delete-and-forget.
    expect(fs.readFileSync(path.join(dest, 'file.txt'), 'utf8')).toHaveLength(100);

    // The junction moved AS A JUNCTION and still points at the shared store. If rename had
    // dereferenced it, this would be a real directory containing a copy of the store.
    const destNm = path.join(dest, 'node_modules');
    expect(fs.lstatSync(destNm).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(path.join(destNm, 'CANARY.txt'), 'utf8')).toBe('do-not-delete');

    // The store itself was never walked into or added to.
    expect(fs.readdirSync(sharedStore).length).toBe(storeEntriesBefore);
  });

  it('REFUSES rather than truncating when the move fails — source left intact', () => {
    // The failure this SD exists to prevent, in its post-fix form: a locked child makes the
    // parent rename throw EPERM. The old code would fall back to copy-then-delete, and
    // safeRecursiveCp silently skips children it cannot stat — a truncated archive reporting
    // success, then the source deleted. Rename-only means the only honest answer is REFUSAL.
    const orphan = mkLeftover('orphan-locked');
    linkNodeModules(orphan);
    const boom = () => { const e = new Error('EPERM: operation not permitted'); e.code = 'EPERM'; throw e; };

    const r = defaultRemoveOrphan(orphan, root, { renameImpl: boom });

    expect(r.ok).toBe(false);
    expect(r.method).toBe('refused');
    expect(fs.existsSync(path.join(orphan, 'file.txt'))).toBe(true); // source intact, still inspectable
    expect(fs.existsSync(canary)).toBe(true);
    // And no partial destination left behind for someone to mistake for a complete archive.
    const archiveRoot = path.join(worktreesDir, '_archive');
    const leftovers = fs.existsSync(archiveRoot)
      ? fs.readdirSync(archiveRoot).filter((d) => d.startsWith('orphan-locked-'))
      : [];
    expect(leftovers).toHaveLength(0);
  });

  it('REFUSES when the archive destination already exists — never overwrites a prior preserve', () => {
    // Found by a surviving mutant: removing the collision guard changed nothing observable, which
    // meant the guard was untested. It matters because FR-1 makes _archive the SOLE custodian of
    // everything the sweep preserves — silently landing on an existing entry would destroy an
    // earlier preserved tree, which is this SD's own failure mode relocated one directory over.
    // The Stage-1/2 archiver has no such check; millisecond stamps make a clash rare, not absent.
    const orphan = mkLeftover('orphan-clash');
    const fixedNow = Date.parse('2026-08-03T00:00:00.000Z');
    const stamp = new Date(fixedNow).toISOString().replace(/[:.]/g, '-');
    const archiveRoot = path.join(worktreesDir, '_archive');
    fs.mkdirSync(path.join(archiveRoot, `orphan-clash-${stamp}`), { recursive: true });
    fs.writeFileSync(path.join(archiveRoot, `orphan-clash-${stamp}`, 'PRIOR.txt'), 'earlier-preserve');

    const r = defaultRemoveOrphan(orphan, root, { now: fixedNow });

    expect(r.ok).toBe(false);
    expect(r.method).toBe('refused');
    expect(String(r.error)).toMatch(/already exists/);
    // The earlier preserve is untouched and the source is still there to retry.
    expect(fs.readFileSync(path.join(archiveRoot, `orphan-clash-${stamp}`, 'PRIOR.txt'), 'utf8')).toBe('earlier-preserve');
    expect(fs.existsSync(path.join(orphan, 'file.txt'))).toBe(true);
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

describe('classifyOrphanDirs live-owner guard — cross-module casing (review HIGH)', () => {
  it('excludes a live-owned orphan even when liveOwners was lowercased by a different normalizePath', () => {
    const live = mkLeftover('Live-Orphan-MixedCase'); // no .git, would otherwise be reapable
    const now = Date.now();
    const old = new Date(now - 2 * 60 * 60 * 1000);
    fs.utimesSync(live, old, old);
    // Simulate the producer (worktree-reapability.js::normalizePath) which LOWERCASES on all platforms.
    const lowered = path.resolve(live).replace(/\\/g, '/').toLowerCase();
    const res = classifyOrphanDirs(worktreesDir, [], { liveOwners: new Set([lowered]), minAgeMs: 30 * 60 * 1000, now });
    expect(res.reapableDirs.find((r) => r.dir === 'Live-Orphan-MixedCase')).toBeUndefined();
    expect(res.excluded.find((e) => e.dir === 'Live-Orphan-MixedCase')?.reason).toBe('live_owner');
  });
});

describe('resolveMinAgeMs', () => {
  it('defaults when unset and parses a valid override', () => {
    expect(resolveMinAgeMs({})).toBe(DEFAULT_ORPHAN_MIN_AGE_MS);
    expect(resolveMinAgeMs({ WORKTREE_ORPHAN_MIN_AGE_MS: '60000' })).toBe(60000);
    expect(resolveMinAgeMs({ WORKTREE_ORPHAN_MIN_AGE_MS: 'garbage' })).toBe(DEFAULT_ORPHAN_MIN_AGE_MS);
  });
});
