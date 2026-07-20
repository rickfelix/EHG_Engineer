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
import { probeRepoColumnExists, normalizeGithubRepo } from './repo-column-probe.mjs';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8 — fetchTrustTier scans
// applications.github_repo to resolve a venture repo's trust_tier (the auto-merge trust
// signal). A read silently capped at the PostgREST 1000-row max could miss a matching row
// past the cap and fail-closed (null → refuse) a genuinely-trusted repo. Paginate the scan.
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

export { normalizeGithubRepo };

/**
 * Look up applications.trust_tier for a repoOwner/repoName pair by matching
 * against every non-null github_repo. Returns the trust_tier string, or null
 * (fail-closed) when no row's github_repo resolves to this repo.
 */
export async function fetchTrustTier(repoOwner, repoName, supabase) {
  if (!supabase || !repoOwner || !repoName) return null;
  const target = `${repoOwner}/${repoName}`.toLowerCase();
  // GUARD read (fail-closed): a page error THROWS → caught → return null, mirroring the
  // prior `if (error || !data) return null` policy (null → caller refuses auto-merge).
  let data;
  try {
    data = await fetchAllPaginated(() => supabase
      .from('applications')
      .select('trust_tier, github_repo')
      .not('github_repo', 'is', null)
      .order('id', { ascending: true })); // unique tiebreaker: stable page boundaries (FR-6)
  } catch {
    return null;
  }
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
 * scoped to the PR's own repo (primary, once the column exists) or branch
 * (fallback).
 *
 * SD-FDBK-FIX-WITNESS-LOOKUP-MATCHES-001 (SECURITY): the pre-fix version of
 * this function matched by pr_number ALONE — small integers collide
 * constantly across repos (confirmed live: apexniche-ai PR #2/#5 collided
 * with MARKETLENS's passing rows at the same PR numbers), letting one
 * venture repo's passing review witness-pass an ENTIRELY DIFFERENT repo's
 * unreviewed PR through the VB-2 auto-merge trust gate. The urgent interim
 * fix scoped by branch instead — 100% populated on every live row, unlike
 * sd_key/workKey.
 *
 * SD-APEXNICHE-AI-LEO-GEN-WITNESS-LOOKUP-DURABLE-001 (FR-6): once the
 * chairman-gated repo column exists (probed at runtime, never assumed) and
 * a repo is supplied, repo becomes the PRIMARY scope — strictly stronger
 * than branch (branch names like `main` can collide across repos too).
 * The branch fallback is now ADDITIONALLY restricted to `repo IS NULL`
 * rows: without that guard, a populated-but-different-repo row that
 * happens to share a branch name would re-open the exact cross-repo
 * fail-open this SD's parent closed. Never OR the two scopes together.
 *
 * FAIL-CLOSED (the core invariant, unchanged): no repo AND no branch
 * returns null (not_evaluable) — this NEVER falls back to the old
 * pr_number-only match. Returns { verdict } or null (no row / query error).
 */
export async function defaultFetchReviewFinding(prNumber, supabase, { branch, repo } = {}) {
  if (!supabase || !prNumber || (!branch && !repo)) return null;
  try {
    const hasRepoColumn = await probeRepoColumnExists(supabase);

    if (hasRepoColumn && repo) {
      const { data, error } = await supabase
        .from('ship_review_findings')
        .select('verdict')
        .eq('pr_number', prNumber)
        .eq('repo', normalizeGithubRepo(repo))
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return null;
      return { verdict: data.verdict };
    }

    if (!branch) return null;
    let query = supabase
      .from('ship_review_findings')
      .select('verdict')
      .eq('pr_number', prNumber)
      .eq('branch', branch);
    // Restrict the legacy branch fallback to repo IS NULL rows once the
    // column exists -- a populated repo that merely shares this branch
    // name must never match (see FR-6 doc above). Only applied when the
    // column exists; `.is('repo', null)` against an absent column would
    // itself error.
    if (hasRepoColumn) {
      query = query.is('repo', null);
    }
    const { data, error } = await query
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
  prNumber, workKey, tier, lookupWorkKeyReal, fetchReviewFinding, statusCheckRollup, branch, repo,
}) {
  try {
    const verdict = await evaluateMergeWorkLadder({
      prNumber, workKey, tier, lookupWorkKeyReal, fetchReviewFinding, statusCheckRollup, branch, repo,
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
      repo: `${repoOwner}/${repoName}`,
    });
  };
}
