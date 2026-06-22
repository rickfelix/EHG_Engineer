#!/usr/bin/env node
/**
 * safe-rm-tree.mjs — thin CLI over the fleet's CANONICAL junction-safe recursive delete.
 *
 * Delegates to `safeRecursiveRmWithRetry` (lib/worktree-manager.js): it unlinks every
 * nested symlink/junction in the tree BEFORE `fs.rmSync`, so a `node_modules` junction
 * can never be followed into the shared store. Used by Prune-WorktreeArchive.ps1 so the
 * `_archive` pruner, the reaper, and the worktree-removal fallbacks all converge on ONE
 * validated routine (coordinator request, 2026-06-22).
 *
 * The import chain (worktree-manager -> worktree-quota/-reapability/-provision) is
 * node_modules-FREE (node: builtins + local libs only), so this wrapper keeps working
 * even when the shared node_modules has been wiped — the same robustness the prior
 * pure-PowerShell `rd /s /q` had.
 *
 * Usage: node safe-rm-tree.mjs <absolute-path>
 * Exit:  0 = path is gone; 1 = removal failed; 2 = bad usage.
 */
import { safeRecursiveRmWithRetry } from '../../lib/worktree-manager.js';

const target = process.argv[2];
if (!target) {
  console.error('usage: safe-rm-tree.mjs <path>');
  process.exit(2);
}

const res = safeRecursiveRmWithRetry(target, { force: true });
if (res.ok) {
  process.exit(0);
}
console.error(`safe-rm-tree: failed to remove ${target} — ${res.lastError} (attempts=${res.attempts})`);
process.exit(1);
