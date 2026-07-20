#!/usr/bin/env node
/**
 * Chairman morning-review sweep — the DURABLE 5:45 AM ET daily-review runner.
 * SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-B (child B: text-only floor).
 *
 * Mirrors scripts/cron/sms-outbound-reconcile-sweep.mjs: a --once runner holding NO
 * session-local setTimeout/setInterval work-timer, so a fresh cold GitHub Actions process
 * does exactly one pass and exits. It builds a SHORT, segment-aware status body (a completion
 * forecast line + a roadmap build/wave line + a "what moved yesterday" line) and enqueues it
 * as a TEXT-only 'morning_review' obligation via the hardened owed-state bridge
 * (enqueueChairmanSms). The actual provider send + delivery-truth is owned by the pre-existing
 * claim-serialized worker (lib/chairman/sms-outbound-worker.js) — this sweep NEVER calls
 * twilioProvider.send (that would re-open the F1 201-as-success defect).
 *
 * DST: GitHub cron is UTC/no-DST. The workflow fires at BOTH 09:45 and 10:45 UTC; this sweep
 * gates real work on an America/New_York wall-clock check (proceed only when the ET local hour
 * is 5), so exactly one of the two fires maps to 05:45 ET per season and does work — the other
 * exits inert. The per-ET-date dedupeKey is the idempotency backstop against a double-fire.
 *
 * FAIL-SOFT: while the STAGED sms_outbound_obligations table is unapplied, enqueueChairmanSms
 * returns {enqueued:false, reason:'table_absent...'} without throwing and this sweep logs inert
 * + exits 0 (no crash, no direct provider.send fallback).
 *
 * Usage:
 *   node scripts/cron/chairman-morning-review-sweep.mjs --once
 *   node scripts/cron/chairman-morning-review-sweep.mjs --once --dry-run
 *
 * Env: SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (required),
 *      CHAIRMAN_PHONE (recipient — inert if unset).
 */
import 'dotenv/config';
import { pathToFileURL } from 'url';
import { createClient } from '@supabase/supabase-js';
import { enqueueChairmanSms } from '../../lib/chairman/sms-bridge.js';
import { computeForecast, formatForecastLine } from '../../lib/vision/build-completion-forecast.mjs';
import { etLocalHour, etDateStr, et6amIso, etPrior545Iso } from '../../lib/time/chairman-et-wall-clock.js';

export const SD_KEY = 'SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-B';
export const ACTIVATION_TRIGGER = '.github/workflows/chairman-morning-review-cron.yml';
const DAY_MS = 24 * 60 * 60 * 1000;
const NOT_IN_TERMINAL = '("completed","cancelled","deferred")';
// ~2 GSM segments (153 chars/segment concatenated). The built body is capped here so a long
// forecast note can never balloon past the segment budget.
export const BODY_CEILING = 306;

