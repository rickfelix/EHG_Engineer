/**
 * Ship-witness adoption: identity-matched unwitnessed-merge detection + N-day readiness gauge.
 *
 * SD-LEO-INFRA-SHIP-WITNESS-ENFORCE-001 (Ship-witness D). Consumes merge_witness_telemetry
 * (Ship-witness A, read-only) to answer two questions: (1) did any platform-repo merge since the
 * witness substrate went live have ZERO telemetry row at all — a WATCH-HOLE, observe skipped
 * entirely, not merely recorded-and-allowed (SD description's own contract)? (2) has adoption
 * been 100%-via-witness for enough consecutive days to make an eventual enforce-flip safe?
 * Neither function here flips anything — this module only measures. Matching uses (repo,
 * pr_number) IDENTITY, never a raw count comparison (the red-merge-detector count-vs-identity
 * lesson, scripts/ci/red-merge-detector.mjs).
 */

// merge_witness_telemetry wiring went live in production /ship at PR #5415's merge
// (SD-LEO-INFRA-SHIP-WITNESS-APPLICATIONS-001, 2026-07-03T03:37:35Z). Merges before this instant
// were never observable — counting them as unwitnessed would produce a permanent false floor, not
// a real signal, so they are excluded rather than penalized.
export const WITNESS_CUTOVER_ISO = '2026-07-03T03:37:35Z';

export const PLATFORM_REPOS = [
  { owner: 'rickfelix', name: 'ehg' },
  { owner: 'rickfelix', name: 'EHG_Engineer' },
];

/**
 * Default evidence-fetch: merged PRs for a platform repo since a given ISO timestamp, via gh CLI.
 * Injectable — every caller in this module accepts a fetch override for deterministic tests.
 */
