#!/usr/bin/env node
/**
 * Trend-Eyes SWEEP — SD-LEO-INFRA-TREND-EYES-OFF-001 FR-1/FR-5/FR-6.
 *
 * OFF-SEAT EYES. This runs on a GHA cron, not on a seat. The motivating case is the 2026-08-04
 * 13-hour freeze: GHA crons kept firing while every seat-tick duty died, so nothing accumulated.
 * It SCANS and writes candidates; it never judges, never promotes, never messages the chairman,
 * and gates nothing. Solomon's seat grades the candidates later on its existing crons.
 *
 * THE FILENAME IS LOAD-BEARING. This was going to be trend-eyes-scan.mjs. The invocation
 * classifier is NAME-KEYED — lib/invocation-detector/requires-invocation.js:26 matches
 * -(loop|cron|sweep|sweeper|daemon|worker|autotriage) and :23 matches only cron/clockwork dirs —
 * so a "-scan.mjs" here would have been invisible to INVOCATION_PATH_PROOF, the exact blind spot
 * that let scripts/eva/eva-trend-snapshot.mjs and scripts/eva/trend-detector.mjs ship unwired
 * under COMPLETED SDs. tests/unit/solomon/trend-eyes-probes.test.js asserts both directions.
 *
 * PURE/IO SPLIT: every decision lives in lib/solomon/trend-eyes-probes.js and is unit-testable
 * without a database. This file only fetches facts and writes rows.
 *
 * AUTH: supabase-js + service-role ONLY. SUPABASE_POOLER_URL is injected into ZERO cron workflows
 * in this repo and is silently undefined on a GHA runner, so there is no pg/DATABASE_URL path.
 */
import { createClient } from '@supabase/supabase-js';
import { readChairmanSmsExchanges } from '../../lib/solomon/chairman-sms-exchanges.js';
import { runTrendEyesProbes, VERDICT } from '../../lib/solomon/trend-eyes-probes.js';
import { TREND_EYES_RECEIPT_DIMENSION } from '../../lib/solomon/trend-eyes-liveness.js';
import { emitFeedback } from '../../lib/governance/emit-feedback.js';

export const CANDIDATE_CATEGORY = 'solomon_trend_candidate';
/** Daily sweep; the SMS window is deliberately wider so a 24h+ repeat is visible at all. */
export const SMS_WINDOW_HOURS = 168;
/** T2 must reach back past the session_coordination retention horizon — see resolveT2Facts. */
export const LESSON_WINDOW_DAYS = 120;
/** Exploration floor: the receipt always lists this many raw clusters, even below threshold. */
export const EXPLORATION_TOP_N = 5;
/**
 * Hard cap on candidate rows per run, per trend class.
 *
 * T1 is naturally bounded by the class list and T3 emits one series verdict, but T2 fans out one
 * row per distinct classKey over a 120-day window with nothing bounding it. `feedback` already
 * carries ~19k rows, and dedup is per-day, so an unbounded fan-out on a bad day is a write storm
 * against a shared table. Truncation is REPORTED in the receipt rather than silent — a cap nobody
 * can see reads as "that's all there was".
 */
export const MAX_CANDIDATES_PER_CLASS = 10;

/**
 * Assign a question-class to an inbound chairman message.
 *
 * NEW WORK, NOT REUSE. chairman-sms-exchanges.js:43-46 states its correlation is chronological
 * adjacency per counterpart phone, NOT similarity, and explains why it refuses similarity
 * matching ("a confident mispairing would produce a finding that cites the wrong exchange, which
 * is worse than a gap"). It supplies the bounded lane read and nothing else. This keyword-anchored
 * classifier is deliberately CONSERVATIVE for the same reason: an unmatched message gets its own
 * singleton class rather than being folded into a near neighbour, so the failure mode is a missed
 * repeat (visible in the exploration floor) rather than a fabricated one.
 */
