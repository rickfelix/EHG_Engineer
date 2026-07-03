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
import { evaluateMergeWorkLadder } from './merge-witness-ladder.mjs';
import { writeMergeWitnessTelemetry } from './merge-witness-telemetry.mjs';

/**
 * C2 (SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 / SECURITY VB-2): platform repos
 * eligible for UNATTENDED auto-merge. Routing the harness's merge automation at an
 * untrusted external/venture repo without human review is a supply-chain risk — so
 * everything NOT in this set (including unknown/unresolvable repos) fails closed and
 * requires a human merge. This hardcoded allowlist is the fail-closed default; it does
 * not depend on registry availability (defense-in-depth: even a corrupt registry can
 * only ever auto-merge the two known platform repos). The applications registry
 * trust_tier column is the broader SSOT and may be consulted via an injected
 * isTrustedRepo predicate.
 */
export const AUTO_MERGE_PLATFORM_REPOS = new Set(['rickfelix/ehg', 'rickfelix/ehg_engineer']);

/** True only for the platform repos eligible for unattended auto-merge. */
export function isPlatformRepo(repoOwner, repoName) {
  if (!repoOwner || !repoName) return false;
  return AUTO_MERGE_PLATFORM_REPOS.has(`${repoOwner}/${repoName}`.toLowerCase());
}

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

/**
 * QF-20260703-744: authoritative branch-protection presence check that never
 * collapses "cannot read" into "disabled" (the bug detectEnforceAdmins's
 * merge-flow fallback intentionally accepts but a WITNESS rung must not).
 * @returns {true|false|null} true=confirmed enabled, false=confirmed absent
 *   (genuine 404 "Branch not protected"), null=not_evaluable (403/scope/network).
 */
export function detectBranchProtectionEnabled(repoOwner, repoName, branch = 'main', runner = defaultRunner) {
  const r = runner(['api', `repos/${repoOwner}/${repoName}/branches/${branch}/protection`]);
  if (r.code === 0) return true;
  const stderr = (r.stderr || '').toLowerCase();
  if (stderr.includes('branch not protected') || stderr.includes('404')) return false;
  return null;
}

/** Build the gh pr merge argv. Exported for unit tests. */
export function buildMergeArgs(prNumber, { admin } = {}) {
  const args = ['pr', 'merge', String(prNumber), '--merge', '--delete-branch'];
  if (admin) args.push('--admin');
  return args;
}

/**
 * Verify a PR is actually merged by re-fetching mergedAt + cross-checking state.
 *
 * QF-20260504-195: `gh pr merge` can exit 0 in queued / auto-merge-label
 * states without the merge actually completing. The exit code alone is not
 * load-bearing — we must confirm `mergedAt` is non-null before declaring
 * success.
 *
 * QF-20260516-082 (closes harness 72a3a5f1): mergedAt alone is not enough.
 * Empirical witness 2026-05-13 PR rickfelix/ehg#600: gh returned a populated
 * mergedAt timestamp while the PR was still queued behind an unstable
 * mergeable_state (Vercel check pending). The gh REST view can briefly
 * surface a stale mergedAt during the queue→merge window. Cross-check
 * state==='MERGED' (authoritative) before declaring success.
 *
 * QF-20260703-197: MUST be repo-scoped (-R) and require mergedAt AND
 * mergeCommit non-null AND state==='MERGED'. An unscoped `gh pr view`
 * resolves against the process's ambient CWD repo, not (repoOwner,
 * repoName) — on the witness's first live venture-repo exercise
 * (rickfelix/marketlens PR #2) this silently returned a false PASS sourced
 * from an unrelated, already-merged PR of the same number in the wrong repo.
 *
 * Returns true / false (false on lookup failure or missing repo — safer
 * fallback, forces fall-through to race-recovery / never a false pass).
 */
