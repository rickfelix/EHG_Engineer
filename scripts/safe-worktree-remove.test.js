/**
 * Real-fs regression test for SD-FDBK-ENH-GIT-WORKTREE-REMOVE-001.
 *
 * Proves the safe removal path (lib/worktree-manager.js removeWorktreeViaGit,
 * which scripts/safe-worktree-remove.mjs wraps) does NOT gut a shared
 * node_modules store reached via a worktree node_modules junction — and that a
 * raw `git worktree remove --force` (the retired guidance) DOES gut it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { removeWorktreeViaGit } from '../lib/worktree-manager.js';
import { resolveWorktreePath } from './safe-worktree-remove.mjs';

const isWin = process.platform === 'win32';
const git = (cmd, cwd) => execSync(`git ${cmd}`, { cwd, stdio: 'pipe' });

function makeSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'swt-'));
  // decoy "main repo" shared node_modules store with a CANARY
  const sharedStore = path.join(root, 'shared_store');
  fs.mkdirSync(path.join(sharedStore, '@supabase', 'supabase-js'), { recursive: true });
  const canary = path.join(sharedStore, '@supabase', 'supabase-js', 'CANARY.txt');
  fs.writeFileSync(canary, 'do-not-delete');
  // a real git repo to host worktrees
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo, { recursive: true });
  git('init -q', repo);
  git('config user.email t@t.t', repo);
  git('config user.name t', repo);
  git('config commit.gpgsign false', repo);
  fs.writeFileSync(path.join(repo, 'README.md'), '# t');
  git('add -A', repo);
  git('commit -q -m init', repo);
  return { root, repo, sharedStore, canary };
}

function addWorktreeWithJunctionNM(repo, sharedStore, name) {
  const wt = path.join(repo, '.worktrees', name);
  fs.mkdirSync(path.dirname(wt), { recursive: true });
  git(`worktree add -q --detach "${wt}"`, repo);
  // link the worktree's node_modules to the shared store (junction on win32)
  fs.symlinkSync(sharedStore, path.join(wt, 'node_modules'), isWin ? 'junction' : 'dir');
  return wt;
}

describe('safe-worktree-remove (SD-FDBK-ENH-GIT-WORKTREE-REMOVE-001)', () => {
  let sb;
  beforeEach(() => { sb = makeSandbox(); });
  afterEach(() => {
    // Defensive: unlink any leftover node_modules junctions before recursive rm
    // so teardown can never follow a link.
    try {
      const wtDir = path.join(sb.repo, '.worktrees');
      for (const name of (fs.existsSync(wtDir) ? fs.readdirSync(wtDir) : [])) {
        const nm = path.join(wtDir, name, 'node_modules');
        try { if (fs.lstatSync(nm).isSymbolicLink()) fs.unlinkSync(nm); } catch { /* noop */ }
      }
    } catch { /* noop */ }
    try { fs.rmSync(sb.root, { recursive: true, force: true }); } catch { /* noop */ }
  });

  it('removeWorktreeViaGit pre-unlinks the node_modules junction — shared store CANARY survives', () => {
    const wt = addWorktreeWithJunctionNM(sb.repo, sb.sharedStore, 'SD-A');
    // The junction is a LIVE passthrough: reading the CANARY through the worktree
    // path resolves into the shared store — so a follow-through delete WOULD gut it.
    const through = path.join(wt, 'node_modules', '@supabase', 'supabase-js', 'CANARY.txt');
    expect(fs.readFileSync(through, 'utf8')).toBe('do-not-delete');
    expect(fs.lstatSync(path.join(wt, 'node_modules')).isSymbolicLink()).toBe(true);

    const res = removeWorktreeViaGit(wt, sb.repo, { allowFail: true });

    expect(res.ok).toBe(true);
    expect(fs.existsSync(wt)).toBe(false);                          // worktree removed
    expect(fs.existsSync(sb.canary)).toBe(true);                   // shared store NOT gutted
    expect(fs.readFileSync(sb.canary, 'utf8')).toBe('do-not-delete');
  });

  it('isolated real-dir node_modules is removed with the worktree (no over-reach on unrelated stores)', () => {
    const wt = path.join(sb.repo, '.worktrees', 'SD-B');
    fs.mkdirSync(path.dirname(wt), { recursive: true });
    git(`worktree add -q --detach "${wt}"`, sb.repo);
    fs.mkdirSync(path.join(wt, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(wt, 'node_modules', 'own.txt'), 'x');
    expect(fs.lstatSync(path.join(wt, 'node_modules')).isSymbolicLink()).toBe(false);

    const res = removeWorktreeViaGit(wt, sb.repo, { allowFail: true });

    expect(res.ok).toBe(true);
    expect(fs.existsSync(wt)).toBe(false);
    expect(fs.existsSync(sb.canary)).toBe(true);                  // unrelated shared store intact
  });

  it.runIf(isWin)('NEGATIVE CONTROL: raw `git worktree remove --force` (no pre-unlink) GUTS the shared store', () => {
    const wt = addWorktreeWithJunctionNM(sb.repo, sb.sharedStore, 'SD-C');
    // The retired guidance: git follows the node_modules junction into the shared store.
    execSync(`git worktree remove --force "${wt}"`, { cwd: sb.repo, stdio: 'pipe' });
    expect(fs.existsSync(sb.canary)).toBe(false);                 // gutted through the junction
  });

  it('resolveWorktreePath resolves an SD-KEY to its worktree via git worktree list', () => {
    const wt = addWorktreeWithJunctionNM(sb.repo, sb.sharedStore, 'SD-D');
    const resolved = resolveWorktreePath('SD-D', sb.repo);
    expect(path.resolve(resolved)).toBe(path.resolve(wt));
  });
});
