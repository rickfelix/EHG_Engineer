// lib/michael/feeder.mjs — the one harness every Michael feeder runs through.
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D (FR-1, TR-1, TR-2).
//
// WHY one harness: five feeders (three on the host Task Scheduler, one on GitHub Actions, one at the
// seat) share the same lifecycle — ET window gate, inert-before-migration, single-flight per ET date,
// attempt allocation, a run row written on start and finished on exit, PII-safe logs — and a defect in
// any one copy would be a silent morning. The feeder supplies only `run()`.
//
// Inert reasons (exit 0, no row, no API call): outside_et_window, tables_absent, in_flight,
// already_ok, ceiling_hit, upstream_not_ready. `ceiling_hit` is written by a feeder into
// counts.ceiling_hit (gmail-triage, FR-5) and read here so the bound is per ET DATE, not per run.
//
// Window semantics are INCLUSIVE [start, end] (the shipped scripts/michael-quiet-tick.mjs helper,
// moved here unchanged): Task Scheduler fires on :00/:15/:30/:45 and every feeder window ends on a
// fire minute, so a half-open end would silently drop the last retry (DESIGN 76c40967 F1).
//
// Attempt allocation is an INSERT on (et_date, feeder, attempt) with attempt = max+1 from one bounded
// read; the unique index arbitrates a concurrent fire and the 23505 is the signal (DATABASE 8b2ee61d
// DB-D3). The start row is status 'skipped' with counts.phase 'started' — there is no 'running'
// member of the CHECK, and 'failed' would inflate the chairman-facing quiet-tick gauge (TESTING
// ec4eafbb 4.5). Liveness fences are ISO strings, never Date objects (QF-20260906-599 class).
import { etLocalHour, etLocalMinute } from '../time/chairman-et-wall-clock.js';
import { readRows, writeRows, todayEt } from './db.mjs';

/** Frozen registry: feeder id -> venue, ET window, fire interval. A typo is a refusal, never a row. */
export const FEEDERS = Object.freeze({
  'tasks-classifier': Object.freeze({ venue: 'task_scheduler', window: Object.freeze({ start: '03:45', end: '04:30' }), intervalMinutes: 15 }),
  'calendar-read': Object.freeze({ venue: 'task_scheduler', window: Object.freeze({ start: '04:00', end: '05:00' }), intervalMinutes: 15 }),
  'gmail-triage': Object.freeze({ venue: 'task_scheduler', window: Object.freeze({ start: '04:30', end: '05:30' }), intervalMinutes: 15 }),
  'todoist-brief': Object.freeze({ venue: 'gha', window: Object.freeze({ start: '04:45', end: '05:30' }), intervalMinutes: 15 }),
  // Names the seat's classify/grade work (written by scripts/michael/classify-apply.mjs); there is
  // deliberately no seat-classify.mjs script.
  'seat-classify': Object.freeze({ venue: 'seat', window: Object.freeze({ start: '04:30', end: '07:30' }), intervalMinutes: 15 }),
  // Already shipped by child B (scripts/michael/retention.mjs stamps feeder='retention' itself).
  'retention': Object.freeze({ venue: 'gha', window: null, intervalMinutes: null }),
});
export const FEEDER_IDS = Object.freeze(Object.keys(FEEDERS));
/** The brief assembles from these four; seat-classify is enrichment and degrades honestly (spec §3). */
export const READINESS_REQUIREMENTS = Object.freeze(['tasks-classifier', 'calendar-read', 'gmail-triage', 'todoist-brief']);
/** Assemble-degraded deadline (spec §1.5); the quiet tick imports this rather than keeping its own copy. */
export const BRIEF_DEADLINE_ET = '05:45';
/** In-flight fence = fire interval + this margin (20 min for an every-15-minute feeder), never a flat 10 (SECURITY a3587993 F-9). */
export const STALE_MARGIN_MINUTES = 5;
export const INERT_REASONS = Object.freeze(['outside_et_window', 'tables_absent', 'in_flight', 'already_ok', 'ceiling_hit', 'upstream_not_ready']);
const RUN_STATUSES = new Set(['ok', 'degraded', 'failed', 'skipped', 'imported']);
const UNIQUE_VIOLATION = '23505';

/** Pure: 'HH:MM' -> minutes since midnight (NaN when malformed). */
export function hhmmToMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Pure: is the ET minute-of-day inside the INCLUSIVE [start, end] window (wrap-around when start > end)? */
export function inWindow(minuteOfDay, window) {
  if (!window) return false;
  const s = hhmmToMinutes(window.start), e = hhmmToMinutes(window.end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || !Number.isFinite(minuteOfDay)) return false;
  return s <= e ? (minuteOfDay >= s && minuteOfDay <= e) : (minuteOfDay >= s || minuteOfDay <= e);
}

/** Pure: ET wall-clock minute-of-day for an instant. */
export function etMinuteOfDay(now) {
  return etLocalHour(now) * 60 + etLocalMinute(now);
}

