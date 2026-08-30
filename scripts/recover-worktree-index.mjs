#!/usr/bin/env node
/**
 * Guarded recovery for a post-provision worktree index corruption — QF-20260830-380.
 *
 * Refuses `git reset --hard` unless it can confirm HEAD is reachable from origin/<branch> — the
 * same check Hotel-2 (b94295c8) did by hand before clearing a stale index.lock and resetting.
 * A HEAD not yet pushed anywhere would lose real work on reset; refusing that case is the whole
 * point of a GUARDED recovery instead of a bare `git reset --hard HEAD`.
 */
import { pathToFileURL } from 'node:url';
import { makeHardenedGitRunner } from '../lib/git/hardened-runner.cjs';
// Reuse the SAME "is a lock live or orphaned" heuristic already established for the shared
// checkout (SD-REFILL-00KUKQVS) instead of re-deriving a second, private notion of "no live git
// process" here — single-representation-sufficiency.
import { clearStaleGitIndexLock } from '../lib/git/clear-stale-index-lock.mjs';

/** PURE-ish: git calls only, no mutation. Confirms HEAD exists on some remote-tracking ref. */
export function assessRecoverySafety(cwd, { git = null } = {}) {
  const run = git || makeHardenedGitRunner(cwd, { timeout: 15000 });
  let headSha = null;
  let headOnRemote = false;
  try {
    headSha = run(['rev-parse', 'HEAD']).trim();
    // Reachable from ANY remote-tracking branch — covers both a pushed feature branch and a
    // worktree whose upstream isn't configured yet, matching Hotel-2's manual "HEAD on a pushed
    // remote ref" check without requiring an --set-upstream to have already happened.
    const remoteBranches = run(['branch', '-r', '--contains', headSha]).trim();
    headOnRemote = remoteBranches.length > 0;
  } catch {
    headOnRemote = false;
  }
  return {
    safe: headOnRemote,
    headSha,
    headOnRemote,
    reason: headOnRemote ? null : 'HEAD is not confirmed reachable from its upstream — refusing reset (would risk unpushed work)',
  };
}

/**
 * Clears a CONFIRMED-STALE index.lock (via clearStaleGitIndexLock — never a fresh/active one)
 * and hard-resets to HEAD. Throws (never silently no-ops) if push-state safety can't be confirmed.
 */
export function recoverWorktreeIndex(cwd, { git = null, force = false, lockClear = null } = {}) {
  const run = git || makeHardenedGitRunner(cwd, { timeout: 15000 });
  const assessment = assessRecoverySafety(cwd, { git: run });
  if (!assessment.safe && !force) {
    throw new Error(`RECOVERY_REFUSED: ${assessment.reason}`);
  }
  const lockResult = (lockClear || clearStaleGitIndexLock)({ repoRoot: cwd });
  if (lockResult.reason === 'fresh_active' && !force) {
    throw new Error('RECOVERY_REFUSED: index.lock is fresh and non-empty — a git process may still be writing it');
  }
  run(['reset', '--hard', 'HEAD']);
  return { recovered: true, lockResult, ...assessment };
}

async function main() {
  const args = process.argv.slice(2);
  const cwdIdx = args.indexOf('--cwd');
  const cwd = cwdIdx >= 0 ? args[cwdIdx + 1] : process.cwd();
  const force = args.includes('--force');
  const result = recoverWorktreeIndex(cwd, { force });
  console.log(`[recover-worktree-index] recovered ${cwd} (headSha=${result.headSha}, headOnRemote=${result.headOnRemote})`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error('recover-worktree-index failed:', err?.message || err); process.exit(1); });
}
