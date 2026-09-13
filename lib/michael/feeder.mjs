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
  // QF-20260911-282 / chairman ratification 2026-09-11 (~20:47Z, at the Adam terminal): the three
  // read feeders (calendar-read, gmail-triage, todoist-brief) previously fired ONLY in a pre-dawn
  // window, so Michael answered the chairman all day from a picture up to eighteen hours old.
  // `window` may be a single {start,end} object (see tasks-classifier above) OR an array of them
  // (this file's `inWindow` accepts either); the pre-dawn window stays the anchor, plus two more
  // read windows -- 12:00-12:30 and 18:00-18:30 ET (defaults; the chairman named no other times).
  // The 15-minute repeat interval stays retry density only, unchanged by adding more windows.
  'calendar-read': Object.freeze({ venue: 'task_scheduler', window: Object.freeze([Object.freeze({ start: '04:00', end: '05:00' }), Object.freeze({ start: '12:00', end: '12:30' }), Object.freeze({ start: '18:00', end: '18:30' })]), intervalMinutes: 15 }),
  'gmail-triage': Object.freeze({ venue: 'task_scheduler', window: Object.freeze([Object.freeze({ start: '04:30', end: '05:30' }), Object.freeze({ start: '12:00', end: '12:30' }), Object.freeze({ start: '18:00', end: '18:30' })]), intervalMinutes: 15 }),
  // QF-20260911-110 / ratification 00f696f1 ("Move them", 2026-09-08): moved from GitHub Actions
  // to the host Task Scheduler, verified by the chairman's own --verify run (ratification
  // d5905408, "seven EHG Michael tasks VERIFIED"). venue is 'task_scheduler' (the codebase's
  // existing host-venue value), never a new 'host' literal -- that value has no entry in the
  // venue CHECK constraint (database/migrations/20260906_michael_tables.sql) or this file's own
  // enum allowlist test.
  'todoist-brief': Object.freeze({ venue: 'task_scheduler', window: Object.freeze([Object.freeze({ start: '04:45', end: '05:30' }), Object.freeze({ start: '12:00', end: '12:30' }), Object.freeze({ start: '18:00', end: '18:30' })]), intervalMinutes: 15 }),
  // Names the seat's classify/grade work (written by scripts/michael/classify-apply.mjs); there is
  // deliberately no seat-classify.mjs script. Window widened to three scheduled slots (QF-20260912-163)
  // to match todoist-brief's pattern -- a single 04:30-07:30 block meant an already_ok row from the
  // morning run silently suppressed the 12:00/18:00 re-classify slots too (windowId scopes the dedup key).
  'seat-classify': Object.freeze({ window: Object.freeze([Object.freeze({ start: '04:30', end: '07:30' }), Object.freeze({ start: '12:00', end: '12:30' }), Object.freeze({ start: '18:00', end: '18:30' })]), venue: 'seat', intervalMinutes: 15 }),
  // Already shipped by child B (scripts/michael/retention.mjs stamps feeder='retention' itself).
  'retention': Object.freeze({ venue: 'gha', window: null, intervalMinutes: null }),
  // Child E (FR-2): the assembler. Same window assembleReadiness's BRIEF_DEADLINE_ET (05:45) sits
  // inside — a mismatch here would silently make runFeeder's own window gate drop the last retry.
  // QF-20260911-110 / ratification 00f696f1: same venue move as todoist-brief above.
  'brief-assemble': Object.freeze({ venue: 'task_scheduler', window: Object.freeze({ start: '05:15', end: '06:00' }), intervalMinutes: 15 }),
  // Child J (v1.1): enrichment feeders, not brief-blocking (deliberately absent from
  // READINESS_REQUIREMENTS below) -- windowed AFTER BRIEF_DEADLINE_ET (05:45) so they never compete
  // with the four brief-gating feeders for the same fire minutes.
  'oracle-extract': Object.freeze({ venue: 'task_scheduler', window: Object.freeze({ start: '06:00', end: '06:30' }), intervalMinutes: 15 }),
  'health-sync': Object.freeze({ venue: 'task_scheduler', window: Object.freeze({ start: '06:00', end: '06:30' }), intervalMinutes: 15 }),
  // Credential-free public RSS (lib/integrations/youtube/subscription-scanner.js) -- no host
  // credential needed, so this stays on GHA (unlike todoist-brief/brief-assemble above, which
  // moved to task_scheduler under ratification 00f696f1 because they DO need a host credential).
  'youtube-digest': Object.freeze({ venue: 'gha', window: Object.freeze({ start: '06:00', end: '06:30' }), intervalMinutes: 15 }),
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

/**
 * Pure: is the ET minute-of-day inside the INCLUSIVE [start, end] window (wrap-around when
 * start > end)? `window` may also be an array of {start,end} windows (QF-20260911-282) -- true
 * when the minute falls in ANY of them, so a feeder with multiple daily read windows (e.g.
 * pre-dawn + midday + evening) is gated by one call site with no branching at the caller.
 */
