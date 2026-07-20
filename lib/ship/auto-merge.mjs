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
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8 — the registry-narrowed trust
// gate below scans applications.github_repo to find (and further RESTRICT on) a matching
// repo row. A read silently capped at the PostgREST 1000-row max could miss a matching row
// past the cap and wrongly leave a floor-eligible repo un-narrowed. Paginate the scan.
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';
import { evaluateMergeWorkLadder } from './merge-witness-ladder.mjs';
import { writeMergeWitnessTelemetry } from './merge-witness-telemetry.mjs';
import { writeEscapeAuditRow, createEscapeAuditChecker } from './escape-auth.mjs';

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

/**
 * FR-3 (SD-LEO-INFRA-CANONICAL-REPO-APP-001): registry-AND-composed trust gate.
 *
 * `isPlatformRepo` (the literal AUTO_MERGE_PLATFORM_REPOS Set) remains the
 * non-negotiable floor — this factory NEVER widens eligibility beyond it, only
 * narrows. Concretely: applications.trust_tier is a live example of the exact
 * risk this guards against — MarketLens (an external venture repo requiring a
 * human merge) is tagged trust_tier='trusted' in the registry, NOT 'external'.
 * A registry-only check (or an OR-composed check) would wrongly auto-merge-
 * enable it; the floor check below runs FIRST and short-circuits false for any
 * repo outside the hardcoded Set, so no registry value can ever flip it to true.
 *
 * For a floor-eligible repo (rickfelix/ehg, rickfelix/EHG_Engineer), the registry
 * is consulted only to further RESTRICT: if the matching applications row's
 * trust_tier is present and is NOT 'platform' (e.g. operationally revoked/
 * suspended without a code deploy), auto-merge is refused. No matching row, a
 * lookup error, or no supabase client supplied all fall back to the floor
 * result alone (fail-open only within the floor — never beyond it).
 *
 * Returns an `isTrustedRepo`-compatible predicate: `(repoOwner, repoName) => Promise<boolean>`.
 * The default `attemptAutoMerge` wiring (`isTrustedRepo = isPlatformRepo`) is
 * UNCHANGED — this is an opt-in extension point, not a default-path behavior change.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} [supabase]
 * @returns {(repoOwner: string, repoName: string) => Promise<boolean>}
 */
