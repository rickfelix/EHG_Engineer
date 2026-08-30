/**
 * Post-provision worktree index integrity check — QF-20260830-380.
 *
 * SPECIMEN 2026-08-30 (Hotel-2 b94295c8): a git command run with a short Bash timeout, killed
 * mid-write immediately after sd-start.js provisioned a fresh worktree, left a stale index.lock
 * plus a partial index showing every tracked file as staged-deleted. sd-start.js returns before
 * confirming the freshly-created index is actually intact; a killed write in that race window
 * corrupts it silently. This module is the detector: run `git status --porcelain` right after
 * worktree resolution and flag the mass-deletion anomaly the specimen exhibited.
 *
 * DOCTRINE (satisfies scope item (c)): after a git command times out in a fresh worktree, run
 * this check before trusting the tree — the WORKTREE_INDEX_CORRUPT message below names the
 * guarded recovery command rather than leaving the worker to reset --hard from memory.
 *
 * @module lib/worktree/post-provision-integrity-check
 */

import { makeHardenedGitRunner } from '../git/hardened-runner.cjs';

/**
 * PURE decision: given the parsed porcelain lines, decide whether this is the mass-deletion
 * anomaly (every tracked entry showing staged-deleted) rather than an ordinary in-progress diff.
 * @returns {{corrupt:boolean, deletedCount:number, totalLines:number, reason:string|null}}
 */
export function assessIndexIntegrity(lines, { threshold = 20 } = {}) {
  const entries = (lines || []).filter(Boolean);
  const deleted = entries.filter((l) => l[0] === 'D' || l[1] === 'D');
  const corrupt = entries.length >= threshold && deleted.length === entries.length;
  return {
    corrupt,
    deletedCount: deleted.length,
    totalLines: entries.length,
    reason: corrupt
      ? `mass-deletion anomaly: all ${deleted.length} tracked entries show staged-deleted`
      : null,
  };
}

/** Bracket-tokenized message naming the guarded recovery command — printed by sd-start.js. */
export function renderIndexCorruptMessage(cwd, assessment) {
  return [
    `[WORKTREE_INDEX_CORRUPT] ${assessment.reason} in ${cwd}`,
    '  A git command likely timed out mid-write right after provisioning (QF-20260830-380).',
    `  Recovery (refuses unless safe): node scripts/recover-worktree-index.mjs --cwd "${cwd}"`,
  ].join('\n');
}

/**
 * Orchestrate the check for a resolved worktree. FAIL-OPEN: any git error is reported as
 * `skipped`, never thrown — an integrity check must never block sd-start itself.
 * @param {object} opts cwd (required), threshold, git (injected runner, default hardened)
 */
export function checkWorktreeIndexIntegrity({ cwd, threshold = 20, git = null } = {}) {
  try {
    if (!cwd) return { corrupt: false, skipped: true, error: 'no cwd' };
    const run = git || makeHardenedGitRunner(cwd, { timeout: 15000 });
    const porcelain = run(['status', '--porcelain']);
    const lines = String(porcelain).split('\n');
    return assessIndexIntegrity(lines, { threshold });
  } catch (err) {
    return { corrupt: false, skipped: true, error: err?.message || String(err) };
  }
}

export default { assessIndexIntegrity, renderIndexCorruptMessage, checkWorktreeIndexIntegrity };