export function parseArgs(argv) {
  const args = { once: false, dryRun: false, help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--once') args.once = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function buildSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  return createClient(url, key);
}

// ET wall-clock helpers (etLocalHour, etDateStr, et6amIso, etPrior545Iso) now live in
// lib/time/chairman-et-wall-clock.js (SD-LEO-INFRA-SMS-DELIVERY-TRUTH-001-A consolidation) —
// re-exported here so this script's own CLI/importers are unaffected by the move.
export { etLocalHour, etDateStr, et6amIso, etPrior545Iso };

// ── body data (DB-only, fail-soft; surgical — no git-grep VDR gauge / CLI refactor) ──
async function gatherForecastInputs(supabase, nowMs, windowDays = 14) {
  const sinceIso = new Date(nowMs - windowDays * DAY_MS).toISOString();
  let velocityPerDay = 0, sourcingPerDay = 0, queueDepth = 0, buildableRemaining = 0;
  try {
    const { data } = await supabase.from('strategic_directives_v2').select('sd_key, updated_at').eq('status', 'completed').gte('updated_at', sinceIso);
    velocityPerDay = (data?.length || 0) / windowDays;
  } catch { /* fail-soft */ }
  try {
    const { data } = await supabase.from('strategic_directives_v2').select('sd_key, created_at, claiming_session_id, sd_type').not('status', 'in', NOT_IN_TERMINAL);
    const rows = (Array.isArray(data) ? data : []).filter((d) => d.sd_type !== 'orchestrator');
    buildableRemaining = rows.length;
    sourcingPerDay = rows.filter((d) => d.created_at && d.created_at >= sinceIso).length / windowDays;
    queueDepth = rows.filter((d) => !d.claiming_session_id).length;
  } catch { /* fail-soft */ }
  return { buildPct: null, buildableRemaining, velocityPerDay, sourcingPerDay, queueDepth };
}

async function gatherWaves(supabase) {
  try {
    const { data: roadmaps } = await supabase.from('strategic_roadmaps').select('id, status, created_at').order('created_at', { ascending: false }).limit(1);
    const rm = roadmaps?.[0];
    if (!rm) return { waveCount: 0, doneWaves: 0, avgPct: null };
    const { data: waves } = await supabase.from('roadmap_waves').select('status, progress_pct').eq('roadmap_id', rm.id);
    const ws = waves || [];
    const waveCount = ws.length;
    const doneWaves = ws.filter((w) => Number(w.progress_pct || 0) >= 100 || w.status === 'completed').length;
    const avgPct = waveCount ? Math.round(ws.reduce((s, w) => s + Number(w.progress_pct || 0), 0) / waveCount) : null;
    return { waveCount, doneWaves, avgPct };
  } catch { return { waveCount: 0, doneWaves: 0, avgPct: null }; }
}

async function gatherYesterday(supabase, priorMorningIso) {
  let shipped = 0, inFlight = 0;
  try {
    const { data } = await supabase.from('strategic_directives_v2').select('sd_key').eq('status', 'completed').gte('updated_at', priorMorningIso);
    shipped = data?.length || 0;
  } catch { /* fail-soft */ }
  try {
    const { data } = await supabase.from('strategic_directives_v2').select('sd_key').not('status', 'in', NOT_IN_TERMINAL);
    inFlight = data?.length || 0;
  } catch { /* fail-soft */ }
  return { shipped, inFlight };
}

/** Build the SHORT, PII-free morning-review body. Login-gated summary data only. */
export async function buildMorningReviewBody(supabase, { now = new Date() } = {}) {
  const nowMs = now.getTime();
  const inputs = await gatherForecastInputs(supabase, nowMs);
  const forecastLine = formatForecastLine(computeForecast({ ...inputs, nowMs }), null);

  const waves = await gatherWaves(supabase);
  const roadmapLine = waves.waveCount
    ? `Roadmap: ${waves.avgPct == null ? '?' : waves.avgPct}% build, waves ${waves.doneWaves}/${waves.waveCount} done`
    : 'Roadmap: (no active roadmap)';

  const { shipped, inFlight } = await gatherYesterday(supabase, etPrior545Iso(now));
  const yesterdayLine = `Yesterday: ${shipped} shipped, ${inFlight} in-flight`;

  let body = [forecastLine, roadmapLine, yesterdayLine].join('\n');
  if (body.length > BODY_CEILING) body = `${body.slice(0, BODY_CEILING - 1)}…`;
  return body;
}

export async function main(argv = process.argv, deps = {}) {
  const args = parseArgs(argv);
  const logger = deps.logger || console;
  const env = deps.env || process.env;
  const now = deps.now instanceof Date ? deps.now : (Number.isFinite(deps.now) ? new Date(deps.now) : new Date());
  const enqueue = deps.enqueue || enqueueChairmanSms;
  const log = (obj) => logger.log?.(`[morning-review] ${JSON.stringify(obj)}`);

  if (args.help) { logger.log?.('chairman-morning-review-sweep --once [--dry-run]'); return { exitCode: 0, action: 'help' }; }

  // FR-2 ET wall-clock gate: only the season-correct UTC fire (05:XX ET) does work.
  const etHour = etLocalHour(now);
  if (etHour !== 5) {
    log({ action: 'inert', reason: 'outside_et_window', et_hour: etHour });
    return { exitCode: 0, action: 'inert', reason: 'outside_et_window' };
  }

  const recipientPhone = env.CHAIRMAN_PHONE;
  if (!recipientPhone) {
    log({ action: 'inert', reason: 'chairman_phone_unset' });
    return { exitCode: 0, action: 'inert', reason: 'chairman_phone_unset' };
  }

  let supabase;
  try { supabase = deps.supabase || buildSupabase(); }
  catch (err) { logger.error?.(`[morning-review] supabase client unavailable: ${err.message}`); return { exitCode: 2, action: 'no_supabase' }; }

  const dedupeKey = `morning_review:${etDateStr(now)}`;
  const notBefore = et6amIso(now); // defer an overnight/early enqueue to the 6AM batch (sleep-window)

  let body;
  try { body = await (deps.buildBody || buildMorningReviewBody)(supabase, { now }); }
  catch (err) { logger.warn?.(`[morning-review] body build degraded (${err.message})`); body = 'Morning review: status unavailable this run.'; }

  if (args.dryRun) {
    log({ action: 'dry_run', dedupe_key: dedupeKey, not_before: notBefore, body_len: body.length });
    return { exitCode: 0, action: 'dry_run', summary: { dedupeKey, notBefore, bodyLength: body.length } };
  }

  // Owed-state enqueue ONLY — the worker owns the provider send + delivery-truth.
  const enq = await enqueue(supabase, { recipientPhone, kind: 'morning_review', body, decisionId: null, dedupeKey, notBefore });
  const action = enq.enqueued ? 'enqueued' : (enq.deduped ? 'deduped' : 'inert');
  // PII-safe: log counts/ids/reason only — never the recipient phone or the body text.
  log({ action, obligation_id: enq.obligationId || null, reason: enq.reason || null, dedupe_key: dedupeKey, not_before: notBefore, body_len: body.length });
  return {
    exitCode: 0,
    action,
    summary: { enqueued: !!enq.enqueued, deduped: !!enq.deduped, reason: enq.reason || null, dedupeKey, notBefore, bodyLength: body.length, obligationId: enq.obligationId || null },
  };
}

/** Windows-safe termination (mirrors scripts/cron/sms-outbound-reconcile-sweep.mjs::gracefulExit). */
export async function gracefulExit(exitCode, { backstopMs = 4000 } = {}) {
  process.exitCode = exitCode;
  try {
    const undici = await import('undici');
    await undici.getGlobalDispatcher?.()?.close?.();
  } catch { /* undici absent — natural drain still applies */ }
  setTimeout(() => process.exit(exitCode), backstopMs).unref();
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().then(({ exitCode }) => gracefulExit(exitCode))
        .catch((err) => { console.error('chairman-morning-review-sweep fatal:', err.message); return gracefulExit(2); });
}