/** Pure: did a writeRows result lose a unique-index race (code 23505, or the message when the code is absent)? */
export function isUniqueViolation(res) {
  return Boolean(res) && (res.code === UNIQUE_VIOLATION || /duplicate key value|already exists/i.test(String(res.error || '')));
}

/** Pure: minutes after which a started-but-unfinished row is treated as dead for this feeder. */
export function staleThresholdMinutes(feederId) {
  const f = FEEDERS[feederId];
  return ((f && f.intervalMinutes) || 15) + STALE_MARGIN_MINUTES;
}

/** Pure: process exit code for a harness result — 0 inert/ok/degraded, 1 failed run row written, 2 refusal. */
export function exitCodeFor(result) {
  if (!result || result.ok === false) return 2;
  if (result.action === 'run' && result.status === 'failed') return 1;
  return 0;
}

/** Windows-safe termination (one copy for all five feeders; mirrors scripts/cron/chairman-morning-brief-sweep.mjs). */
export async function gracefulExit(exitCode, { backstopMs = 4000 } = {}) {
  process.exitCode = exitCode;
  try {
    const undici = await import('undici');
    await undici.getGlobalDispatcher?.()?.close?.();
  } catch { /* undici absent — natural drain still applies */ }
  setTimeout(() => process.exit(exitCode), backstopMs).unref();
}

/** Default logger: stderr, so `--json` stdout stays exactly one object (michael-quiet-tick.mjs:17 rule). */
export function stderrLogger(line) {
  process.stderr.write(`${line}\n`);
}

function inert(feeder, etDate, reason, extra = {}) {
  return { ok: true, action: 'inert', reason, feeder, et_date: etDate, ...extra };
}

/** One bounded read serves every single-flight predicate; the rows are also handed to run() as priorRuns. */
async function readPriorRuns(sb, feeder, etDate) {
  return readRows(sb, 'michael_feeder_runs',
    (q) => q.eq('et_date', etDate).eq('feeder', feeder).order('attempt', { ascending: false }),
    { select: 'id,attempt,status,counts,started_at,finished_at' });
}

/** INSERT the start row with attempt = max+1; one retry when a concurrent fire took the attempt. */
async function claimAttempt(sb, { feeder, etDate, venue, now, prior }, { maxRetries = 1 } = {}) {
  let rows = prior;
  for (let i = 0; i <= maxRetries; i++) {
    if (i > 0) {
      const again = await readPriorRuns(sb, feeder, etDate);
      if (again.tables_absent) return { inert: 'tables_absent' };
      if (again.error) return { refusal: 'READ_FAILED', error: again.error };
      rows = again.rows;
    }
    const attempt = rows.length ? Math.max(...rows.map((r) => Number(r.attempt) || 0)) + 1 : 1;
    const res = await writeRows(sb, 'michael_feeder_runs', (t) => t
      .insert({ feeder, et_date: etDate, attempt, venue, status: 'skipped', counts: { phase: 'started' }, started_at: now.toISOString() })
      .select('id,attempt').single());
    if (res.ok) return { id: res.data && res.data.id, attempt };
    if (res.tables_absent) return { inert: 'tables_absent' };
    if (isUniqueViolation(res)) continue;
    return { refusal: 'WRITE_FAILED', error: res.error };
  }
  // Lost the race twice: someone else is running this feeder — yield, never a false failure.
  return { inert: 'in_flight' };
}

/**
 * Run one feeder. config: { feeder, venue?, window?, upstream?, run, etDateOverride? };
 * deps: { sb, env?, now?, logger? }. run({ sb, env, now, etDate, attempt, priorRuns, logger }) returns
 * { status: 'ok'|'degraded'|'failed', counts?, log_md? } or throws (a coded throw maps to status
 * 'failed' with counts.refusal = e.code). Never throws; never writes a body, address or task text.
 */