export function verifyMerged(prNumber, repoOwner, repoName, runner = defaultRunner) {
  if (!repoOwner || !repoName) return false;
  const res = runner(['pr', 'view', String(prNumber), '-R', `${repoOwner}/${repoName}`, '--json', 'mergedAt,mergeCommit,state']);
  if (res.code !== 0) return false;
  let parsed;
  try { parsed = JSON.parse(res.stdout); } catch { return false; }
  if (!parsed || typeof parsed !== 'object') return false;
  return !!parsed.mergedAt && !!parsed.mergeCommit && parsed.state === 'MERGED';
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
/**
 * Fetch a PR's statusCheckRollup for the P3 rung of the mergeWork() ladder.
 * Returns [] on lookup failure (evaluateP3CI reports not_evaluable for an
 * empty rollup — never a false pass/fail). Exported (SD-LEO-INFRA-SHIP-
 * WITNESS-APPLICATIONS-001) so lib/ship/venture-trust-gate.mjs can reuse the
 * same gh CLI fetch path instead of reimplementing it.
 *
 * QF-20260703-401: repoOwner/repoName are optional but SHOULD always be
 * passed by cross-repo callers — an unscoped `gh pr view` resolves against
 * the process's ambient cwd repo (mirrors the exact class of bug fixed in
 * verifyMerged by QF-20260703-197), so an unscoped call from EHG_Engineer's
 * own cwd for a venture-repo PR silently reads the wrong repo's checks.
 */
export function fetchStatusCheckRollup(prNumber, repoOwner, repoName, runner = defaultRunner) {
  const args = ['pr', 'view', String(prNumber)];
  if (repoOwner && repoName) args.push('-R', `${repoOwner}/${repoName}`);
  args.push('--json', 'statusCheckRollup', '--jq', '.statusCheckRollup');
  const r = runner(args);
  if (r.code !== 0) return [];
  try {
    const parsed = JSON.parse(r.stdout.trim() || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * SD-LEO-INFRA-SHIP-WITNESS-MERGEWORK-001 (Ship-witness A) FR-4: evaluate the
 * mergeWork() P1-P5 ladder and persist telemetry in SHADOW MODE for this merge
 * attempt. This function's return value is discarded by callers — it exists
 * purely to observe. Never throws: any failure inside is caught and logged so
 * it can NEVER alter attemptAutoMerge()'s actual merge/no-merge outcome.
 */
async function observeMergeWorkLadder({
  prNumber, repoOwner, repoName, workKey, tier, runner, merged, verifyResult,
  lookupWorkKeyReal, fetchReviewFinding, supabase, lane, logger,
}) {
  try {
    const statusCheckRollup = fetchStatusCheckRollup(prNumber, repoOwner, repoName, runner);
    const verdict = await evaluateMergeWorkLadder({
      prNumber, workKey, tier, lookupWorkKeyReal, fetchReviewFinding, statusCheckRollup, merged, verifyResult,
    });
    if (supabase) {
      await writeMergeWitnessTelemetry(supabase, verdict, {
        repo: repoOwner && repoName ? `${repoOwner}/${repoName}` : null,
        lane: lane || 'ship-auto-merge',
        logger,
      });
    }
  } catch (e) {
    logger?.warn?.(`⚠️  mergeWork() ladder observation failed (non-fatal, observe-only): ${e?.message || e}`);
  }
}

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
  // C2 (SECURITY VB-2): trust gate. isTrustedRepo decides auto-merge eligibility;
  // defaults to the platform allowlist. allowExternalMerge is an explicit, audited
  // override for the rare case a caller has a human already in the loop.
  isTrustedRepo = isPlatformRepo,
  allowExternalMerge = false,
  // SD-LEO-INFRA-SHIP-WITNESS-MERGEWORK-001 (Ship-witness A) FR-4: OBSERVE-ONLY
  // mergeWork() P1-P5 ladder inputs. All optional and additive — omitting them
  // (as every pre-existing caller does) still runs the ladder in shadow mode,
  // just with more rungs reporting not_evaluable. Never affects the return
  // value or control flow above this comment.
  workKey = null,
  tier = 'standard',
  lane = 'ship-auto-merge',
  lookupWorkKeyReal,
  fetchReviewFinding,
  witnessSupabase = null,
  // SD-LEO-INFRA-SHIP-WITNESS-ENFORCE-001 (Ship-witness D): optional pre-merge enforcement
  // hook. undefined (every pre-existing caller, including today's real /ship Step 6 snippet)
  // means this block never runs — byte-identical behavior to before this SD. Only a caller
  // that explicitly supplies lib/ship/ship-witness-enforcement.mjs's evaluateEnforcementDecision
  // (itself gated on SHIP_WITNESS_ENFORCE_MODE=enforce AND independently-computed readiness)
  // can ever cause a real pre-merge refusal here.
  enforcementDecision,
}) {
  if (!prNumber) {
    return { ok: false, reason: 'prNumber required', exitCode: 2 };
  }

  // C2 (SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 / SECURITY VB-2): fail-closed human
  // merge-gate for non-platform (venture/external) repos. The bridge can route venture
  // build PRs at external repos; unattended auto-merge there would let the harness merge
  // untrusted code without human review. Refuse unless the repo is platform-trusted (or
  // an explicit allowExternalMerge override is passed). Unknown/unresolvable repo => refuse.
  // SD-LEO-INFRA-SHIP-WITNESS-APPLICATIONS-001: thread prNumber + workKey/tier
  // through so an injected predicate can evaluate a per-PR witness (not just a
  // repo-level allowlist check). isPlatformRepo (the default) ignores the
  // extra args, so this is additive — existing 2-arg predicates are unaffected.
  const trusted = await isTrustedRepo(repoOwner, repoName, prNumber, { workKey, tier });
  if (!allowExternalMerge && !trusted) {
    logger.warn(
      `⛔ Auto-merge refused for PR #${prNumber}: ${repoOwner || '?'}/${repoName || '?'} is not a platform repo. `
      + `External/venture repos require a human merge (SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 / SECURITY VB-2).`
    );
    return {
      ok: false,
      requiresHumanMerge: true,
      reason: `non-platform repo ${repoOwner || '?'}/${repoName || '?'} requires human merge (auto-merge gated per SECURITY VB-2)`,
      exitCode: 0,
    };
  }

  // SD-LEO-INFRA-SHIP-WITNESS-ENFORCE-001 (Ship-witness D): optional pre-merge enforcement gate.
  // Only runs when a caller explicitly supplies enforcementDecision — every existing caller
  // (undefined) skips this block entirely, zero behavior change.
  if (enforcementDecision) {
    const statusCheckRollup = fetchStatusCheckRollup(prNumber, repoOwner, repoName, runner);
    const verdict = await evaluateMergeWorkLadder({
      prNumber, workKey, tier, lookupWorkKeyReal, fetchReviewFinding, statusCheckRollup,
    });
    const decision = await enforcementDecision({ verdict });
    if (decision?.action === 'block') {
      logger.warn(`⛔ Auto-merge refused for PR #${prNumber}: ship-witness enforcement — ${decision.reason}`);
      return {
        ok: false,
        requiresHumanMerge: true,
        reason: `ship-witness enforcement blocked: ${decision.reason}`,
        exitCode: 0,
      };
    }
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
    if (verifyMerged(prNumber, repoOwner, repoName, runner)) {
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
      await observeMergeWorkLadder({
        prNumber, repoOwner, repoName, workKey, tier, runner, merged: true, verifyResult: { ok: true },
        lookupWorkKeyReal, fetchReviewFinding, supabase: witnessSupabase, lane, logger,
      });
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
  // QF-20260703-197: repo-scoped (-R) state lookup for logging, but the pass
  // decision below is the SAME authoritative verifyMerged() as step 3 — an
  // unscoped, state-only race-recovery check was the actual root cause of a
  // P5 false-positive on an unmerged venture-repo PR (marketlens #2).
  const stateRes = runner(['pr', 'view', String(prNumber), '-R', `${repoOwner}/${repoName}`, '--json', 'state', '--jq', '.state']);
  const state = stateRes.code === 0 ? stateRes.stdout.trim() : null;

  if (verifyMerged(prNumber, repoOwner, repoName, runner)) {
    logger.info(
      `ℹ️  gh pr merge returned ${merge.code} but PR is already MERGED (concurrent-merge race) — continuing`,
    );
    await observeMergeWorkLadder({
      prNumber, repoOwner, repoName, workKey, tier, runner, merged: true, verifyResult: { ok: true },
      lookupWorkKeyReal, fetchReviewFinding, supabase: witnessSupabase, lane, logger,
    });
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
  await observeMergeWorkLadder({
    prNumber, repoOwner, repoName, workKey, tier, runner, merged: false, verifyResult: { ok: false },
    lookupWorkKeyReal, fetchReviewFinding, supabase: witnessSupabase, lane, logger,
  });
  return {
    ok: false,
    reason,
    exitCode: silentSuccess ? 1 : merge.code,
  };
}
