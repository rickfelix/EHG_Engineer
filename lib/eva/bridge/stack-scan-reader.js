/**
 * Stack-scan conclusion reader — SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I FR-6.
 *
 * A genuinely new, actively-wired reader (via chairman-product-review.js's sitting
 * packet) -- the originally-assumed "existing workflow-agnostic reader"
 * (fetchLatestWorkflowRun, github-artifact-fetcher.js) was found during PLAN-phase
 * TESTING review to have zero production callers anywhere in this codebase (dead
 * code). This module also does NOT reuse ventures.repo_url (NULL for AltifyAI, and
 * its resolve-venture-repo.js SSOT has no populated fallback for this venture) or
 * metadata.synthetic_actor.github_repo as the primary source (a hand-writable field
 * on the same JSONB block an SD's own config write touches -- see
 * synthetic-actor-guard.js's own established anti-forgery comment, :206-219).
 *
 * venture_resources (resource_type='github_repo') is the PRIMARY source: an
 * independent, provisioning-populated table, not written by this reader or by any
 * SD's own config step.
 */

import { createLogger } from '../../logger.js';

const moduleLogger = createLogger('StackScanReader');

const GITHUB_API_BASE = 'https://api.github.com';
const STACK_SCAN_WORKFLOW_FILE = 'stack-scan.yml';

/**
 * SECURITY (SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I EXEC-phase SECURITY review, SEC-1):
 * venture_resources.resource_identifier is attacker-influenceable -- the same field
 * class stage-20-code-quality.js's isSafeRepoUrl() already treats as untrusted (see
 * that file's :186-192 comment, PR #3450). This module stores the identifier as an
 * "owner/repo" GitHub shorthand (not a full URL, per resolveVentureGithubRepo's own
 * callers/tests), so it needs its own strict allowlist rather than reusing
 * isSafeRepoUrl() directly: exactly one "/", each side matching GitHub's own
 * username/repo character rules, nothing else. A crafted value containing extra
 * "/", "?", "&", or "=" characters -- e.g. one embedding a second workflow path and
 * query string -- is REJECTED here, closing the vector where such a value redirects
 * the GitHub Actions runs URL built below to an attacker-chosen workflow file.
 */
const SAFE_REPO_SHORTHAND_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9_.-]{1,100}$/;
// A LOW-severity residual from SECURITY's post-fix re-review: the repo half of
// SAFE_REPO_SHORTHAND_RE allows an all-dots segment (e.g. "owner/.."), which
// normalizes out a path segment and (measured live) 404s against api.github.com
// rather than substituting a workflow -- not exploitable, but closing it by
// construction is strictly better than relying on the upstream 404.
const ALL_DOTS_RE = /^\.+$/;
export function isSafeRepoShorthand(repo) {
  if (typeof repo !== 'string' || repo.length > 140) return false;
  if (!SAFE_REPO_SHORTHAND_RE.test(repo)) return false;
  const repoSegment = repo.slice(repo.indexOf('/') + 1);
  if (ALL_DOTS_RE.test(repoSegment)) return false;
  return true;
}

/**
 * @returns {Promise<{ok: boolean, repo?: string, reason?: string}>}
 */
export async function resolveVentureGithubRepo({ supabase, ventureId, logger = moduleLogger }) {
  if (!supabase || !ventureId) {
    return { ok: false, reason: 'missing_supabase_or_ventureId' };
  }
  // SEC-2: filter to the active resource and deterministically pick the most recent
  // one -- venture_resources allows multiple rows of the same (venture_id,
  // resource_type) over time (re-provisioning leaves prior rows as
  // cleaned/failed/orphaned rather than deleting them), so an unfiltered,
  // unordered .maybeSingle() either errors on >1 row or nondeterministically picks a
  // stale one. Mirrors the identical, already-reviewed pattern at
  // stage-20-code-quality.js:742-749.
  const { data, error } = await supabase
    .from('venture_resources')
    .select('resource_identifier')
    .eq('venture_id', ventureId)
    .eq('resource_type', 'github_repo')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logger?.warn?.(`[StackScanReader] venture_resources read error: ${error.message}`);
    return { ok: false, reason: 'venture_resources_read_error' };
  }
  if (!data?.resource_identifier) {
    return { ok: false, reason: 'no_venture_resources_github_repo_record' };
  }
  if (!isSafeRepoShorthand(data.resource_identifier)) {
    logger?.warn?.(`[StackScanReader] rejected malformed resource_identifier for venture ${ventureId}`);
    return { ok: false, reason: 'unsafe_repo_identifier' };
  }
  return { ok: true, repo: data.resource_identifier };
}

/**
 * Reads the most recent completed run of stack-scan.yml on the venture repo's
 * main branch, and that run's own conclusion -- never falls back to "any recent
 * workflow run" the way the dead fetchLatestWorkflowRun does, so a failing
 * stack-scan can never be silently swallowed behind an unrelated passing workflow.
 * @param {{supabase: object, ventureId: string, token?: string, fetchImpl?: Function, logger?: object}} params
 * @returns {Promise<{available: boolean, reason?: string, conclusion?: string, runId?: number, checkedAt?: string}>}
 */
export async function readStackScanConclusion({
  supabase, ventureId, token = process.env.GITHUB_TOKEN, fetchImpl = fetch, logger = moduleLogger,
}) {
  const repoResult = await resolveVentureGithubRepo({ supabase, ventureId, logger });
  if (!repoResult.ok) {
    return { available: false, reason: repoResult.reason };
  }
  if (!token) {
    return { available: false, reason: 'no_github_token_configured' };
  }

  try {
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    const url = `${GITHUB_API_BASE}/repos/${repoResult.repo}/actions/workflows/${STACK_SCAN_WORKFLOW_FILE}/runs?branch=main&status=completed&per_page=1`;
    const res = await fetchImpl(url, { headers });
    if (!res.ok) {
      return { available: false, reason: `github_api_error_${res.status}` };
    }
    const body = await res.json();
    const run = body.workflow_runs?.[0];
    if (!run) {
      return { available: false, reason: 'no_completed_stack_scan_run' };
    }
    return { available: true, conclusion: run.conclusion, runId: run.id, checkedAt: new Date().toISOString() };
  } catch (err) {
    logger?.warn?.(`[StackScanReader] fetch threw: ${err.message}`);
    return { available: false, reason: `fetch_error: ${err.message}` };
  }
}

export { STACK_SCAN_WORKFLOW_FILE };
