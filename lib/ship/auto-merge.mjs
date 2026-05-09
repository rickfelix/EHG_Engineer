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
 * QF-20260509-VERIFY-BRANCH-DELETED — closes feedback 4e273e05 (4th+ witness
 * 2026-05-06). `gh pr merge --delete-branch` can succeed at the merge step
 * but silently no-op the branch deletion (token lacking delete-ref scope,
 * branch protection forbidding deletion, GitHub API quirks, etc). Operators
 * see "merged and branch deleted" in the log, but the head ref still exists,
 * leaving orphan branches accumulating in the repo.
 *
 * Authoritative GET on the head ref AFTER merge:
 *   - true  — branch is gone (404 from the GitHub API)
 *   - false — branch still exists (deletion silently failed)
 *   - null  — couldn't determine (unrelated lookup failure; treat as advisory)
 *
 * @returns {true|false|null}
 */
export function verifyBranchDeleted(prNumber, repoOwner, repoName, runner = defaultRunner) {
  if (!repoOwner || !repoName) return null;
  const view = runner(['pr', 'view', String(prNumber), '--json', 'headRefName', '--jq', '.headRefName']);
  if (view.code !== 0) return null;
  const branch = view.stdout.trim();
  if (!branch) return null;
  // 404 (branch gone) → exit code != 0 + stderr mentions "Not Found" / "404".
  // 200 (branch still there) → exit code 0 with payload.
  const ref = runner(['api', `repos/${repoOwner}/${repoName}/git/refs/heads/${branch}`]);
  if (ref.code === 0) return false;
  const stderr = (ref.stderr || '').toLowerCase();
  if (stderr.includes('not found') || stderr.includes('404')) return true;
  return null;
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
      // QF-20260509-VERIFY-BRANCH-DELETED: don't claim "branch deleted"
      // until we've actually checked. The merge succeeded; honest log
      // about the branch deletion outcome.
      const branchOutcome = verifyBranchDeleted(prNumber, repoOwner, repoName, runner);
      if (branchOutcome === true) {
        logger.info(`✅ PR #${prNumber} merged and branch deleted`);
      } else if (branchOutcome === false) {
        logger.warn(
          `⚠️  PR #${prNumber} merged BUT branch deletion silently failed — manual cleanup needed: ` +
          `gh api --method DELETE repos/${repoOwner}/${repoName}/git/refs/heads/<branch>`
        );
      } else {
        logger.info(`✅ PR #${prNumber} merged (branch deletion not verified)`);
      }
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
