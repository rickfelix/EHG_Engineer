/**
 * GitHub Actions run resolver for gha_cron:* periodic_process_registry rows
 * (SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001, FR-2).
 *
 * Splits IO (fetchScheduledRuns) from pure mapping (latestRunPerWorkflow /
 * classifyGhaCronRows) so the resolver logic is unit-testable without a live GitHub API call
 * (TESTING sub-agent pre-EXEC FINDING-C). Mirrors the proven API-call/auth pattern already used
 * in scripts/archive/one-time/monitor-scheduled-jobs.js (GET with Authorization: Bearer <token>,
 * run.path.split('/').pop() for the bare workflow filename) rather than re-deriving it.
 */

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * IO: fetch scheduled workflow runs for a repo, paginated.
 *
 * @param {string} repo - "owner/name"
 * @param {string} token - GitHub token (Bearer auth)
 * @param {{perPage?: number, maxPages?: number, fetchImpl?: typeof fetch}} [opts]
 * @returns {Promise<object[]>} raw GitHub workflow_runs entries
 */
export async function fetchScheduledRuns(repo, token, opts = {}) {
  const { perPage = 100, maxPages = 5, fetchImpl = fetch } = opts;
  const runs = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = `${GITHUB_API_BASE}/repos/${repo}/actions/runs?event=schedule&per_page=${perPage}&page=${page}`;
    const resp = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!resp.ok) {
      throw new Error(`GitHub API error: ${resp.status} ${resp.statusText}`);
    }
    const data = await resp.json();
    const batch = data.workflow_runs || [];
    runs.push(...batch);
    if (batch.length < perPage) break;
  }
  return runs;
}

/**
 * PURE: reduce a flat runs[] array down to the single most-recent run per workflow filename
 * (run.path.split('/').pop()), compared by created_at descending.
 *
 * @param {object[]} runs
 * @returns {Map<string, object>} workflow filename -> latest run
 */
export function latestRunPerWorkflow(runs) {
  const latest = new Map();
  for (const run of runs) {
    const file = run.path?.split('/').pop();
    if (!file) continue;
    const existing = latest.get(file);
    if (!existing || new Date(run.created_at) > new Date(existing.created_at)) {
      latest.set(file, run);
    }
  }
  return latest;
}

/**
 * PURE: map each gha_cron:* registry process_key to a stamp decision, using the latest known
 * run for its workflow file.
 *
 * @param {Map<string, object>} latestByFile - output of latestRunPerWorkflow()
 * @param {string[]} processKeys - e.g. ['gha_cron:foo.yml', 'gha_cron:bar.yml']
 * @returns {Array<{processKey: string, decision: 'stamp'|'overdue'|'no_data', ranAtIso?: string}>}
 */
export function classifyGhaCronRows(latestByFile, processKeys) {
  return processKeys.map((processKey) => {
    const file = processKey.startsWith('gha_cron:') ? processKey.slice('gha_cron:'.length) : processKey;
    const run = latestByFile.get(file);
    if (!run) {
      return { processKey, decision: 'no_data' };
    }
    if (run.conclusion === 'success') {
      return { processKey, decision: 'stamp', ranAtIso: run.run_started_at || run.created_at };
    }
    // Latest SCHEDULED run did not succeed (failure/cancelled/timed_out/etc) -- a failing or
    // stuck cron is as dead as a missing one (FR-2 acceptance criteria).
    return { processKey, decision: 'overdue', ranAtIso: run.run_started_at || run.created_at };
  });
}
