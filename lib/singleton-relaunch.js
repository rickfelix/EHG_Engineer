/**
 * singleton-relaunch.js — SD-LEO-INFRA-COORDINATOR-ORCHESTRATED-SINGLETON-REFRESH-001-B (FR-3)
 *
 * Role-agnostic fresh-checkout relaunch mechanism for a long-lived singleton (Adam, Solomon,
 * coordinator). Composes EXISTING infra rather than reimplementing it:
 *   - lib/worktree-manager.js createWorkTypeWorktree: fetches origin/main fail-closed, refuses
 *     drifted-branch reuse, guards node_modules junction removal.
 *   - lib/governance/checkout-freshness.js checkoutFreshness: post-boot freshness canary.
 *
 * SCOPE BOUNDARY: this function produces a live, fresh-checkout worktree and verifies its
 * freshness. It does NOT perform session registration, retirement of the old session, or
 * worktree removal — those are owned by sibling children A (trigger/scheduler) and C
 * (sequenced re-register/retire + guarded worktree removal). Never call adam-register.cjs /
 * removeWorktree / cleanupWorktree from here.
 */
import { createWorkTypeWorktree } from './worktree-manager.js';
import { checkoutFreshness, VERDICT } from './governance/checkout-freshness.js';

/**
 * Relaunch a singleton role onto a brand-new worktree checked out from origin/main.
 * NEVER performs an in-place `git pull`/`git reset` on the caller's own working tree.
 *
 * @param {{role: string, workKey: string, repoRoot?: string, deps?: object}} opts
 *   deps: INJECTABLE seam for tests only — { createWorkTypeWorktree, checkoutFreshness, VERDICT }.
 *   Defaults to the real imports; production callers never pass this.
 * @returns {{worktreePath: string, branch: string, freshness: object}}
 * @throws if the worktree could not be created on a fresh checkout, or if the new checkout is
 *   STALE-CRITICAL (a protocol file drifted — should be unreachable for a just-created worktree,
 *   but checked defensively rather than trusted blind).
 */
export function relaunchOntoFreshCheckout({ role, workKey, repoRoot, deps } = {}) {
  if (!role || typeof role !== 'string') throw new Error('relaunchOntoFreshCheckout: role is required');
  if (!workKey || typeof workKey !== 'string') throw new Error('relaunchOntoFreshCheckout: workKey is required');

  const createWt = (deps && deps.createWorkTypeWorktree) || createWorkTypeWorktree;
  const checkFreshness = (deps && deps.checkoutFreshness) || checkoutFreshness;
  const verdicts = (deps && deps.VERDICT) || VERDICT;

  const result = createWt({
    workType: 'ADHOC',
    workKey: `singleton-${role}-${workKey}`,
    repoRoot,
  });

  if (result.mode !== 'worktree' || !result.created) {
    throw new Error(`relaunchOntoFreshCheckout: did not get a fresh worktree for role=${role} (mode=${result.mode}, reason=${result.reason || 'reused-existing'})`);
  }

  const freshness = checkFreshness(result.path, { baseRef: 'origin/main' });
  if (freshness.verdict === verdicts.STALE_CRITICAL) {
    throw new Error(`relaunchOntoFreshCheckout: new checkout for role=${role} is STALE-CRITICAL (${freshness.reason})`);
  }

  return { worktreePath: result.path, branch: result.branch, freshness };
}