export function inWindow(minuteOfDay, window) {
  if (!window) return false;
  if (Array.isArray(window)) return window.some((w) => inWindow(minuteOfDay, w));
  const s = hhmmToMinutes(window.start), e = hhmmToMinutes(window.end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || !Number.isFinite(minuteOfDay)) return false;
  return s <= e ? (minuteOfDay >= s && minuteOfDay <= e) : (minuteOfDay >= s || minuteOfDay <= e);
}

/**
 * Pure: which window (by its own `start` string, the FEEDERS-registry-derived identity) the
 * minute falls in, or null when it falls in none / window is falsy. QF-20260912-163: a
 * multi-window feeder's `already_ok` must be scoped to the window that ran, not the whole ET
 * date, or a pre-dawn success silently suppresses the noon/evening reads the schedule added.
 * A single-window feeder's id is just that window's own `start` -- unchanged behaviour, since
 * there is only ever one value to key on.
 */
export function windowIdFor(minuteOfDay, window) {
  if (!window) return null;
  if (Array.isArray(window)) {
    const hit = window.find((w) => inWindow(minuteOfDay, w));
    return hit ? hit.start : null;
  }
  return inWindow(minuteOfDay, window) ? window.start : null;
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

/** Pure: process exit code — 0 inert/ok/degraded, 1 a failed run row (or a finish write the ledger did not hold), 2 refusal. */
export function exitCodeFor(result) {
  if (!result || result.ok === false) return 2;
  if ((result.action === 'run' || result.action === 'dry_run') && (result.status === 'failed' || result.finish_write_ok === false)) return 1;
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

/**
 * Pure: the inert reason today's rows impose, or null. Applied before the first insert AND after a
 * 23505 re-read: a unique-index loss means a concurrent fire just claimed the attempt and is live,
 * so the fresh rows must pass the same predicates before another attempt is minted (adversarial
 * review of PR 8364).
 *
 * QF-20260912-163: `already_ok` keys on (feeder, ET date, windowId) when the feeder has more than
 * one daily window -- a prior success stamped with a DIFFERENT window's id (counts.window, written
 * by claimAttempt/the finish write below) never suppresses the current window's own attempt. A row
 * with no counts.window (written before this fix, or a single-window feeder) is treated as
 * matching every window -- unchanged behaviour for the common case.
 *
 * QF-20260912-290: a row with counts.decision === 'wait' (brief-assemble's readiness-not-ready
 * outcome, status 'ok' by construction -- 'wait' is not in RUN_STATUSES) is NOT done and must not
 * suppress the deadline fire that assembles degraded. Only brief-assemble ever writes
 * counts.decision, so this exclusion cannot affect any other feeder's already_ok.
 */
export function inertReasonFor(rows, feeder, now, windowId = null) {
  if (rows.some((r) => (r.status === 'ok' || r.status === 'imported')
    && !(r.counts && r.counts.decision === 'wait')
    && (!windowId || !(r.counts && r.counts.window) || r.counts.window === windowId))) return 'already_ok';
  if (rows.some((r) => r.counts && r.counts.ceiling_hit === true)) return 'ceiling_hit';
  const floorIso = new Date(now.getTime() - staleThresholdMinutes(feeder) * 60 * 1000).toISOString();
  if (rows.some((r) => r.started_at && !r.finished_at && String(r.started_at) >= floorIso)) return 'in_flight';
  return null;
}

/** One bounded read serves every single-flight predicate; the rows are also handed to run() as priorRuns. */
async function readPriorRuns(sb, feeder, etDate) {
  return readRows(sb, 'michael_feeder_runs',
    (q) => q.eq('et_date', etDate).eq('feeder', feeder).order('attempt', { ascending: false }),
    { select: 'id,attempt,status,counts,started_at,finished_at' });
}

/** INSERT the start row with attempt = max+1; one retry when a concurrent fire took the attempt. */
async function claimAttempt(sb, { feeder, etDate, venue, now, prior, windowId }, { maxRetries = 1 } = {}) {
  let rows = prior;
  for (let i = 0; i <= maxRetries; i++) {
    if (i > 0) {
      const again = await readPriorRuns(sb, feeder, etDate);
      if (again.tables_absent) return { inert: 'tables_absent' };
      if (again.error) return { refusal: 'READ_FAILED', error: again.error };
      rows = again.rows;
      const reason = inertReasonFor(rows, feeder, now, windowId);
      if (reason) return { inert: reason };
    }
    const attempt = rows.length ? Math.max(...rows.map((r) => Number(r.attempt) || 0)) + 1 : 1;
    const res = await writeRows(sb, 'michael_feeder_runs', (t) => t
      .insert({ feeder, et_date: etDate, attempt, venue, status: 'skipped', counts: { phase: 'started', window: windowId }, started_at: now.toISOString() })
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
  const { feeder, upstream = [], run, etDateOverride, dryRun = false } = config;
  const { sb, env = process.env, now = new Date(), logger = stderrLogger } = deps;
  const reg = FEEDERS[feeder];
  if (!reg) return { ok: false, refusal: 'FEEDER_UNKNOWN', message: `feeder "${feeder}" is not in FEEDERS (${FEEDER_IDS.join(', ')})` };
  if (typeof run !== 'function') return { ok: false, refusal: 'RUN_MISSING', message: 'config.run must be a function' };
  // upstream accepts feeder ids or FR-1(f) objects { feeder, accept: ['ok','degraded'] }; a malformed entry
  // is a coded refusal before any read, never a throw inside the gate (adversarial review of PR 8365).
  const ups = [];
  for (const u of Array.isArray(upstream) ? upstream : [upstream]) {
    const entry = typeof u === 'string' ? { feeder: u, accept: ['ok', 'degraded'] } : (u && typeof u === 'object' ? { feeder: u.feeder, accept: u.accept === undefined ? ['ok', 'degraded'] : u.accept } : null);
    const valid = entry && typeof entry.feeder === 'string' && entry.feeder && Array.isArray(entry.accept) && entry.accept.length > 0 && entry.accept.every((a) => RUN_STATUSES.has(a));
    if (!valid) return { ok: false, refusal: 'UPSTREAM_INVALID', message: `upstream entry ${JSON.stringify(u)} must be a feeder id or { feeder, accept: [<run status>...] }` };
    ups.push(entry);
  }
  const venue = config.venue || reg.venue;
  const window = config.window === undefined ? reg.window : config.window;
  const etDate = etDateOverride || todayEt(now);
  const log = (obj) => logger(`[michael:${feeder}] ${JSON.stringify({ et_date: etDate, ...obj })}`);

  if (window && !inWindow(etMinuteOfDay(now), window)) return inert(feeder, etDate, 'outside_et_window', { window });
  // QF-20260912-163: which window (by its registry start time) this attempt is running in, so a
  // multi-window feeder's already_ok check (below) scopes to THIS window, not the whole ET date.
  const windowId = windowIdFor(etMinuteOfDay(now), window);

  const prior = await readPriorRuns(sb, feeder, etDate);
  if (prior.tables_absent) return inert(feeder, etDate, 'tables_absent', { tables_absent: true });
  if (prior.error) return { ok: false, refusal: 'READ_FAILED', message: prior.error };
  const priorReason = inertReasonFor(prior.rows, feeder, now, windowId);
  if (priorReason) return inert(feeder, etDate, priorReason);

  // upstream entries were normalised and validated above (ups).
  if (ups.length) {
    const up = await readRows(sb, 'michael_feeder_runs', (q) => q.eq('et_date', etDate).in('feeder', ups.map((u) => u.feeder)), { select: 'feeder,status' });
    if (up.tables_absent) return inert(feeder, etDate, 'tables_absent', { tables_absent: true });
    if (up.error) return { ok: false, refusal: 'READ_FAILED', message: up.error };
    const notReady = ups.filter((u) => !up.rows.some((r) => r.feeder === u.feeder && u.accept.includes(r.status))).map((u) => u.feeder);
    if (notReady.length) return inert(feeder, etDate, 'upstream_not_ready', { upstream_not_ready: notReady });
  }

  // DRY RUN (every feeder's default, DESIGN F5): same gates, then run() with NO claim, NO run row and NO
  // finish write, so a dry-run morning can never make the registered --apply fire inert with already_ok.
  if (dryRun) {
    const attempt = prior.rows.length ? Math.max(...prior.rows.map((r) => Number(r.attempt) || 0)) + 1 : 1;
    try {
      const out = (await run({ sb, env, now, etDate, attempt, priorRuns: prior.rows, logger, dryRun: true })) || {};
      const status = RUN_STATUSES.has(out.status) ? out.status : 'failed';
      return { ok: true, action: 'dry_run', feeder, et_date: etDate, attempt, venue, status, counts: out.counts && typeof out.counts === 'object' ? out.counts : {}, preview: out.preview === undefined ? null : out.preview };
    } catch (e) {
      return { ok: true, action: 'dry_run', feeder, et_date: etDate, attempt, venue, status: 'failed', counts: { refusal: (e && e.code) || 'RUN_THREW', error_class: e && e.name ? e.name : 'Error' }, preview: null };
    }
  }

  const claim = await claimAttempt(sb, { feeder, etDate, venue, now, prior: prior.rows, windowId });
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
  const finishCounts = windowId ? { ...counts, window: windowId } : counts;
  const fin = await writeRows(sb, 'michael_feeder_runs', (t) => t
    .update({ status, counts: finishCounts, log_md: logMd, finished_at: finishedAt })
    .eq('et_date', etDate).eq('feeder', feeder).eq('attempt', claim.attempt));
  // A finish write the ledger did not hold leaves the row 'skipped'/'started': after the fence expires the
  // feeder would re-run with its side effects already done, so the result carries finish_write_ok=false
  // and exitCodeFor maps it to 1 (visible in Task Scheduler / GHA history).
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