export function questionClass(body) {
  const t = String(body || '').toLowerCase();

  // ORDER-INDEPENDENT, and plurals count. The first cut required subject-then-predicate ORDER in a
  // single regex, so "Are we missing any texts?" scored nothing because "missing" preceded "texts";
  // \btext\b also rejected "texts" and \bworker\b rejected "workers". Measured against the full
  // population of sms_relay_staging (342 rows, all fetched — not a sample): 328 classified to null
  // and were dropped, and of the 97 inbound rows mentioning sms/text/message, ZERO were assigned
  // sms-coverage. T1 could not have fired on the founding case the SD is built around.
  const classes = [
    // The predicate set includes review/history/log/cron because the SD's OWN founding case —
    // "Does Solomon have a CRON job that reviews the SMS message history?" — matched the subject
    // and carried none of the original predicates, so it classified to null. An instrument that
    // cannot see the specimen it was built around is not calibrated, whatever its other coverage.
    ['sms-coverage', /\b(sms|texts?|messages?)\b/, /\b(cover(age|ed|ing)?|reach(ed|ing)?|miss(ed|ing)?|get(ting)? through|deliver(ed|y)?|receiv(e|ed|ing)|review(s|ed|ing)?|histor(y|ies)|logs?|cron)\b/],
    ['belt-depth', /\bbelts?\b/, /\b(depth|deep|empty|dry|starv(ed|ing|ation)?|refill|claimable)\b/],
    ['fleet-liveness', /\b(workers?|seats?|fleets?|sessions?)\b/, /\b(alive|dead|idle|stuck|dormant|quiet|silent|reap(ed)?|working)\b/],
    ['cost-quota', /\b(quotas?|costs?|burn|spend(ing)?|usage|budget)\b/, null],
    ['progress-status', /\b(status|progress|update|where are we|how far|how('s| is) it going)\b/, null],
  ];

  for (const [cls, subject, predicate] of classes) {
    if (!subject.test(t)) continue;
    if (predicate === null || predicate.test(t)) return cls;
  }
  return null;
}

/**
 * Is this an automated message rather than the chairman speaking?
 *
 * MEASURED, and load-bearing: 73 rows across 12 distinct days on the inbound lane are the 80-minute
 * "are you still there" watchdog. Because the whole lane arrives from a single from_phone, nothing
 * upstream distinguishes it from the chairman. Admitting it would hand T1 a guaranteed daily false
 * positive — a repeat-question trend made entirely of a robot repeating itself.
 */
export function isAutomatedMessage(body) {
  const t = String(body || '').toLowerCase();
  return /\bare you still there\b|\bautomated\b|\bwatchdog\b|\bheartbeat\b/.test(t);
}

/** T1 facts: cluster INBOUND chairman messages by question-class. */
export async function resolveT1Facts(supabase, { now, windowHours = SMS_WINDOW_HOURS } = {}) {
  const lane = await readChairmanSmsExchanges(supabase, { windowHours, now });
  const byClass = new Map();
  let inbound = 0;
  let automated = 0;
  let unclassified = 0;

  for (const ex of lane.exchanges) {
    // Inbound only: the chairman ASKING is the signal. An outbound we sent is not his question.
    const m = ex.reply;
    if (!m || m.direction !== 'in') continue;
    inbound++;
    if (isAutomatedMessage(m.body)) { automated++; continue; }
    const cls = questionClass(m.body);
    if (!cls) { unclassified++; continue; }
    if (!byClass.has(cls)) byClass.set(cls, []);
    byClass.get(cls).push({ at: m.at, id: m.id });
  }

  const clusters = [...byClass.entries()].map(([cls, occurrences]) => ({ questionClass: cls, occurrences }));
  // The unclassified COUNT rides along so the run-receipt can show it. An earlier docblock here
  // claimed unmatched messages became singleton classes "visible in the exploration floor"; the
  // code dropped them, and the floor was built only from matched clusters — so the mitigation the
  // comment promised did not exist anywhere. Reporting the tally is the honest version: a
  // classifier that suddenly stops matching shows up as a rising unclassified rate in the receipt
  // series rather than as silence.
  return { clusters, coverage: { inbound, automated, unclassified, classified: inbound - automated - unclassified } };
}

/**
 * T2 facts: lesson-channel classes from retention_archive UNION session_coordination.
 *
 * THE UNION IS THE REQUIREMENT, not an optimisation (LEAD condition C1). session_coordination is a
 * SURVIVOR table — measured 3,725 live rows spanning ~2 weeks, 84% of them from the last 7 days —
 * so a recurrence computed on it alone measures the retention policy rather than anyone's conduct.
 * lib/coordination/answered-rate.cjs:3-8 states the same rule: "READ THE LEDGER, NEVER
 * session_coordination... a survivor-table rate measures the deletion policy rather than anyone's
 * conduct." retention_archive carries the durable history (44,003 rows back to 2026-03-11) via
 * archive-before-delete.
 *
 * `queried` is returned so the resolver test can assert BOTH tables were actually read — the union
 * lives here, so a probe fed pre-unioned facts could never prove it happened.
 */
export async function resolveT2Facts(supabase, { now, windowDays = LESSON_WINDOW_DAYS } = {}) {
  const since = new Date((now?.getTime?.() ?? Date.now()) - windowDays * 86400_000).toISOString();
  const queried = [];

  queried.push('session_coordination');
  const live = await supabase.from('session_coordination')
    .select('id, message_type, payload, created_at').gte('created_at', since);
  if (live.error) throw new Error(`session_coordination read failed: ${live.error.message}`);

  // retention_archive stores the archived row under `row_data`, NOT `payload` — verified against
  // the live table (columns: id, source_table, source_id, row_data, row_timestamp, archived_at,
  // archived_by, run_id). Selecting a phantom column returns PostgREST 42703 and throws, which is
  // how the first cut of this resolver killed every run before a single row was written.
  queried.push('retention_archive');
  const archived = await supabase.from('retention_archive')
    .select('id, source_table, row_data, archived_at').eq('source_table', 'session_coordination').gte('archived_at', since);
  if (archived.error) throw new Error(`retention_archive read failed: ${archived.error.message}`);

  const rows = [
    ...(live.data || []).map((r) => ({ at: r.created_at, payload: r.payload, source: 'session_coordination' })),
    // The archived row nests the original beneath row_data, so the payload is one level deeper.
    ...(archived.data || []).map((r) => ({
      at: r.archived_at, payload: r.row_data?.payload ?? r.row_data, source: 'retention_archive',
    })),
  ];

  const byClass = new Map();
  let classedRows = 0;
  let fixStamped = 0;
  for (const r of rows) {
    const key = r.payload?.lesson_class || r.payload?.signal_type;
    if (!key) continue;
    classedRows++;
    if (!byClass.has(key)) byClass.set(key, { classKey: key, fixedAt: null, occurrences: [] });
    const entry = byClass.get(key);
    entry.occurrences.push({ at: r.at, source: r.source });
    // A fix is whatever the lane itself recorded as shipping for this class. Taking the EARLIEST
    // keeps a later re-fix from masking a recurrence that already happened after the first one.
    const fixedAt = r.payload?.fix_shipped_at;
    if (fixedAt) fixStamped++;
    if (fixedAt && (!entry.fixedAt || fixedAt < entry.fixedAt)) entry.fixedAt = fixedAt;
  }

  // NULL, NOT []. T2's signal is "recurred AFTER its fix", so a corpus in which NOTHING carries a
  // fix_shipped_at cannot answer the question either way. Measured at build time: fix_shipped_at
  // appears in 0 of 3,786 live rows. Returning [] would make the probe emit FLAT — "no class
  // recurred after its fix" — which is a false all-clear produced by an absent field rather than
  // by observation, precisely the failure this instrument exists to detect elsewhere. Returning
  // null routes it to UNKNOWN, and the run-receipt records the reason.
  const blind = classedRows === 0 ? 'no row carried lesson_class or signal_type'
    : fixStamped === 0 ? 'no row carried fix_shipped_at — after-fix recurrence is unanswerable'
      : null;

  return { classes: blind ? null : [...byClass.values()], queried, blind, scanned: rows.length, classedRows };
}

/**
 * T3 facts: the lane-named-classes-reaching-issue_patterns ratio, as daily readings.
 *
 * READS ONLY. Does not write issue_patterns.trend (LEAD condition C2) — that column already has
 * writers: calculate_pattern_trends() in pg_proc (zero callers, over a 0-row pattern_occurrences)
 * and the age-based decay marker at scripts/detect-stale-patterns.js:104-120. A fourth writer
 * would corrupt a column three things already disagree about.
 */
export async function resolveT3Facts(supabase, { now, days = 14 } = {}) {
  const nowMs = now?.getTime?.() ?? Date.now();
  const since = new Date(nowMs - days * 86400_000).toISOString();

  // issue_patterns has NO pattern_name column — verified live; the identifying columns are
  // pattern_id and issue_summary. The phantom name threw 42703 on every run.
  const patterns = await supabase.from('issue_patterns')
    .select('id, pattern_id, issue_summary, created_at').gte('created_at', since);
  if (patterns.error) throw new Error(`issue_patterns read failed: ${patterns.error.message}`);

  const lane = await supabase.from('session_coordination')
    .select('id, payload, created_at').gte('created_at', since);
  if (lane.error) throw new Error(`session_coordination read failed: ${lane.error.message}`);

  const readings = [];
  let windowsWithDenominator = 0;
  for (let d = days - 1; d >= 0; d--) {
    const start = new Date(nowMs - (d + 1) * 86400_000);
    const end = new Date(nowMs - d * 86400_000);
    const inWindow = (ts) => { const t = new Date(ts).getTime(); return t >= start.getTime() && t < end.getTime(); };
    // Numerator and denominator are computed over the SAME [start,end) window, deliberately in one
    // place — a ratio whose halves span different extents still yields a plausible number, and the
    // probe's span guard refuses it rather than reporting a trend built on one.
    const named = (lane.data || []).filter((r) => inWindow(r.created_at) && (r.payload?.lesson_class || r.payload?.signal_type));
    const namedKeys = new Set(named.map((r) => r.payload.lesson_class || r.payload.signal_type));
    if (namedKeys.size === 0) continue;
    windowsWithDenominator++;
    // DISTINCT pattern_ids, not row count. Counting rows let one lane class matched by three
    // issue_patterns rows contribute 3 to a numerator whose denominator counts it once — which
    // produced a ratio of 1.000 where the truth was 0.5.
    const reached = new Set(
      (patterns.data || [])
        .filter((p) => inWindow(p.created_at) && namedKeys.has(p.pattern_id))
        .map((p) => p.pattern_id),
    );
    // NO Math.min CLAMP. Clamping the numerator to its denominator makes the probe's span guard
    // dead code in production — it can then only ever be reached from a test fixture, so the guard
    // that exists to catch a mismatched-extent ratio would never see one in real life. If the two
    // halves genuinely disagree, the probe must SEE that and return UNKNOWN.
    readings.push({
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
      laneNamed: namedKeys.size,
      reachedPatterns: reached.size,
    });
  }

  // ZERO-OVERLAP GUARD — the correspondence T3 assumes may simply not exist.
  //
  // The first cut selected a `pattern_name` column that does not exist, so every run threw. The
  // obvious repair was to swap in `pattern_id`, which PARSES — and that is the trap: it made the
  // query succeed while the numerator became structurally always zero. Measured over 60 days, the
  // lane's class keys are values like 'feedback', 'harness-bug', 'stuck', 'spec-conflict', while
  // issue_patterns.pattern_id holds 'PAT-AUTO-b442fd90'-style synthetic ids. The two vocabularies
  // do not intersect anywhere, by construction rather than by accident.
  //
  // A ratio whose numerator can never be non-zero is not measuring a disjunction — it is reporting
  // its own inability to join, dressed as a finding of total disjunction. Solomon's founding
  // "0-of-12" observation may be exactly this artifact rather than a real gap, which is a question
  // for the PRD and not something a resolver may decide by picking a plausible-looking key.
  // Until a real correspondence is ratified, say UNKNOWN and name why.
  const laneKeyUniverse = new Set();
  for (const r of lane.data || []) {
    const k = r.payload?.lesson_class || r.payload?.signal_type;
    if (k) laneKeyUniverse.add(k);
  }
  const patternKeyUniverse = new Set((patterns.data || []).map((p) => p.pattern_id).filter(Boolean));
  const overlap = [...laneKeyUniverse].filter((k) => patternKeyUniverse.has(k));

  const blind = windowsWithDenominator === 0
    ? 'no window carried a lane-named class — the disjunction ratio has no denominator'
    : overlap.length === 0 && patternKeyUniverse.size > 0
      ? `lane class keys and issue_patterns.pattern_id do not intersect at all (${laneKeyUniverse.size} lane keys vs ${patternKeyUniverse.size} pattern ids, 0 shared) — the ratio would be structurally zero, which measures the absence of a join key rather than a real disjunction`
      : null;

  return { readings: blind ? null : readings, blind, laneKeys: laneKeyUniverse.size, patternKeys: patternKeyUniverse.size, overlap: overlap.length };
}

/** Write one candidate per fired trend. Self-describing: metadata carries the reproducing query. */
// Exported for test. It was private, and its entire purpose — one row per finding, a per-class cap,
// and truncation that announces itself — went unguarded through two review rounds as a result.
export async function writeCandidates(supabase, verdicts, { runAt, dryRun }) {
  const written = [];
  const truncated = [];
  for (const v of verdicts) {
    if (v.verdict !== VERDICT.FIRE) continue;
    const all = Array.isArray(v.evidence) ? v.evidence : [v.evidence];
    const items = all.slice(0, MAX_CANDIDATES_PER_CLASS);
    // Never silently drop: a cap that does not announce itself makes a truncated run
    // indistinguishable from a small one.
    if (all.length > items.length) truncated.push({ trigger: v.trigger, found: all.length, written: items.length });
    for (const [i, ev] of items.entries()) {
      // dedup_key must differ per finding: emit-feedback hashes today::description::dedup_key, so
      // a shared key would collapse same-day findings of one class into a single row.
      const dedupKey = `${v.trigger}::${ev?.questionClass || ev?.classKey || 'series'}::${runAt.slice(0, 10)}::${i}`;
      if (dryRun) { written.push({ dryRun: true, dedupKey }); continue; }
      const res = await emitFeedback({
        supabase,
        title: `Trend candidate: ${v.trigger}`,
        description: `${v.detail}\n\nUNGRADED CANDIDATE — Solomon's seat grades and may promote this. Not a finding.`,
        type: 'issue',
        category: CANDIDATE_CATEGORY,
        severity: 'medium',
        source_application: 'EHG_Engineer',
        source_type: 'auto_capture',
        dedup_key: dedupKey,
        metadata: { trigger: v.trigger, evidence: ev, run_at: runAt, graded: false, sd: 'SD-LEO-INFRA-TREND-EYES-OFF-001' },
      });
      written.push({ dedupKey, result: res });
    }
  }
  // Returned as a pair rather than as a property bolted onto the array: an array property survives
  // .length but is silently lost by any spread or .map(), so a later refactor could drop the
  // truncation record while every test still passed — the cap would go quiet again.
  return { written, truncated: truncated.length ? truncated : null };
}

/**
 * The run-receipt. Written on EVERY execution including empty ones — that is the whole point.
 * "No candidates" and "the sweep died three weeks ago" are otherwise identical from outside.
 * Carries a routing tally so dedup-suppressed-everything stays distinguishable from broke, and an
 * exploration floor (top-N raw clusters even below threshold) so a narrowing of the instrument's
 * own vision is visible in the receipt series rather than silently converging.
 */
async function writeReceipt(supabase, { verdicts, candidates, truncated, exploration, runAt, dryRun, coverage, blindness }) {
  const findings = [{
    ran_at: runAt,
    verdicts: verdicts.map((v) => ({ trigger: v.trigger, verdict: v.verdict, detail: v.detail })),
    candidates_written: candidates.length,
    unknown_count: verdicts.filter((v) => v.verdict === VERDICT.UNKNOWN).length,
    exploration_floor: exploration,
    // Classifier coverage as a standing series. A drop in `classified` (or a climb in
    // `unclassified`) means the instrument's vision narrowed — visible here rather than showing up
    // as an unexplained quiet spell.
    classifier_coverage: coverage || null,
    // Why a class could not answer, when it could not. Named blindness beats a silent FLAT.
    blindness: blindness && blindness.length ? blindness : null,
    // What the per-class cap dropped, if anything. A silent cap reads as "that's all there was".
    truncated: truncated || null,
  }];
  if (dryRun) return { dryRun: true, findings };
  const { error } = await supabase.from('codebase_health_snapshots').insert({
    dimension: TREND_EYES_RECEIPT_DIMENSION,
    target_application: 'EHG_Engineer',
    score: verdicts.some((v) => v.verdict === VERDICT.UNKNOWN) ? 50 : 100,
    findings,
    trend_direction: 'stable',
    metadata: { source: 'trend-eyes-sweep.mjs', sd: 'SD-LEO-INFRA-TREND-EYES-OFF-001' },
  });
  // Non-fatal, matching gauge-runner: a receipt failure must not lose the candidates already written.
  if (error) console.warn(`   receipt write failed (non-fatal): ${error.message}`);
  return { findings };
}

/**
 * Convert resolver output into the probe's facts bundle.
 *
 * EXTRACTED SO IT CAN BE TESTED. This one line is where the entire blindness fix is DELIVERED:
 * the resolvers return null for "could not look", and the probes distinguish absent facts
 * (UNKNOWN) from an empty result (FLAT). Turning `?? undefined` into `?? []` is a single token
 * that silently restores the false all-clear against live data — and while it lived inline in
 * runSweep, which has no tests, the whole suite stayed green through exactly that mutation. A fix
 * verified at the merge and not at the consumer is not verified; giving the conversion a name and
 * a test is what makes it real.
 *
 * `undefined` is deliberate and not interchangeable with `null` here: the probes treat BOTH as
 * unusable, but passing the bundle key through as `undefined` keeps "the resolver declined to
 * answer" and "the resolver was never asked" the same shape at the probe boundary.
 */
export function toProbeFacts(t1, t2, t3) {
  return {
    clusters: t1?.clusters ?? undefined,
    classes: t2?.classes ?? undefined,
    readings: t3?.readings ?? undefined,
  };
}

export async function runSweep(supabase, { now = new Date(), dryRun = false } = {}) {
  const runAt = now.toISOString();
  const t1 = await resolveT1Facts(supabase, { now });
  const t2 = await resolveT2Facts(supabase, { now });
  const t3 = await resolveT3Facts(supabase, { now });

  const verdicts = runTrendEyesProbes(toProbeFacts(t1, t2, t3));
  const { written: candidates, truncated } = await writeCandidates(supabase, verdicts, { runAt, dryRun });

  // The exploration floor runs over ALL raw clusters, including the ones no probe fired on.
  const exploration = t1.clusters
    .map((c) => ({ questionClass: c.questionClass, members: c.occurrences.length }))
    .sort((a, b) => b.members - a.members)
    .slice(0, EXPLORATION_TOP_N);

  const blindness = [t2.blind && `t2: ${t2.blind}`, t3.blind && `t3: ${t3.blind}`].filter(Boolean);
  const receipt = await writeReceipt(supabase, {
    verdicts, candidates, truncated, exploration, runAt, dryRun, coverage: t1.coverage, blindness,
  });
  return { runAt, verdicts, candidates, truncated, receipt, sourcesQueried: t2.queried, coverage: t1.coverage, blindness };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required'); process.exit(2); }

  const supabase = createClient(url, key);
  const out = await runSweep(supabase, { dryRun });
  console.log(`trend-eyes-sweep ${dryRun ? '(dry-run) ' : ''}@ ${out.runAt}`);
  for (const v of out.verdicts) console.log(`  ${v.verdict.toUpperCase().padEnd(7)} ${v.trigger} — ${v.detail}`);
  console.log(`  candidates: ${out.candidates.length} | sources queried: ${out.sourcesQueried.join(', ')}`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('trend-eyes-sweep.mjs')) {
  main().catch((e) => { console.error(`trend-eyes-sweep failed: ${e.message}`); process.exit(1); });
}
