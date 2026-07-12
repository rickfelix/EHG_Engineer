/**
 * applications.trust_tier SSOT hook + pre-merge witness evaluator for venture repos.
 *
 * SD-LEO-INFRA-SHIP-WITNESS-APPLICATIONS-001 (Ship-witness B). Extends the
 * platform-only auto-merge trust gate (lib/ship/auto-merge.mjs isPlatformRepo)
 * with a second, narrower path: a venture repo explicitly opted in via
 * applications.trust_tier='trusted' (already permitted by the live
 * ck_applications_trust_tier CHECK constraint — no migration needed) is
 * eligible for auto-merge ONLY when its specific PR has independently passed
 * the currently-evaluable subset of the mergeWork() P1-P5 ladder
 * (lib/ship/merge-witness-ladder.mjs, Ship-witness A, consumed read-only
 * here): P1 admission, P2 witness verdict, P3 CI. P2's actor-separation
 * dimension and P4 (pre-P0 branch protection) are not evaluable yet and are
 * never required for a pass — see the ladder module's own docs. Registry
 * promotion to 'trusted' grants nothing by itself; every PR is still
 * evaluated independently.
 *
 * Sibling A shipped the ladder's lookupWorkKeyReal/fetchReviewFinding as
 * injectable interfaces with no concrete default (its own ladder is
 * observe-only and never needed real values to be useful telemetry). This
 * module's gating IS real, so it ships default implementations of both.
 */

import { evaluateMergeWorkLadder, RUNG_STATUS } from './merge-witness-ladder.mjs';
import { isPlatformRepo } from './auto-merge.mjs';

/** Normalize a github_repo field ('owner/name.git' or 'owner/name') to 'owner/name' lowercase. */
export function normalizeGithubRepo(githubRepo) {
  if (!githubRepo) return null;
  return githubRepo.replace(/\.git$/i, '').toLowerCase();
}

/**
 * Look up applications.trust_tier for a repoOwner/repoName pair by matching
 * against every non-null github_repo. Returns the trust_tier string, or null
 * (fail-closed) when no row's github_repo resolves to this repo.
 */
export async function fetchTrustTier(repoOwner, repoName, supabase) {
  if (!supabase || !repoOwner || !repoName) return null;
  const target = `${repoOwner}/${repoName}`.toLowerCase();
  const { data, error } = await supabase
    .from('applications')
    .select('trust_tier, github_repo')
    .not('github_repo', 'is', null);
  if (error || !data) return null;
  const match = data.find((row) => normalizeGithubRepo(row.github_repo) === target);
  return match ? match.trust_tier : null;
}

/**
 * P1 admission default: workKey starting with 'QF-' resolves against
 * quick_fixes.id; anything else resolves against strategic_directives_v2.sd_key.
 * Returns true/false/null (null on query error — mirrors evaluateP1Admission's
 * not_evaluable contract, never a false pass).
 */
export async function defaultLookupWorkKeyReal(workKey, supabase) {
  if (!supabase || !workKey) return null;
  try {
    if (workKey.startsWith('QF-')) {
      const { data, error } = await supabase.from('quick_fixes').select('id').eq('id', workKey).maybeSingle();
      if (error) return null;
      return !!data;
    }
    const { data, error } = await supabase.from('strategic_directives_v2').select('sd_key').eq('sd_key', workKey).maybeSingle();
    if (error) return null;
    return !!data;
  } catch {
    return null;
  }
}

/**
 * P2 witness default: most recent ship_review_findings row for this PR,
 * scoped to the PR's own branch.
 *
 * SD-FDBK-FIX-WITNESS-LOOKUP-MATCHES-001 (SECURITY): the pre-fix version of
 * this function matched by pr_number ALONE — small integers collide
 * constantly across repos (confirmed live: apexniche-ai PR #2/#5 collided
 * with MARKETLENS's passing rows at the same PR numbers), letting one
 * venture repo's passing review witness-pass an ENTIRELY DIFFERENT repo's
 * unreviewed PR through the VB-2 auto-merge trust gate. ship_review_findings
 * has no repo column (see the chairman-gated Layer-2 migration for that),
 * so this is scoped by branch instead — branch is 100% populated on every
 * ship_review_findings row from the two live trusted-venture repos (verified
 * against production data), unlike sd_key/workKey, which is a hand-filled
 * ship.md placeholder ('<SD-KEY or null>') prone to write/read drift.
 *
 * FAIL-CLOSED (the core invariant): when branch is absent, this returns null
 * (not_evaluable) — it NEVER falls back to the old pr_number-only match.
 * Returns { verdict } or null (no row / query error / no branch supplied).
 */
export async function defaultFetchReviewFinding(prNumber, supabase, { branch } = {}) {
  if (!supabase || !prNumber || !branch) return null;
  try {
    const { data, error } = await supabase
      .from('ship_review_findings')
      .select('verdict')
      .eq('pr_number', prNumber)
      .eq('branch', branch)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return { verdict: data.verdict };
  } catch {
    return null;
  }
}

/**
 * Evaluate whether a venture PR has passed the pre-merge-evaluable witness
 * subset (P1 admission, P2 witness verdict, P3 CI) — all three must report
 * 'pass'. Never throws; any internal failure degrades to false (fail-closed).
 */
export async function evaluateVenturePrWitness({
  prNumber, workKey, tier, lookupWorkKeyReal, fetchReviewFinding, statusCheckRollup, branch,
}) {
  try {
    const verdict = await evaluateMergeWorkLadder({
      prNumber, workKey, tier, lookupWorkKeyReal, fetchReviewFinding, statusCheckRollup, branch,
    });
    const byId = Object.fromEntries(verdict.rungs.map((r) => [r.id, r.status]));
    return byId.P1 === RUNG_STATUS.PASS && byId.P2 === RUNG_STATUS.PASS && byId.P3 === RUNG_STATUS.PASS;
  } catch {
    return false;
  }
}

/**
 * Build an isTrustedRepo-compatible predicate for attemptAutoMerge():
 * isTrustedRepoOrWitnessPassed(repoOwner, repoName, prNumber, {workKey, tier}).
 * isPlatformRepo fast path (no DB call) preserves today's behavior exactly;
 * otherwise requires trust_tier==='trusted' AND a passing per-PR witness.
 * Extra args beyond (repoOwner, repoName) are simply unused by isPlatformRepo,
 * so this predicate is a drop-in replacement for attemptAutoMerge's default.
 */
export function createVentureTrustGate({
  supabase,
  fetchStatusCheckRollup,
  lookupWorkKeyReal,
  fetchReviewFinding,
} = {}) {
  const lookupWork = lookupWorkKeyReal || ((workKey) => defaultLookupWorkKeyReal(workKey, supabase));
  const fetchFinding = fetchReviewFinding || ((prNumber, opts) => defaultFetchReviewFinding(prNumber, supabase, opts));

  return async function isTrustedRepoOrWitnessPassed(repoOwner, repoName, prNumber, { workKey, tier, branch } = {}) {
    if (isPlatformRepo(repoOwner, repoName)) return true;
    if (!prNumber) return false;

    const trustTier = await fetchTrustTier(repoOwner, repoName, supabase);
    if (trustTier !== 'trusted') return false;

    const statusCheckRollup = fetchStatusCheckRollup ? await fetchStatusCheckRollup(prNumber, repoOwner, repoName) : [];
    return evaluateVenturePrWitness({
      prNumber,
      workKey,
      tier,
      lookupWorkKeyReal: lookupWork,
      fetchReviewFinding: fetchFinding,
      statusCheckRollup,
      branch,
    });
  };
}
