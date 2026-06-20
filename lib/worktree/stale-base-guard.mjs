/**
 * Worktree stale-base guard — SD-LEO-INFRA-SD-START-STALE-BASE-WARN-001.
 *
 * When sd-start.js attaches/creates a worktree whose base is BEHIND origin/main, the worker builds
 * on a stale base. A later merge-as-is can REVERT sibling changes (especially file deletions) that
 * landed on main after the base commit — a real regression risk in a fleet that merges PRs
 * continuously (confirmed hit twice in one session: PROACTIVE-POPULATOR + DISTILL).
 *
 * This module is the durable guard: on worktree resolution, detect the behind-count vs origin/main
 * and either WARN (default — loud, with the safe remedy) or AUTO-REBASE (opt-in, only when the tree
 * is clean). It REUSES lib/governance/checkout-freshness.js (the existing fail-open behind-count +
 * protocol-drift SSOT) rather than re-deriving a rev-list, and it is itself FAIL-OPEN: any git error
 * degrades to a skip so the guard can NEVER block a claim/startup.
 *
 * @module lib/worktree/stale-base-guard
 */

import { execFileSync } from 'node:child_process';
import { checkoutFreshness } from '../governance/checkout-freshness.js';

/**
 * PURE decision: given the behind-count, tree cleanliness, and whether auto-rebase is opted in,
 * decide what to do. No IO.
 *   behind <= 0                         -> 'none'
 *   behind > 0 && autoRebase && clean   -> 'rebase'   (safe: reset --hard preserves untracked)
 *   behind > 0 && autoRebase && !clean  -> 'warn'     (refuse to rebase a dirty tree — never clobber WIP)
 *   behind > 0 && !autoRebase           -> 'warn'
 * @returns {{action:'none'|'warn'|'rebase', reason:string}}
 */
export function decideStaleBaseAction({ behind = 0, treeClean = true, autoRebase = false } = {}) {
  const n = Number.isFinite(Number(behind)) ? Math.max(0, Number(behind)) : 0;
  if (n === 0) return { action: 'none', reason: 'base up to date with origin/main' };
  if (autoRebase && treeClean) return { action: 'rebase', reason: `auto-rebase: clean tree, behind by ${n}` };
  if (autoRebase && !treeClean) return { action: 'warn', reason: `auto-rebase requested but tree is dirty (behind by ${n}) — refusing to clobber WIP` };
  return { action: 'warn', reason: `behind by ${n}; warn-by-default (pass --rebase-base / SD_START_AUTO_REBASE=1 to auto-rebase)` };
}

/** PURE: the loud warning text. Names the behind-count, any protocol drift, and the safe remedy. */
export function renderStaleBaseWarning({ behind, baseRef = 'origin/main', criticalDiff = [], dirty = false } = {}) {
  const lines = [];
  lines.push(`⚠️  STALE WORKTREE BASE — this worktree is behind ${baseRef} by ${behind} commit(s).`);
  lines.push(`    Building on a stale base risks a merge-as-is REVERTING sibling work (esp. file deletions) that landed on ${baseRef} after your base commit.`);
  if (criticalDiff && criticalDiff.length) {
    lines.push(`    🛑 Protocol file(s) also drifted vs base: ${criticalDiff.join(', ')} — you may be operating on stale rules.`);
  }
  if (dirty) {
    lines.push(`    Safe remedy (tree has changes): commit/stash first, then  git merge origin/main  (or  git rebase origin/main).`);
  } else {
    lines.push(`    Safe remedy (clean tree):  git reset --hard origin/main   (preserves untracked NEW files)  —  or  git merge origin/main.`);
  }
  lines.push(`    Opt-in auto-rebase next time: pass --rebase-base to sd-start, or set SD_START_AUTO_REBASE=1.`);
  return lines.join('\n');
}

/** Default IO seam: tree-clean probe + hard-reset, both scoped to the worktree root. */
export function makeGuardGit({ cwd, remote = 'origin', timeout = 15000 } = {}) {
  const git = (args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout });
  return {
    isClean: () => git(['status', '--porcelain']).trim().length === 0,
    // reset --hard to the remote tip; untracked NEW files are preserved (reset only touches tracked).
    resetHard: (baseRef) => { git(['reset', '--hard', baseRef]); },
  };
}

/**
 * Orchestrate the guard for a resolved worktree. FAIL-OPEN: any error returns {skipped:true} and is
 * never re-thrown. Emits via the injected `log`/`warn` (default console).
 *
 * @param {object} opts
 *   cwd          - the worktree root (absolute). REQUIRED.
 *   baseRef      - default 'origin/main'
 *   autoRebase   - opt-in auto-rebase (default false => warn-by-default)
 *   freshnessFn  - injected checkoutFreshness (default the real one, with fetch:true)
 *   git          - injected {isClean, resetHard} (default makeGuardGit)
 *   log/warn     - injected loggers (default console.log/console.warn)
 * @returns {{action:string, behind:number, skipped?:boolean, rebased?:boolean, error?:string}}
 */
export function runStaleBaseGuard(opts = {}) {
  const {
    cwd,
    baseRef = 'origin/main',
    autoRebase = false,
    freshnessFn = (c) => checkoutFreshness(c, { baseRef, fetch: true, role: 'sd-start' }),
    git = null,
    log = console.log,
    warn = console.warn,
  } = opts;
  try {
    if (!cwd) return { action: 'none', behind: 0, skipped: true, error: 'no cwd' };
    const fr = freshnessFn(cwd);
    const behind = Number(fr?.behind) || 0;
    const criticalDiff = Array.isArray(fr?.criticalDiff) ? fr.criticalDiff : [];
    if (behind === 0) {
      // Still surface protocol drift even at behind=0 (a local hand-edit of CLAUDE*.md).
      if (criticalDiff.length) warn(renderStaleBaseWarning({ behind: 0, baseRef, criticalDiff }));
      return { action: 'none', behind: 0 };
    }
    const g = git || makeGuardGit({ cwd });
    let treeClean = true;
    try { treeClean = g.isClean(); } catch { treeClean = false; /* unknown => treat dirty (safe: never auto-clobber) */ }
    const decision = decideStaleBaseAction({ behind, treeClean, autoRebase });
    if (decision.action === 'rebase') {
      try {
        g.resetHard(baseRef);
        log(`✅ STALE WORKTREE BASE auto-rebased to ${baseRef} (was behind ${behind}; clean tree, untracked files preserved).`);
        return { action: 'rebase', behind, rebased: true };
      } catch (err) {
        // Rebase failed — fall back to a loud warn rather than leaving the worker unaware.
        warn(renderStaleBaseWarning({ behind, baseRef, criticalDiff, dirty: !treeClean }));
        warn(`    (auto-rebase attempted but failed: ${err?.message || String(err)} — apply the remedy manually)`);
        return { action: 'warn', behind, rebased: false, error: err?.message || String(err) };
      }
    }
    warn(renderStaleBaseWarning({ behind, baseRef, criticalDiff, dirty: !treeClean }));
    return { action: 'warn', behind };
  } catch (err) {
    // FAIL-OPEN: the guard must never block a claim.
    return { action: 'none', behind: 0, skipped: true, error: err?.message || String(err) };
  }
}

export default { decideStaleBaseAction, renderStaleBaseWarning, makeGuardGit, runStaleBaseGuard };
