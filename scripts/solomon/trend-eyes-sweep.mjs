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
  const anchors = [
    ['sms-coverage', /\b(sms|text)\b.*\b(cover|coverage|reach|miss|get through)\b/],
    ['belt-depth', /\bbelt\b.*\b(depth|empty|dry|starv)/],
    ['fleet-liveness', /\b(worker|seat|fleet)\b.*\b(alive|dead|idle|stuck|dormant)\b/],
    ['cost-quota', /\b(quota|cost|burn|spend|usage)\b/],
    ['progress-status', /\b(status|progress|where are we|how far)\b/],
  ];
  for (const [cls, re] of anchors) if (re.test(t)) return cls;
  return null;
}

/** T1 facts: cluster INBOUND chairman messages by question-class. */
export async function resolveT1Facts(supabase, { now, windowHours = SMS_WINDOW_HOURS } = {}) {
  const lane = await readChairmanSmsExchanges(supabase, { windowHours, now });
  const byClass = new Map();
  for (const ex of lane.exchanges) {
    // Inbound only: the chairman ASKING is the signal. An outbound we sent is not his question.
    const m = ex.reply;
    if (!m || m.direction !== 'in') continue;
    const cls = questionClass(m.body);
    if (!cls) continue;
    if (!byClass.has(cls)) byClass.set(cls, []);
    byClass.get(cls).push({ at: m.at, id: m.id });
  }
  return [...byClass.entries()].map(([questionClass_, occurrences]) => ({ questionClass: questionClass_, occurrences }));
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

  queried.push('retention_archive');
  const archived = await supabase.from('retention_archive')
    .select('id, source_table, payload, archived_at').eq('source_table', 'session_coordination').gte('archived_at', since);
  if (archived.error) throw new Error(`retention_archive read failed: ${archived.error.message}`);

  const rows = [
    ...(live.data || []).map((r) => ({ at: r.created_at, payload: r.payload, source: 'session_coordination' })),
    ...(archived.data || []).map((r) => ({ at: r.archived_at, payload: r.payload, source: 'retention_archive' })),
  ];

  const byClass = new Map();
  for (const r of rows) {
    const key = r.payload?.lesson_class || r.payload?.signal_type;
    if (!key) continue;
    if (!byClass.has(key)) byClass.set(key, { classKey: key, fixedAt: null, occurrences: [] });
    const entry = byClass.get(key);
    entry.occurrences.push({ at: r.at, source: r.source });
    // A fix is whatever the lane itself recorded as shipping for this class. Taking the EARLIEST
    // keeps a later re-fix from masking a recurrence that already happened after the first one.
    const fixedAt = r.payload?.fix_shipped_at;
    if (fixedAt && (!entry.fixedAt || fixedAt < entry.fixedAt)) entry.fixedAt = fixedAt;
  }
  return { classes: [...byClass.values()], queried };
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

  const patterns = await supabase.from('issue_patterns')
    .select('id, pattern_name, created_at').gte('created_at', since);
  if (patterns.error) throw new Error(`issue_patterns read failed: ${patterns.error.message}`);

  const lane = await supabase.from('session_coordination')
    .select('id, payload, created_at').gte('created_at', since);
  if (lane.error) throw new Error(`session_coordination read failed: ${lane.error.message}`);

  const readings = [];
  for (let d = days - 1; d >= 0; d--) {
    const start = new Date(nowMs - (d + 1) * 86400_000);
    const end = new Date(nowMs - d * 86400_000);
    const inWindow = (ts) => { const t = new Date(ts).getTime(); return t >= start.getTime() && t < end.getTime(); };
    // Numerator and denominator are computed over the SAME [start,end) window, deliberately in one
    // place — a ratio whose halves span different extents still yields a plausible number, and the
    // probe's span guard refuses it rather than reporting a trend built on one.
    const named = (lane.data || []).filter((r) => inWindow(r.created_at) && r.payload?.lesson_class);
    const namedKeys = new Set(named.map((r) => r.payload.lesson_class));
    const reached = (patterns.data || []).filter((p) => inWindow(p.created_at) && namedKeys.has(p.pattern_name));
    if (namedKeys.size === 0) continue;
    readings.push({
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
      laneNamed: namedKeys.size,
      reachedPatterns: Math.min(reached.length, namedKeys.size),
    });
  }
  return readings;
}

/** Write one candidate per fired trend. Self-describing: metadata carries the reproducing query. */
async function writeCandidates(supabase, verdicts, { runAt, dryRun }) {
  const written = [];
  for (const v of verdicts) {
    if (v.verdict !== VERDICT.FIRE) continue;
    const items = Array.isArray(v.evidence) ? v.evidence : [v.evidence];
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
  return written;
}

/**
 * The run-receipt. Written on EVERY execution including empty ones — that is the whole point.
 * "No candidates" and "the sweep died three weeks ago" are otherwise identical from outside.
 * Carries a routing tally so dedup-suppressed-everything stays distinguishable from broke, and an
 * exploration floor (top-N raw clusters even below threshold) so a narrowing of the instrument's
 * own vision is visible in the receipt series rather than silently converging.
 */
async function writeReceipt(supabase, { verdicts, candidates, exploration, runAt, dryRun }) {
  const findings = [{
    ran_at: runAt,
    verdicts: verdicts.map((v) => ({ trigger: v.trigger, verdict: v.verdict, detail: v.detail })),
    candidates_written: candidates.length,
    unknown_count: verdicts.filter((v) => v.verdict === VERDICT.UNKNOWN).length,
    exploration_floor: exploration,
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

export async function runSweep(supabase, { now = new Date(), dryRun = false } = {}) {
  const runAt = now.toISOString();
  const t1 = await resolveT1Facts(supabase, { now });
  const t2 = await resolveT2Facts(supabase, { now });
  const t3 = await resolveT3Facts(supabase, { now });

  const verdicts = runTrendEyesProbes({ clusters: t1, classes: t2.classes, readings: t3 });
  const candidates = await writeCandidates(supabase, verdicts, { runAt, dryRun });

  // The exploration floor runs over ALL raw clusters, including the ones no probe fired on.
  const exploration = t1
    .map((c) => ({ questionClass: c.questionClass, members: c.occurrences.length }))
    .sort((a, b) => b.members - a.members)
    .slice(0, EXPLORATION_TOP_N);

  const receipt = await writeReceipt(supabase, { verdicts, candidates, exploration, runAt, dryRun });
  return { runAt, verdicts, candidates, receipt, sourcesQueried: t2.queried };
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
