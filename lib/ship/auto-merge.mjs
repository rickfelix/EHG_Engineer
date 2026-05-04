/**
 * Hardened auto-merge for /ship Step 6 (AUTO-PROCEED ACTIVE branch).
 *
 * Closes SD-LEO-INFRA-SHIP-AUTO-MERGE-001: three compounding failure modes
 * that left PRs orphaned in draft state while SD rows were marked completed.
 *
 *   1. Draft PRs — gh pr ready before gh pr merge
 *   2. Branch protection enforce_admins — pass --admin only when required
 *   3. No exit-code check — hard-fail /ship instead of silent-proceed
 *
 * Plus: race-recovery via gh pr view --json state when merge exits non-zero
 * but the PR has already been merged by a concurrent process.
 *
 * The runner and logger params exist so tests can inject deterministic stubs
 * without spawning real gh processes.
 */

import { spawnSync } from 'node:child_process';

/** Default runner: invokes gh CLI synchronously and returns { code, stdout, stderr }. */
function defaultRunner(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8' });
  return {
    code: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

const defaultLogger = {
  info: (msg) => console.log(msg),
  warn: (msg) => console.warn(msg),
  error: (msg) => console.error(msg),
};

/**
 * Detect whether a PR is in draft state.
 * Returns true / false / null (null on lookup failure).
 */
export function detectDraftState(prNumber, runner = defaultRunner) {
  const r = runner(['pr', 'view', String(prNumber), '--json', 'isDraft', '--jq', '.isDraft']);
  if (r.code !== 0) return null;
  const trimmed = r.stdout.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  return null;
}

/**
 * Detect branch-protection enforce_admins for `main`.
 * Returns true / false (defaults to false on lookup failure — safer fallback).
 */
export function detectEnforceAdmins(repoOwner, repoName, runner = defaultRunner) {
  const r = runner([
    'api',
    `repos/${repoOwner}/${repoName}/branches/main/protection`,
    '--jq',
    '.enforce_admins.enabled',
  ]);
  if (r.code !== 0) return false;
  return r.stdout.trim() === 'true';
}

/** Build the gh pr merge argv. Exported for unit tests. */
export function buildMergeArgs(prNumber, { admin } = {}) {
  const args = ['pr', 'merge', String(prNumber), '--merge', '--delete-branch'];
  if (admin) args.push('--admin');
  return args;
}

/**
 * Verify a PR is actually merged by re-fetching mergedAt.
 *
 * QF-20260504-195: `gh pr merge` can exit 0 in queued / auto-merge-label
 * states without the merge actually completing. The exit code alone is not
 * load-bearing — we must confirm `mergedAt` is non-null before declaring
 * success. Returns true / false (false on lookup failure — safer fallback,
 * forces fall-through to race-recovery).
 */
export function verifyMerged(prNumber, runner = defaultRunner) {
  const r = runner(['pr', 'view', String(prNumber), '--json', 'mergedAt', '--jq', '.mergedAt']);
  if (r.code !== 0) return false;
  const trimmed = r.stdout.trim();
  if (!trimmed) return false;
  if (trimmed === 'null') return false;
  return true;
}

/**
 * Top-level orchestrator. Returns:
 *   { ok: true, action: 'merged' | 'already-merged', adminUsed: boolean }
 *   { ok: false, reason: string, exitCode: number }
 */
export async function attemptAutoMerge({
  prNumber,
  repoOwner,
  repoName,
  runner = defaultRunner,
  logger = defaultLogger,
}) {
  if (!prNumber) {
    return { ok: false, reason: 'prNumber required', exitCode: 2 };
  }

  // 1. Detect + handle draft state.
  const isDraft = detectDraftState(prNumber, runner);
  if (isDraft === true) {
    logger.info(`🔧 PR #${prNumber} is draft — marking ready for review...`);
    const r = runner(['pr', 'ready', String(prNumber)]);
    if (r.code !== 0) {
      return { ok: false, reason: `gh pr ready failed: ${r.stderr.trim()}`, exitCode: r.code };
    }
  }

  // 2. Runtime-detect enforce_admins.
  const enforceAdmins = detectEnforceAdmins(repoOwner, repoName, runner);
  if (enforceAdmins) {
    logger.info('ℹ️  Branch protection enforce_admins=true — passing --admin');
  }

  // 3. Attempt merge.
  const mergeArgs = buildMergeArgs(prNumber, { admin: enforceAdmins });
  logger.info(`🚀 Merging PR #${prNumber}...`);
  const merge = runner(mergeArgs);

  if (merge.code === 0) {
    if (verifyMerged(prNumber, runner)) {
      logger.info(`✅ PR #${prNumber} merged and branch deleted`);
      return { ok: true, action: 'merged', adminUsed: enforceAdmins };
    }
    // QF-20260504-195: gh pr merge exited 0 but mergedAt is null — the
    // merge was queued / auto-merge-labeled / silently rejected. Fall
    // through to state-check + hard-fail instead of trusting the exit code.
    logger.warn(
      `⚠️  gh pr merge exited 0 but mergedAt is null — verifying PR state before declaring success`,
    );
  }

  // 4. Non-zero exit OR exit-0-but-not-merged — race recovery.
  const stateRes = runner(['pr', 'view', String(prNumber), '--json', 'state', '--jq', '.state']);
  const state = stateRes.code === 0 ? stateRes.stdout.trim() : null;

  if (state === 'MERGED') {
    logger.info(
      `ℹ️  gh pr merge returned ${merge.code} but PR is already MERGED (concurrent-merge race) — continuing`,
    );
    return { ok: true, action: 'already-merged', adminUsed: enforceAdmins };
  }

  const silentSuccess = merge.code === 0;
  const reason = silentSuccess
    ? `silent-success: gh pr merge exit 0 but mergedAt null, state=${state ?? 'unknown'}`
    : (merge.stderr.trim() || `merge exit ${merge.code}, state=${state ?? 'unknown'}`);
  logger.error(
    silentSuccess
      ? `❌ gh pr merge silent-success regression (exit 0, mergedAt null, state=${state ?? 'unknown'}) — /ship HARD-FAIL`
      : `❌ gh pr merge failed (exit ${merge.code}, PR state=${state ?? 'unknown'}) — /ship HARD-FAIL`,
  );
  logger.error(
    `   Manual recovery: gh pr ready ${prNumber} && gh pr merge ${prNumber} --merge --delete-branch --admin`,
  );
  return {
    ok: false,
    reason,
    exitCode: silentSuccess ? 1 : merge.code,
  };
}
