'use strict';
/**
 * npm ci shared-store wipe guard — harness 95022758 / QF-20260521-389.
 *
 * `npm ci` runs `rm -rf node_modules` BEFORE installing. In this fleet every
 * worktree's node_modules is a junction to the single shared store in the main
 * repo. So `npm ci`:
 *   - through a junction  → the rm -rf follows the link and wipes the SHARED store
 *   - in the main repo root while worktrees junction to it → wipes the store
 *     those worktrees depend on, mid-flight
 * Either way it bricks every parallel session (the recurring wipe). Root cause
 * verified 2026-05-21: it is NOT worktree-removal (Node-created junctions report
 * isSymbolicLink()=true, so the removal unlink-guards fire). The culprit is
 * ad-hoc destructive `npm ci`; the fleet-safe path uses ADDITIVE `npm install`
 * under lib/npm-install-lock.cjs.
 *
 * This module is pure + fs-injectable so it can be unit-tested without touching
 * the real filesystem, and so the PreToolUse hook change stays tiny.
 */
const path = require('path');

// Matches a real `npm ci` invocation (mirrors ENFORCEMENT 12's NPM_INSTALL_RE
// boundary style). Does NOT match `npm install`, `npm i`, or `npm cite`.
const NPM_CI_RE = /(?:^|[\s;&|(])npm\s+ci(?:\s|$)/;

/**
 * @param {object}   args
 * @param {string}   args.command          - the Bash command line
 * @param {string}   [args.cwd]            - working directory the command runs in
 * @param {object}   [args.fs]             - injectable fs (lstatSync/existsSync/readdirSync)
 * @returns {{ wipes: boolean, reason: string }}
 */
function npmCiWouldWipeSharedStore({ command, cwd, fs: fsMod = require('fs') } = {}) {
  if (typeof command !== 'string' || !NPM_CI_RE.test(command) || /--help/.test(command)) {
    return { wipes: false, reason: 'not_npm_ci' };
  }
  const base = cwd || process.cwd();

  // Case 1: node_modules is a junction/symlink → rm -rf follows it into the
  // shared store. Always a wipe.
  let nmStat = null;
  try { nmStat = fsMod.lstatSync(path.join(base, 'node_modules')); } catch { /* absent */ }
  if (nmStat && nmStat.isSymbolicLink()) {
    return { wipes: true, reason: 'node_modules_is_junction' };
  }

  // Distinguish the main repo root (`.git` is a DIRECTORY) from a worktree
  // (`.git` is a FILE pointing at the gitdir).
  let gitStat = null;
  try { gitStat = fsMod.lstatSync(path.join(base, '.git')); } catch { /* not a repo root */ }

  // Case 2a: isolated worktree with a REAL node_modules → npm ci only affects
  // this tree. Safe.
  if (gitStat && gitStat.isFile()) {
    return { wipes: false, reason: 'isolated_worktree' };
  }

  // Case 2b: main repo root with active worktrees junctioning to THIS store →
  // npm ci here wipes them mid-flight.
  if (gitStat && gitStat.isDirectory()) {
    const wtDir = path.join(base, '.worktrees');
    try {
      if (fsMod.existsSync(wtDir) && fsMod.readdirSync(wtDir).length > 0) {
        return { wipes: true, reason: 'main_root_with_active_worktrees' };
      }
    } catch { /* unreadable → fall through to safe */ }
  }

  return { wipes: false, reason: 'no_shared_sharers' };
}

module.exports = { npmCiWouldWipeSharedStore, NPM_CI_RE };
