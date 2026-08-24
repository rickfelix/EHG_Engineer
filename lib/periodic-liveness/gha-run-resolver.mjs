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
  // QF-20260824-373: maxPages was 5 (500 runs). With ~30 gha_cron:* workflows spanning 5min-30day
  // cadences sharing this one repo-wide event=schedule feed, the busiest workflows (5-15min) can
  // exhaust 500 runs in well under 24h, aging out the exact overnight-throttle evidence
  // observedGapStats() needs to keep a self-adjusting floor accurate. 10 pages (1000 runs) buys
  // headroom to reliably span a full day even on a fleet this dense.
  const { perPage = 100, maxPages = 10, fetchImpl = fetch } = opts;
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
 * PURE: reduce a flat runs[] array down to the single most-recent COMPLETED run per workflow
 * filename (run.path.split('/').pop()), compared by created_at descending.
 *
 * QF-20260823-374: skips runs that haven't finished yet (conclusion still null -- GitHub sets
 * conclusion only once status reaches 'completed'). Without this, the watcher's OWN in-flight
 * invocation -- present in the very API response its own resolver call fetches, since it is
 * mid-execution while making that call -- always has the most recent created_at and a null
 * conclusion, so it permanently shadows the workflow's actual last-completed (successful) run.
 * Every OTHER gha_cron:* row is unaffected (their latest entry is always already completed by
 * the time this watcher's cycle observes it); only a workflow observing ITS OWN concurrent run
 * hits this race.
 */
export function latestRunPerWorkflow(runs) {
  const latest = new Map();
  for (const run of runs) {
    if (run.conclusion == null) continue; // still queued/in_progress -- not yet a real verdict
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
 * PURE: for each workflow file, the largest gap (ms) observed between consecutive SUCCESSFUL
 * runs' timestamps across the full fetched run history (not just the single latest run).
 *
 * QF-20260824-373: periodic-liveness-watcher.mjs's GHA_GRACE_MULTIPLIER_FLOOR was a single
 * hand-measured constant from one daytime incident (23-30min gaps on a declared 5-minute-cadence
 * workflow).
 * Overnight GitHub scheduler throttling produces WORSE gaps (45-73min observed) that still
 * breach a fixed floor -- the class recurred after its own fix shipped. This makes the floor
 * self-adjust from whatever history the watcher already fetches every cycle, so it never again
 * needs a manual constant bump when GitHub throttles further than today's worst case.
 */
export function observedGapStats(runs) {
  const byFile = new Map();
  for (const run of runs) {
    if (run.conclusion !== 'success') continue; // a failed/cancelled run is not cadence evidence
    const file = run.path?.split('/').pop();
    if (!file) continue;
    const ts = Date.parse(run.run_started_at || run.created_at);
    if (!Number.isFinite(ts)) continue;
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(ts);
  }
  const stats = new Map();
  for (const [file, timestamps] of byFile) {
    timestamps.sort((a, b) => a - b);
    let maxGapMs = 0;
    for (let i = 1; i < timestamps.length; i++) {
      maxGapMs = Math.max(maxGapMs, timestamps[i] - timestamps[i - 1]);
    }
    stats.set(file, { maxGapMs, sampleCount: timestamps.length });
  }
  return stats;
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