export async function runFeeder(config = {}, deps = {}) {
  const { feeder, upstream = [], run, etDateOverride } = config;
  const { sb, env = process.env, now = new Date(), logger = stderrLogger } = deps;
  const reg = FEEDERS[feeder];
  if (!reg) return { ok: false, refusal: 'FEEDER_UNKNOWN', message: `feeder "${feeder}" is not in FEEDERS (${FEEDER_IDS.join(', ')})` };
  if (typeof run !== 'function') return { ok: false, refusal: 'RUN_MISSING', message: 'config.run must be a function' };
  const venue = config.venue || reg.venue;
  const window = config.window === undefined ? reg.window : config.window;
  const etDate = etDateOverride || todayEt(now);
  const log = (obj) => logger(`[michael:${feeder}] ${JSON.stringify({ et_date: etDate, ...obj })}`);

  if (window && !inWindow(etMinuteOfDay(now), window)) return inert(feeder, etDate, 'outside_et_window', { window });

  const prior = await readPriorRuns(sb, feeder, etDate);
  if (prior.tables_absent) return inert(feeder, etDate, 'tables_absent', { tables_absent: true });
  if (prior.error) return { ok: false, refusal: 'READ_FAILED', message: prior.error };
  if (prior.rows.some((r) => r.status === 'ok')) return inert(feeder, etDate, 'already_ok');
  if (prior.rows.some((r) => r.counts && r.counts.ceiling_hit === true)) return inert(feeder, etDate, 'ceiling_hit');
  const floorIso = new Date(now.getTime() - staleThresholdMinutes(feeder) * 60 * 1000).toISOString();
  if (prior.rows.some((r) => r.started_at && !r.finished_at && String(r.started_at) >= floorIso)) return inert(feeder, etDate, 'in_flight');

  if (upstream.length) {
    const up = await readRows(sb, 'michael_feeder_runs', (q) => q.eq('et_date', etDate).in('feeder', upstream), { select: 'feeder,status' });
    if (up.tables_absent) return inert(feeder, etDate, 'tables_absent', { tables_absent: true });
    if (up.error) return { ok: false, refusal: 'READ_FAILED', message: up.error };
    const ready = new Set(up.rows.filter((r) => r.status === 'ok' || r.status === 'degraded').map((r) => r.feeder));
    const notReady = upstream.filter((u) => !ready.has(u));
    if (notReady.length) return inert(feeder, etDate, 'upstream_not_ready', { upstream_not_ready: notReady });
  }

  const claim = await claimAttempt(sb, { feeder, etDate, venue, now, prior: prior.rows });
  if (claim.inert) return inert(feeder, etDate, claim.inert, claim.inert === 'tables_absent' ? { tables_absent: true } : {});
  if (claim.refusal) return { ok: false, refusal: claim.refusal, message: claim.error };
  log({ phase: 'started', attempt: claim.attempt, venue });

  let status = 'failed';
  let counts = {};
  let logMd = null;
  try {
    const out = (await run({ sb, env, now, etDate, attempt: claim.attempt, priorRuns: prior.rows, logger })) || {};
    status = RUN_STATUSES.has(out.status) ? out.status : 'failed';
    counts = out.counts && typeof out.counts === 'object' && !Array.isArray(out.counts) ? out.counts : {};
    logMd = typeof out.log_md === 'string' ? out.log_md : null;
    if (!RUN_STATUSES.has(out.status)) counts = { ...counts, refusal: 'STATUS_INVALID' };
  } catch (e) {
    status = 'failed';
    counts = { refusal: (e && e.code) || 'RUN_THREW', error_class: e && e.name ? e.name : 'Error' };
  }
  const finishedAt = new Date().toISOString();
  const fin = await writeRows(sb, 'michael_feeder_runs', (t) => t
    .update({ status, counts, log_md: logMd, finished_at: finishedAt })
    .eq('et_date', etDate).eq('feeder', feeder).eq('attempt', claim.attempt));
  if (!fin.ok) log({ phase: 'finish_write_failed', refusal: fin.refusal });
  log({ phase: 'finished', attempt: claim.attempt, status, counts });
  return { ok: true, action: 'run', feeder, et_date: etDate, attempt: claim.attempt, venue, status, counts, run_id: claim.id || null, finish_write_ok: fin.ok };
}

/**
 * Pure: should the brief assemble now? runs = today's michael_feeder_runs rows ({ feeder, status }).
 * decision: 'assemble' (every required feeder ok), 'assemble_degraded' (some degraded, or missing past
 * the deadline), 'wait' (some missing before the deadline). Child E imports this (AC-5).
 */
export function assembleReadiness({ runs = [], now = new Date(), required = READINESS_REQUIREMENTS, deadlineEt = BRIEF_DEADLINE_ET } = {}) {
  const rank = { ok: 3, degraded: 2, failed: 1, skipped: 0, imported: 3 };
  const best = new Map();
  for (const r of runs) {
    if (!r || !r.feeder) continue;
    const cur = best.get(r.feeder);
    if (cur === undefined || (rank[r.status] || 0) > (rank[cur] || 0)) best.set(r.feeder, r.status);
  }
  const ok = [], degraded = [], missing = [];
  for (const f of required) {
    const s = best.get(f);
    if (s === 'ok' || s === 'imported') ok.push(f);
    else if (s === 'degraded') degraded.push(f);
    else missing.push(f);
  }
  const pastDeadline = etMinuteOfDay(now) >= hhmmToMinutes(deadlineEt);
  let decision;
  if (missing.length === 0 && degraded.length === 0) decision = 'assemble';
  else if (missing.length === 0 || pastDeadline) decision = 'assemble_degraded';
  else decision = 'wait';
  return { decision, ready: decision !== 'wait', degraded: decision === 'assemble_degraded', ok, degraded_feeders: degraded, missing, past_deadline: pastDeadline, deadline_et: deadlineEt };
}
