#!/usr/bin/env node
/**
 * Safe worktree removal entrypoint — SD-FDBK-ENH-GIT-WORKTREE-REMOVE-001.
 *
 * Routes MANUAL/AGENT worktree teardown through lib/worktree-manager.js
 * removeWorktreeViaGit, which pre-unlinks a worktree's node_modules
 * symlink/junction (via fs.lstat().isSymbolicLink()) BEFORE `git worktree
 * remove`. This is the safe alternative to a raw `git worktree remove --force`
 * or `rm -rf <worktree>` — both of which follow the node_modules junction and
 * GUT the main repo's shared node_modules (0 packages -> ERR_MODULE_NOT_FOUND
 * @supabase/supabase-js from lib/supabase-client.js), breaking node tooling for
 * every session sharing the main repo.
 *
 * Usage:
 *   npm run worktree:remove <SD-KEY>            # resolve via git worktree list
 *   npm run worktree:remove <path/to/worktree>  # explicit path
 *   npm run worktree:remove <SD-KEY> --force     # remove even if live/dirty
 *
 * Default is GUARDED (isReapable): a worktree owned by a live session OR holding
 * uncommitted/unpushed work is SKIPPED, not removed. --force overrides the guard
 * but STILL pre-unlinks node_modules — the gut-prevention is unconditional.
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { removeWorktreeViaGit, getRepoRoot } from '../lib/worktree-manager.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

const WORKTREES_DIR = '.worktrees';

function listWorktrees(repoRoot) {
  try {
    const out = execSync('git worktree list --porcelain', { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' });
    const entries = [];
    let cur = {};
    for (const line of out.split('\n')) {
      if (line.startsWith('worktree ')) { if (cur.path) entries.push(cur); cur = { path: line.slice(9).trim() }; }
      else if (line.startsWith('branch ')) cur.branch = line.slice(7).trim().replace('refs/heads/', '');
    }
    if (cur.path) entries.push(cur);
    return entries;
  } catch { return []; }
}

/** Resolve an SD-KEY or explicit path to an absolute worktree path. */
export function resolveWorktreePath(arg, repoRoot) {
  if (arg.includes('/') || arg.includes('\\') || fs.existsSync(arg)) return path.resolve(arg);
  const norm = (p) => path.resolve(p).replace(/\\/g, '/');
  const wts = listWorktrees(repoRoot);
  const byBranch = wts.find((w) => w.branch === `feat/${arg}`);
  if (byBranch) return norm(byBranch.path);
  const byBase = wts.find((w) => path.basename(norm(w.path)) === arg);
  if (byBase) return norm(byBase.path);
  return path.join(repoRoot, WORKTREES_DIR, arg); // conventional fallback
}

function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force') || args.includes('-f');
  const target = args.find((a) => !a.startsWith('-'));
  if (!target) {
    console.error('Usage: npm run worktree:remove <SD-KEY | path> [--force]');
    process.exit(2);
  }
  const repoRoot = getRepoRoot();
  const wtPath = resolveWorktreePath(target, repoRoot);

  if (path.resolve(wtPath) === path.resolve(repoRoot)) {
    console.error(`Refusing to remove the main repo root: ${wtPath}`);
    process.exit(2);
  }

  // removeWorktreeViaGit pre-unlinks node_modules FIRST, then `git worktree
  // remove --force`. guard:!force skips a live/dirty worktree (protective).
  const res = removeWorktreeViaGit(wtPath, repoRoot, {
    guard: !force,
    allowFail: true,
    logger: (m) => console.warn(m),
  });

  if (res.ok) {
    console.log(`✓ Safely removed worktree (node_modules pre-unlinked): ${wtPath}`);
    process.exit(0);
  }
  if (res.skipped) {
    console.warn(`⏭️  Skipped (${res.reason}) — owned by a live session or has uncommitted/unpushed work.`);
    console.warn('   Re-run with --force to remove anyway (node_modules is still pre-unlinked).');
    process.exit(0);
  }

  // git worktree remove failed (e.g. orphan / unregistered path). The junction
  // was already pre-unlinked above, so a recursive remove can no longer follow
  // it into the shared store. Defensive: re-check node_modules isn't still a link.
  try { execSync('git worktree prune', { cwd: repoRoot, stdio: 'pipe' }); } catch { /* best-effort */ }
  if (fs.existsSync(wtPath)) {
    const nm = path.join(wtPath, 'node_modules');
    try {
      if (fs.lstatSync(nm).isSymbolicLink()) {
        try { fs.unlinkSync(nm); } catch { try { fs.rmdirSync(nm); } catch { /* noop */ } }
      }
    } catch { /* no node_modules / not a link */ }
    try {
      fs.rmSync(wtPath, { recursive: true, force: true });
      console.log(`✓ Removed orphan worktree dir (node_modules pre-unlinked + pruned): ${wtPath}`);
      process.exit(0);
    } catch (e) {
      console.error(`✗ Failed to remove ${wtPath}: ${e.message}`);
      process.exit(1);
    }
  }
  console.error(`✗ git worktree remove failed: ${res.error}`);
  process.exit(1);
}

// Only run when invoked directly (keep resolveWorktreePath importable for tests).
if (isMainModule(import.meta.url)) {
  main();
}