export function createRegistryNarrowedTrustGate(supabase) {
  return async function isTrustedPlatformRepo(repoOwner, repoName) {
    if (!isPlatformRepo(repoOwner, repoName)) return false; // floor: non-negotiable
    if (!supabase) return true; // no registry consultation available — floor alone stands

    try {
      const githubRepo = `${repoOwner}/${repoName}`.toLowerCase();
      // GUARD read: this narrows a floor-eligible repo. A page error THROWS → the outer
      // catch returns true (floor alone stands), mirroring the prior `if (error) return true`
      // "DB unavailable is NOT an authoritative narrowing signal" policy exactly.
      const data = await fetchAllPaginated(() => supabase
        .from('applications')
        .select('trust_tier, github_repo')
        .not('github_repo', 'is', null)
        .order('id', { ascending: true })); // unique tiebreaker: stable page boundaries (FR-6)

      const row = data.find((a) => String(a.github_repo || '').replace(/\.git$/i, '').toLowerCase() === githubRepo);
      if (!row) return true; // no registry row — nothing to narrow with, floor alone stands

      return row.trust_tier === 'platform';
    } catch {
      return true; // DB unavailable is NOT an authoritative narrowing signal — floor alone stands
    }
  };
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
 *
 * QF-20260705-938: repo-scoped when repoOwner/repoName are supplied — an
 * unscoped `gh pr view` resolves the PR NUMBER against the ambient cwd repo
 * (the QF-20260703-401/197 class at yet another callsite).
 */
export function detectDraftState(prNumber, repoOwner, repoName, runner = defaultRunner) {
  // Back-compat: legacy 2-arg callers pass the runner in the second slot.
  if (typeof repoOwner === 'function') { runner = repoOwner; repoOwner = undefined; repoName = undefined; }
  const args = ['pr', 'view', String(prNumber)];
  if (repoOwner && repoName) args.push('-R', `${repoOwner}/${repoName}`);
  args.push('--json', 'isDraft', '--jq', '.isDraft');
  const r = runner(args);
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

/**
 * Build the gh pr merge argv. Exported for unit tests.
 *
 * QF-20260705-938 (critical, live near-miss ehg PR #734): the merge argv MUST
 * carry -R <owner>/<repo> when the caller knows the target repo — without it,
 * gh resolves the PR NUMBER against the ambient cwd repo. verifyMerged was
 * already scoped (QF-20260703-197), so the failure mode was a silent no-op or,
 * worst case, MERGING THE WRONG REPO'S PR WITH --admin when the number
 * collides with an open PR in the cwd repo.
 */
export function buildMergeArgs(prNumber, { admin, repoOwner, repoName } = {}) {
  const args = ['pr', 'merge', String(prNumber)];
  if (repoOwner && repoName) args.push('-R', `${repoOwner}/${repoName}`);
  args.push('--merge', '--delete-branch');
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
 * it can NEVER alter the caller's actual merge/no-merge outcome.
 *
 * SD-LEO-INFRA-SHIP-WITNESS-TRIO-001 (FR-1): exported so every merge lane
 * (not just /ship's attemptAutoMerge) can observe via the same implementation
 * instead of reimplementing it — quick-fix's mergeToMain() and
 * worktree-merge.js both call this directly after a successful merge.
 */
export async function observeMergeWorkLadder({
  prNumber, repoOwner, repoName, workKey, tier, runner, merged, verifyResult,
  lookupWorkKeyReal, fetchReviewFinding, supabase, lane, logger,
  // SD-LEO-INFRA-SHIP-WITNESS-TRIO-001 (FR-3): optional, additive. Omitted by
  // every pre-existing caller — byte-identical behavior to before FR-3 (TR-3).
  adminOverride = false,
  // SD-FDBK-FIX-WITNESS-LOOKUP-MATCHES-001: optional, additive — forwarded to
  // P2's fetchReviewFinding so a live implementation can scope its lookup by
  // branch and avoid a cross-repo pr_number collision. Callers that don't
  // inject fetchReviewFinding (P2 already not_evaluable) are unaffected.
  branch,
}) {
  try {
    // FR-3: best-effort dual-key audit write for an admin-override merge, BEFORE
    // evaluating the ladder, so evaluateEscapeAuth() (below) can see its own row.
    // A write failure must never affect the merge (already happened) or the
    // observation itself — caught independently of the ladder evaluation.
    if (adminOverride && supabase) {
      try {
        const sessionId = process.env.CLAUDE_SESSION_ID;
        if (sessionId && repoOwner && repoName && prNumber) {
          await writeEscapeAuditRow(supabase, {
            prNumber,
            repo: `${repoOwner}/${repoName}`,
            sessionId,
            reason: 'branch protection enforce_admins=true',
          });
        } else {
          logger?.warn?.('⚠️  escape-audit write skipped: missing sessionId/repo/prNumber (dual-key requires both)');
        }
      } catch (e) {
        logger?.warn?.(`⚠️  escape-audit write failed (non-fatal): ${e?.message || e}`);
      }
    }

    const statusCheckRollup = fetchStatusCheckRollup(prNumber, repoOwner, repoName, runner);
    const verdict = await evaluateMergeWorkLadder({
      prNumber, workKey, tier, lookupWorkKeyReal, fetchReviewFinding, statusCheckRollup, merged, verifyResult,
      // QF-20260703-363: same live P4 probe QF-744 wired into the retro CLI —
      // this lane must not fall back to the always-not_applicable stub.
      repoOwner,
      repoName,
      checkProtection: (ro, rn) => detectBranchProtectionEnabled(ro, rn, 'main', runner),
      // FR-3: only evaluated when this merge actually used --admin; every other
      // caller/merge leaves P4's escapeAuth sub-field absent (TR-3).
      adminOverride,
      checkEscapeAudit: adminOverride && supabase ? createEscapeAuditChecker(supabase) : undefined,
      branch,
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
  // SD-FDBK-FIX-WITNESS-LOOKUP-MATCHES-001 (SECURITY): the PR's own head branch,
  // forwarded through isTrustedRepo -> ...  -> P2's fetchReviewFinding so a live
  // implementation can scope its ship_review_findings lookup and avoid a
  // cross-repo pr_number collision (confirmed live: apexniche-ai/marketlens PR
  // #2 and #5). Optional/additive — isPlatformRepo (the default) ignores it.
  branch,
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
  const trusted = await isTrustedRepo(repoOwner, repoName, prNumber, { workKey, tier, branch });
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
      // QF-20260703-363: same live P4 probe as observeMergeWorkLadder below —
      // the pre-merge enforcement path must see the same authoritative P4 rung.
      repoOwner,
      repoName,
      checkProtection: (ro, rn) => detectBranchProtectionEnabled(ro, rn, 'main', runner),
      branch,
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

  // 1. Detect + handle draft state (repo-scoped, QF-20260705-938).
  const isDraft = detectDraftState(prNumber, repoOwner, repoName, runner);
  if (isDraft === true) {
    logger.info(`🔧 PR #${prNumber} is draft — marking ready for review...`);
    const readyArgs = ['pr', 'ready', String(prNumber)];
    if (repoOwner && repoName) readyArgs.push('-R', `${repoOwner}/${repoName}`);
    const r = runner(readyArgs);
    if (r.code !== 0) {
      return { ok: false, reason: `gh pr ready failed: ${r.stderr.trim()}`, exitCode: r.code };
    }
  }

  // 2. Runtime-detect enforce_admins.
  const enforceAdmins = detectEnforceAdmins(repoOwner, repoName, runner);
  if (enforceAdmins) {
    logger.info('ℹ️  Branch protection enforce_admins=true — passing --admin');
  }

  // 3. Attempt merge (repo-scoped, QF-20260705-938 — the live-near-miss callsite).
  const mergeArgs = buildMergeArgs(prNumber, { admin: enforceAdmins, repoOwner, repoName });
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
        adminOverride: enforceAdmins, branch,
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
      adminOverride: enforceAdmins, branch,
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
    lookupWorkKeyReal, fetchReviewFinding, supabase: witnessSupabase, lane, logger, branch,
  });
  return {
    ok: false,
    reason,
    exitCode: silentSuccess ? 1 : merge.code,
  };
}
