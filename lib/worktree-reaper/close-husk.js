/**
 * SD-LEO-INFRA-REAP-COMPLETED-WORKTREE-001 — close the husk path.
 *
 * A "husk" is a worktree that was deregistered from git while its DIRECTORY survived.
 * cleanupWorktree already detects it correctly (lib/worktree-manager.js:1824 re-stats the path
 * after removal and refuses to report a success it did not achieve) — it just stopped there,
 * printing "safe to delete manually". Nothing removed it, and a husk is invisible to every
 * git-based sweep, so "the scheduled reaper will get it" was not true for this shape.
 * MEASURED when this shipped: 43 directories under .worktrees against 22 registered worktrees;
 * 2 of 4 SDs completed in one session left exactly this.
 *
 * THIS FILE COMPOSES TWO EXISTING GUARANTEES AND ADDS NO THIRD. safeRecursiveRmWithRetry
 * lstat-checks for a junction before deleting and asserts the path is gone as a post-condition;
 * cwdResidencyBlocks refuses to delete a tree the current process is standing in. The residency
 * guard is composed EXPLICITLY because safeRecursiveRm does not carry it, and this is the
 * self-reap path by definition — the finishing session is the process most likely to be inside
 * the tree it is about to delete. A block is a correct refusal, never something to switch off.
 *
 * An earlier draft of this SD reimplemented the whole reap in ~200 lines before I noticed
 * cleanupWorktree already did it. That is why this is a composition and not a module.
 */
import fs from 'fs';
import { safeRecursiveRmWithRetry } from '../worktree-manager.js';
import { cwdResidencyBlocks } from './residency-guard.js';

export const HUSK_OUTCOME = Object.freeze({
  REMOVED: 'husk_removed',
  ALREADY_ABSENT: 'husk_already_absent',
  BLOCKED_RESIDENT: 'husk_blocked_resident',
  FAILED: 'husk_removal_incomplete',
});

/**
 * Remove a deregistered-but-present worktree directory.
 * NEVER THROWS — a cleanup step must not fail an otherwise-complete SD; the scheduled sweep is
 * the backstop. It never reports success it did not achieve either: the outcome is the OBSERVED
 * end state on disk, not the remover's return value. Reporting a deregistration as a removal is
 * precisely what created the husk in the first place.
 *
 * @param {{huskPath: string, deps?: object}} args
 * @returns {{outcome: string, huskPath: string, reason: string|null}}
 */
export function closeHusk({ huskPath, deps = {} }) {
  const existsSync = deps.existsSync || fs.existsSync;
  const residencyCheck = deps.cwdResidencyBlocks || cwdResidencyBlocks;
  const rmWithRetry = deps.safeRecursiveRmWithRetry || safeRecursiveRmWithRetry;
  const out = (outcome, reason = null) => ({ outcome, huskPath, reason });

  if (!huskPath || typeof huskPath !== 'string') return out(HUSK_OUTCOME.FAILED, 'no_husk_path');
  if (!existsSync(huskPath)) return out(HUSK_OUTCOME.ALREADY_ABSENT);

  const residency = residencyCheck(huskPath);
  if (residency?.blocked) return out(HUSK_OUTCOME.BLOCKED_RESIDENT, residency.reason || 'resident');

  let rm;
  try {
    rm = rmWithRetry(huskPath);
  } catch (e) {
    return out(HUSK_OUTCOME.FAILED, e?.message || String(e));
  }
  // Observed end state, not the return value.
  if (existsSync(huskPath)) return out(HUSK_OUTCOME.FAILED, rm?.lastError || 'directory_still_present');
  return out(HUSK_OUTCOME.REMOVED);
}

export default { closeHusk, HUSK_OUTCOME };
