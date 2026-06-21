/**
 * Shared-store wipe prevention — SD-LEO-FEAT-STORE-WIPE-SAME-001.
 *
 * The shared node_modules store was wiped twice in 75 min by the worktree reaper:
 * preUnlinkWorktreeNodeModules only unlinked node_modules when the TOP-LEVEL path was a
 * symlink/junction. Once a worker ran npm install, node_modules became a REAL directory holding a
 * NESTED junction into the shared store; the top-level check no-op'd, so `git worktree remove
 * --force` (and any recursive delete) followed the nested junction and wiped the shared store.
 *
 * These tests prove the fix DELETER-AGNOSTICALLY: after preUnlinkWorktreeNodeModules, the nested
 * junction is UNLINKED (so neither `git worktree remove --force` — which DOES follow junctions —
 * nor any recursive delete can reach the store), while the sentinel shared store stays INTACT. We
 * assert the link is gone rather than relying on a specific deleter, because Node's own fs.rmSync
 * does NOT follow junctions (only git's native remove does) — so "link unlinked" is the faithful
 * regression signal (it FAILS pre-fix, where the top-level-only check no-op'd on a real dir).
 * Covers the nested-junction layout (the bug) and the top-level-junction layout (no regression).
 * Junctions on Windows; dir symlinks elsewhere (Node maps the 'junction' type to a symlink on POSIX).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { preUnlinkWorktreeNodeModules } from '../../lib/worktree-manager.js';

let tmp, store, sentinel, wt;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'store-wipe-'));
  // The SHARED store that must survive — with a sentinel file inside it.
  store = path.join(tmp, 'shared-store');
  fs.mkdirSync(store, { recursive: true });
  sentinel = path.join(store, 'SENTINEL.txt');
  fs.writeFileSync(sentinel, 'do-not-delete');
  wt = path.join(tmp, 'worktree');
  fs.mkdirSync(wt, { recursive: true });
});

afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
});

function link(target, linkPath) {
  fs.symlinkSync(target, linkPath, 'junction'); // 'junction' on win32; symlink elsewhere
}

describe('preUnlinkWorktreeNodeModules — shared-store survives worktree deletion (SD-LEO-FEAT-STORE-WIPE-SAME-001)', () => {
  it('NESTED junction inside a REAL node_modules: sentinel store survives the recursive delete', () => {
    const nm = path.join(wt, 'node_modules');
    fs.mkdirSync(nm, { recursive: true });                 // REAL directory (worker ran npm install)
    fs.writeFileSync(path.join(nm, 'package.json'), '{}'); // some real content
    const nestedLink = path.join(nm, '.shared');
    link(store, nestedLink);                                // NESTED junction into the shared store

    preUnlinkWorktreeNodeModules(wt);

    // FAITHFUL regression signal: the nested junction is UNLINKED (pre-fix it was left in place,
    // so git's native remove would follow it into the store). lstat throws once it's gone.
    expect(() => fs.lstatSync(nestedLink)).toThrow();
    // Stand-in cleanup delete of the worktree — store must remain regardless of deleter.
    fs.rmSync(wt, { recursive: true, force: true });
    expect(fs.existsSync(sentinel)).toBe(true);  // shared store SURVIVES
    expect(fs.existsSync(store)).toBe(true);
  });

  it('TOP-LEVEL node_modules junction: sentinel store survives (no regression)', () => {
    link(store, path.join(wt, 'node_modules'));            // node_modules IS a junction into the store

    preUnlinkWorktreeNodeModules(wt);
    fs.rmSync(wt, { recursive: true, force: true });

    expect(fs.existsSync(sentinel)).toBe(true);
    expect(fs.existsSync(store)).toBe(true);
  });

  it('deeply nested junction (node_modules/dep/node_modules/.bin -> store) also survives', () => {
    const deep = path.join(wt, 'node_modules', 'dep', 'node_modules');
    fs.mkdirSync(deep, { recursive: true });
    const deepLink = path.join(deep, '.bin');
    link(store, deepLink);

    preUnlinkWorktreeNodeModules(wt);
    expect(() => fs.lstatSync(deepLink)).toThrow(); // deeply-nested junction unlinked
    fs.rmSync(wt, { recursive: true, force: true });

    expect(fs.existsSync(sentinel)).toBe(true);
  });

  it('clean worktree (no node_modules) is a no-op and removes normally', () => {
    fs.writeFileSync(path.join(wt, 'file.txt'), 'x');
    expect(() => preUnlinkWorktreeNodeModules(wt)).not.toThrow();
    fs.rmSync(wt, { recursive: true, force: true });
    expect(fs.existsSync(wt)).toBe(false);
    expect(fs.existsSync(sentinel)).toBe(true);
  });
});
