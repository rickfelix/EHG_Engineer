/**
 * ship-review-findings-populator — post-success hook on LEAD-FINAL-APPROVAL.
 *
 * SD-LEO-INFRA-PR-TRACKING-BACKFILL-001 (FR-2)
 *
 * On SD completion, looks up the most-recent merged PR for the SD's branch
 * via `gh pr list --state merged --head <branch>` and inserts a row into
 * `ship_review_findings` tagged as a canonical-join entry. Failures are
 * logged + recorded to `audit_log` but NEVER block SD completion.
 *
 * Kill-switch: set env LEO_SHIP_REVIEW_POPULATOR_OFF=1 to disable globally.
 */

import { execSync } from 'node:child_process';
import { probeRepoColumnExists, normalizeGithubRepo } from '../../../../../../lib/ship/repo-column-probe.mjs';

const KILL_SWITCH = 'LEO_SHIP_REVIEW_POPULATOR_OFF';

/**
 * Resolve the SD's git branch from common SD record shapes.
 *
 * @param {object} sd
 * @returns {string|null}
 */
function resolveBranch(sd) {
  return sd?.feature_branch || sd?.branch || sd?.metadata?.branch || null;
}

/**
 * Look up the most recent merged PR for a branch (across both repos by default).
 *
 * Returns { pr_number, mergedAt } or null when none found.
 * The optional `fetcher` is a test seam.
 */
export function fetchLatestMergedPR(branch, repos = ['rickfelix/EHG_Engineer', 'rickfelix/ehg'], fetcher = defaultFetcher) {
  if (!branch) return null;
  for (const repo of repos) {
    try {
      const result = fetcher(repo, branch);
      if (result && Number.isFinite(result.pr_number)) return { ...result, repo };
    } catch {
      /* try next repo */
    }
  }
  return null;
}

function defaultFetcher(repo, branch) {
  const cmd = `gh pr list --repo ${repo} --state merged --head ${branch} --limit 1 --json number,mergedAt,mergeCommit`;
  const raw = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 });
  const arr = JSON.parse(raw);
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return { pr_number: arr[0].number, mergedAt: arr[0].mergedAt || null };
}

/**
 * Run the populator. Always resolves; never re-throws.
 *
 * @param {object} sd - SD record (must have sd_key + branch info).
 * @param {object} supabase - Supabase service-role client.
 * @returns {Promise<{outcome: string, detail?: string}>}
 */
export async function runShipReviewFindingsPopulator(sd, supabase) {
  if (process.env[KILL_SWITCH] === '1') {
    return { outcome: 'disabled' };
  }
  if (!sd?.sd_key) {
    return { outcome: 'skip', detail: 'no sd_key' };
  }
  const branch = resolveBranch(sd);
  if (!branch) {
    return { outcome: 'skip', detail: 'no branch on SD record' };
  }

  let prInfo;
  try {
    prInfo = fetchLatestMergedPR(branch);
  } catch (err) {
    await recordWarning(supabase, sd, 'gh_lookup_error', err?.message || String(err));
    return { outcome: 'gh_error', detail: err?.message };
  }
  if (!prInfo) {
    return { outcome: 'no_pr_found', detail: branch };
  }

  const row = {
    sd_key: sd.sd_key,
    pr_number: prInfo.pr_number,
    branch,
    verdict: 'backfill_canonical_join',
    review_tier: 'canonical_join',
    risk_score: 0,
    finding_count: 0,
    finding_categories: {},
    reviewed_at: prInfo.mergedAt || new Date().toISOString(),
    multi_agent: false,
  };
  // SD-APEXNICHE-AI-LEO-GEN-WITNESS-LOOKUP-DURABLE-001 FR-5: prInfo.repo is
  // already resolved by fetchLatestMergedPR; thread it in once the
  // chairman-gated column exists (never breaks the insert if not).
  if (prInfo.repo && await probeRepoColumnExists(supabase)) {
    row.repo = normalizeGithubRepo(prInfo.repo);
  }
  try {
    const { error } = await supabase.from('ship_review_findings').insert(row);
    if (error) {
      if (error.code === '23505') {
        return { outcome: 'duplicate', detail: `pr=${prInfo.pr_number}` };
      }
      await recordWarning(supabase, sd, 'insert_error', `${error.code}: ${error.message}`);
      return { outcome: 'insert_error', detail: error.message };
    }
    return { outcome: 'inserted', detail: `pr=${prInfo.pr_number}` };
  } catch (err) {
    await recordWarning(supabase, sd, 'unexpected_error', err?.message || String(err));
    return { outcome: 'unexpected_error', detail: err?.message };
  }
}

/**
 * Best-effort audit_log write — fire-and-forget but FAIL-LOUD on error.
 * SD-LEO-FIX-FIX-PHANTOM-COLUMN-001: the original payload wrote phantom columns
 * (action/sd_id/sd_key/details do not exist on audit_log) so PostgREST 42703'd every
 * call and the swallow hid it — this LEAD-FINAL audit trail never persisted a row.
 * Remapped to the real shape (QF-20260509-AUDIT-LOG-SHAPE canon: event_type/entity_type/
 * entity_id/severity/metadata), original keys preserved inside metadata.
 */
async function recordWarning(supabase, sd, reasonCode, message) {
  const payload = {
    event_type: 'ship_review_findings_populator_failed',
    entity_type: 'strategic_directive',
    entity_id: sd.sd_key || sd.id || null,
    severity: 'warning',
    metadata: { sd_id: sd.id || null, sd_key: sd.sd_key || null, reason_code: reasonCode, message },
  };
  try {
    const { error } = await supabase.from('audit_log').insert(payload);
    if (error) {
      const { logAuditWriteFailure } = await import('../../../../../../lib/audit-write-guard.js');
      logAuditWriteFailure('ship-review-findings-populator', error, payload);
    }
  } catch (err) {
    try {
      const { logAuditWriteFailure } = await import('../../../../../../lib/audit-write-guard.js');
      logAuditWriteFailure('ship-review-findings-populator', err, payload);
    } catch { /* guard must never break the hook */ }
  }
}

export default { runShipReviewFindingsPopulator, fetchLatestMergedPR };