export function defaultFetchMergedPlatformPRs(repoOwner, repoName, sinceIso, runner) {
  const search = `merged:>=${sinceIso.slice(0, 10)}`;
  const r = runner(['pr', 'list', '--repo', `${repoOwner}/${repoName}`, '--state', 'merged', '--search', search, '--json', 'number,mergedAt', '--limit', '200']);
  if (r.code !== 0) return [];
  try {
    const parsed = JSON.parse(r.stdout.trim() || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((p) => ({ repo: `${repoOwner}/${repoName}`.toLowerCase(), prNumber: p.number, mergedAt: p.mergedAt }))
      .filter((m) => m.mergedAt >= sinceIso);
  } catch {
    return [];
  }
}

/**
 * Pure: true if a telemetry row has been marked invalidated (a synthetic `id: 'INVALIDATED'`
 * rung entry — QF-20260703-979). Invalidated rows are PRESERVED as specimens in
 * merge_witness_telemetry, never deleted, but must be excluded from adoption/readiness
 * computations so a known-false verdict (e.g. a P5 pass on a PR that was not actually merged
 * yet at evaluation time) is never credited as witness coverage.
 */
export function isInvalidated(telemetryRow) {
  return Array.isArray(telemetryRow?.rungs) && telemetryRow.rungs.some((r) => r?.id === 'INVALIDATED');
}

/**
 * QF-20260719-201: fetch ALL merge_witness_telemetry rows with explicit pagination.
 * The previous bare `.select('repo, pr_number')` in the three readers (gauge-runner,
 * ship-witness-reconcile, ship-witness-enforce-readiness) silently truncated at
 * PostgREST's default 1000-row limit: the moment the table crossed 1000 rows
 * (2026-07-19 ~13:04Z) every NEWER row became invisible to the readers while the
 * writers kept inserting — the writer/reader asymmetry that read six freshly-merged
 * PRs (6277–6282) as unwitnessed and made the reconcile sweep re-backfill duplicate
 * rows hourly (which only grew the table and worsened the truncation). Ordered by id
 * so pages are stable; selects rungs too so isInvalidated() operates on real data.
 */
export async function fetchAllWitnessRows(supabase, { pageSize = 1000, select = 'repo, pr_number, rungs' } = {}) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('merge_witness_telemetry')
      .select(select)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error('merge_witness_telemetry query failed: ' + error.message);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

/** Pure: IDENTITY-match (repo, prNumber) merges against telemetry rows. Never a raw count diff. */
export function classifyMerges(merges, telemetryRows) {
  const validRows = (telemetryRows || []).filter((t) => !isInvalidated(t));
  const witnessedKeys = new Set(validRows.map((t) => `${(t.repo || '').toLowerCase()}#${t.pr_number}`));
  return (merges || []).map((m) => ({
    ...m,
    witnessed: witnessedKeys.has(`${m.repo.toLowerCase()}#${m.prNumber}`),
  }));
}

// QF-20260704-403: witness rows land within ~a minute of merge (a normal write race, not a
// gap) — without a grace window, the gauge counted merges caught mid-race as unwitnessed and
// false-tripped (evidence 2026-07-04: tripped twice, both times the unwitnessed array read []
// on immediate re-query). Excludes merges younger than graceMs from the count/unwitnessed
// array; `total` stays the full classified count (informational, not grace-filtered).
// QF-20260719-986: 5 min proved too tight under merge waves — tripped twice on 2026-07-19
// (12:07 count=4, 13:04 count=9), both self-clearing on re-run, costing two coordinator
// investigations. The async witness pipeline (incl. the gauge-runner's own same-pass
// reconcile sweep) can lag well past 5 min during a wave; 15 min bounds the observed lag
// class while still catching real gaps within a single gauge cadence.
export const DEFAULT_GRACE_MS = 15 * 60 * 1000;

/** Pure: WATCH-HOLE detector shaped for gauge-registry's {count,...} convention. */
export function detectUnwitnessedMerges(merges, telemetryRows, { graceMs = DEFAULT_GRACE_MS, now = Date.now() } = {}) {
  const classified = classifyMerges(merges, telemetryRows);
  const cutoff = now - graceMs;
  const unwitnessed = classified.filter((m) => !m.witnessed && Date.parse(m.mergedAt) < cutoff);
  return { count: unwitnessed.length, total: classified.length, unwitnessed };
}

/** Pure: groups classified merges by UTC calendar day (YYYY-MM-DD). */
function groupByDay(classifiedMerges) {
  const byDay = new Map();
  for (const m of classifiedMerges) {
    const day = m.mergedAt.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(m);
  }
  return byDay;
}

/**
 * Pure: N-consecutive-day 100%-via-witness readiness. Walks backward from `today` (an injectable
 * YYYY-MM-DD, real Date.now() only as the default). A day with zero merges is SKIPPED — it
 * neither breaks nor extends the streak, since readiness requires actual evidence, not silence.
 * A day with any unwitnessed merge resets the streak (stops the walk). ready=true only once
 * requiredConsecutiveDays evidenced days have accumulated with no reset in between.
 *
 * @param {{merges: Array, telemetryRows: Array, requiredConsecutiveDays?: number, today?: string, lookbackDays?: number}} params
 */
export function computeAdoptionReadiness({
  merges,
  telemetryRows,
  requiredConsecutiveDays = 7,
  today = new Date().toISOString().slice(0, 10),
  lookbackDays = 60,
}) {
  const classified = classifyMerges(merges, telemetryRows);
  const byDay = groupByDay(classified);
  const dailyBreakdown = [];
  let consecutiveDays = 0;
  let ready = false;

  const todayDate = new Date(`${today}T00:00:00Z`);
  for (let i = 0; i < lookbackDays; i++) {
    const d = new Date(todayDate);
    d.setUTCDate(d.getUTCDate() - i);
    const dayStr = d.toISOString().slice(0, 10);
    const dayMerges = byDay.get(dayStr) || [];
    if (dayMerges.length === 0) continue; // skip: no evidence either way, doesn't affect streak

    const dayUnwitnessed = dayMerges.filter((m) => !m.witnessed).length;
    dailyBreakdown.push({ day: dayStr, total: dayMerges.length, unwitnessed: dayUnwitnessed });
    if (dayUnwitnessed > 0) break; // a real gap — stop walking, streak resets to what we've counted so far minus this

    consecutiveDays += 1;
    if (consecutiveDays >= requiredConsecutiveDays) { ready = true; break; }
  }

  return {
    ready,
    consecutiveDays,
    dailyBreakdown,
    reason: ready
      ? `${consecutiveDays} consecutive evidenced day(s) at 100%-via-witness`
      : `only ${consecutiveDays}/${requiredConsecutiveDays} consecutive evidenced day(s) at 100%-via-witness`,
  };
}
