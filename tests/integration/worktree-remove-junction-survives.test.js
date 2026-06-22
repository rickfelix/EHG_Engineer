/**
 * Worktree removal — shared store survives even with junctions OUTSIDE node_modules.
 * SD-LEO-INFRA-WORKTREE-REMOVE-CHOKEPOINT-001.
 *
 * The recurring shared-store wipe: the two raw-fs.rmSync worktree-removal FALLBACKS
 * (scripts/hooks/concurrent-session-worktree.cjs:604 + scripts/safe-worktree-remove.mjs:103)
 * pre-unlinked at node_modules SCOPE only (unlinkNodeModulesJunction / a top-level lstat check).
 * A junction living OUTSIDE node_modules (a workspace link, a tooling junction, a nested
 * package's .bin) was therefore left in place, and the subsequent fs.rmSync / git-remove
 * followed it INTO the shared store and wiped it. The fix converges BOTH sinks on the canonical
 * safeRecursiveRm, which does a WHOLE-TREE _unlinkLinksRecursive before deleting. These tests
 * prove a junction ANYWHERE in the worktree tree is neutralized so the sentinel store survives.
 *
 * (Companion to tests/lib/worktree-manager-preunlink-nested-junction.test.js, which covers the
 *  INSIDE-node_modules nested-junction case for the node_modules-scoped helper.)
 * Junctions on win32; Node maps the 'junction' type to a dir symlink on POSIX.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { safeRecursiveRm } from '../../lib/worktree-manager.js';

let tmp, store, sentinel, wt;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-remove-junction-'));
  store = path.join(tmp, 'shared-store');
  fs.mkdirSync(store, { recursive: true });
  sentinel = path.join(store, 'SENTINEL.txt');
  fs.writeFileSync(sentinel, 'do-not-delete');
  wt = path.join(tmp, 'worktree');
  fs.mkdirSync(wt, { recursive: true });
});

afterEach(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ } });

function link(target, linkPath) { fs.symlinkSync(target, linkPath, 'junction'); }

describe('safeRecursiveRm — whole-tree junction-safe worktree removal (SD-LEO-INFRA-WORKTREE-REMOVE-CHOKEPOINT-001)', () => {
  it('junction OUTSIDE node_modules (the tree-scope gap the wipe exploited): store survives', () => {
    // A REAL node_modules so a node_modules-SCOPE pre-unlink would "succeed" yet MISS the outside link.
    fs.mkdirSync(path.join(wt, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(wt, 'node_modules', 'package.json'), '{}');
    link(store, path.join(wt, 'tooling-link')); // junction OUTSIDE node_modules

    safeRecursiveRm(wt, { force: true });

    expect(fs.existsSync(wt)).toBe(false);       // worktree removed
    expect(fs.existsSync(sentinel)).toBe(true);  // shared store SURVIVES (pre-fix on win32 this FAILED)
    expect(fs.existsSync(store)).toBe(true);
  });

  it('deeply nested junction outside node_modules (wt/apps/web/cfg/.shared -> store): store survives', () => {
    const deep = path.join(wt, 'apps', 'web', 'cfg');
    fs.mkdirSync(deep, { recursive: true });
    link(store, path.join(deep, '.shared'));

    safeRecursiveRm(wt, { force: true });
    expect(fs.existsSync(sentinel)).toBe(true);
  });

  it('top-level node_modules junction: store survives', () => {
    link(store, path.join(wt, 'node_modules'));
    safeRecursiveRm(wt, { force: true });
    expect(fs.existsSync(sentinel)).toBe(true);
  });

  it('clean worktree (no junctions) removes normally', () => {
    fs.writeFileSync(path.join(wt, 'file.txt'), 'x');
    safeRecursiveRm(wt, { force: true });
    expect(fs.existsSync(wt)).toBe(false);
    expect(fs.existsSync(sentinel)).toBe(true);
  });
});
