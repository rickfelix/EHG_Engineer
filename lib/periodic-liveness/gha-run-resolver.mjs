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
 * PURE: the [oldest, newest] created_at timestamps in a fetched runs batch, for forensic
 * logging every cycle (SD-LEO-FIX-GHA-CRON-LIVENESS-001) -- its prior absence is why the
 * stale-batch defect below needed production-log archaeology to diagnose at all.
 * @param {object[]} runs
 * @returns {{oldest: string|null, newest: string|null}}
 */
export function batchTimeRange(runs) {
  if (!runs || runs.length === 0) return { oldest: null, newest: null };
  const times = runs.map((r) => r.created_at).filter(Boolean).sort();
  return { oldest: times[0] ?? null, newest: times[times.length - 1] ?? null };
}

/**
 * PURE: is this fetched runs batch trustworthy enough to stamp from?
 *
 * SD-LEO-FIX-GHA-CRON-LIVENESS-001 -- MEASURED (production log forensics, 2026-08-31): the
 * GitHub Actions "list runs" API occasionally (observed ~3% of samples) returns HTTP 200 with a
 * fully-formed but STALE batch (a distinct ETag from fresh responses -- a genuinely different
 * backend replica, not a client-side cache), sometimes by MORE than a month. Every downstream
 * consumer (classifyGhaCronRows/shouldStampDecision/stampFromGithubActionsRun/the
 * self-adjusting grace floor) trusted that batch as ground truth, so a single stale fetch
 * silently degraded EVERY gha_cron:* row's classification for that cycle -- explaining the
 * "many unrelated rows aging in lockstep" symptom this SD was filed against (one bad fetch,
 * not N independent failures).
 *
 * This is a BATCH-LEVEL assertion, deliberately not a per-row lockstep detector: TESTING
 * evidence found this repo's 124 gha_cron workflows genuinely deliver 5-9h apart regardless of
 * declared cadence (GitHub's own scheduling jitter, not a defect), so unrelated rows aging in
 * unison is the NORMAL case here and a lockstep-pattern detector would false-positive
 * continuously. Checking freshness at the fetch itself, before any row is touched, has no such
 * false-positive surface.
 *
 * @param {object[]} runs - raw fetchScheduledRuns() output
 * @param {number} nowMs
 * @param {number} [maxStaleMs=20*60*1000] - 20min: comfortably above this repo's measured
 *   normal newest-entry age (seconds, given ~50k+ total scheduled runs) yet far below the
 *   smallest real gha_cron interval (5min declared / hours actually delivered), so a genuinely
 *   fresh batch never trips this and a stale-replica batch (minutes to months old) always does.
 * @returns {{fresh: boolean, newestAgeMs: number|null}}
 */
export function isBatchFresh(runs, nowMs, maxStaleMs = 20 * 60 * 1000) {
  const { newest } = batchTimeRange(runs);
  if (!newest) return { fresh: false, newestAgeMs: null };
  const newestAgeMs = nowMs - Date.parse(newest);
  return { fresh: newestAgeMs <= maxStaleMs, newestAgeMs };
}

/**
 * PURE: map each gha_cron:* registry process_key to a stamp decision, using the latest known
 * run for its workflow file.
 *
 * QF-20260901-308: ONE conclusion rule, used identically by this decision AND by
 * shouldStampDecision below (they previously disagreed: this function read skipped/cancelled as
 * OVERDUE while the stamp path already treated them as observed proof-of-run, producing false
 * OVERDUE lines on the fleet dashboard for a cron GitHub itself chose to skip/cancel, e.g. a
 * concurrency-group supersede). failure/timed_out are genuine dead-cron evidence (overdue);
 * skipped/cancelled are NOT -- the schedule fired and GitHub Actions made an infra-level decision
 * not to run the job body, which says nothing about whether the underlying process is alive.
 *
 * @param {Map<string, object>} latestByFile - output of latestRunPerWorkflow()
 * @param {string[]} processKeys - e.g. ['gha_cron:foo.yml', 'gha_cron:bar.yml']
 * @returns {Array<{processKey: string, decision: 'stamp'|'overdue'|'unverified_skipped'|'no_data', ranAtIso?: string}>}
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
    if (run.conclusion === 'skipped' || run.conclusion === 'cancelled') {
      return { processKey, decision: 'unverified_skipped', ranAtIso: run.run_started_at || run.created_at };
    }
    // failure/timed_out/etc -- a genuinely failing or stuck cron is as dead as a missing one
    // (FR-2 acceptance criteria).
    return { processKey, decision: 'overdue', ranAtIso: run.run_started_at || run.created_at };
  });
}

/**
 * PURE: QF-20260830-795 -- residual of QF-20260830-694, extended by QF-20260901-308. A run that
 * CONCLUDES (success, failure, OR a skipped/cancelled infra decision) is an OBSERVED fact and
 * must stamp last_fired_at; only 'no_data' (this cycle's fetch found no run for the workflow at
 * all) has nothing to stamp. Before QF-20260830-795, only 'stamp' called
 * stampFromGithubActionsRun -- a failing/cancelled scheduled run left last_fired_at untouched
 * forever, making "ran and failed" indistinguishable from "never ran" on the row itself (last_state
 * alone showed OVERDUE either way, but the row's own timestamp stayed null/stale).
 * @param {{decision: 'stamp'|'overdue'|'unverified_skipped'|'no_data', ranAtIso?: string}} classified
 * @returns {boolean}
 */
export function shouldStampDecision({ decision, ranAtIso } = {}) {
  return (decision === 'stamp' || decision === 'overdue' || decision === 'unverified_skipped') && !!ranAtIso;
}
