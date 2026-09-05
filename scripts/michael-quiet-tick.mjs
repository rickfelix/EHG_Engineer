#!/usr/bin/env node
// michael-quiet-tick — Michael's single recurring loop (spec §1.4 MICHAEL_LOOPS.quiet-tick).
//
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-A (FR-5). Every 15 minutes the seat runs this and reads
// ONE `QUIET_TICK=michael` line plus zero or more `QUIET_TICK_*` action lines (the line contract of
// scripts/adam-quiet-tick.mjs, simplified to flat scalars). The seat acts on the action lines: spawn
// the classify/grade sub-agents (and STOP them the moment their result is read), finalize the brief,
// drain the inbox, encode a staged ruling. This script itself only READS rows and prints.
//
// INERT BEFORE CHILD B (PRD TS-10): every michael_* read treats a missing relation (42P01 / PGRST205)
// as "no source" — the count renders as `?`, NEVER as a healthy-looking 0 (adam-quiet-tick.mjs:1497
// lesson), no QUIET_TICK_ERROR line fires, and the exit code is 0. A genuine query error (anything
// else) DOES set the error field and fires QUIET_TICK_ERROR — table-absent and failure are never
// conflated (the QF-20260822-215 discard class).
//
// Usage: node scripts/michael-quiet-tick.mjs [--json]
//   --json prints ONLY the result object (no QUIET_TICK lines) — DESIGN evidence 8601cbdd.

import 'dotenv/config';
import { etLocalHour, etLocalMinute, etDateStr } from '../lib/time/chairman-et-wall-clock.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

export const PARTY = 'michael';
export const NEXT_WAKE_SECONDS = 900;
// The seat's expected window (spec §1.5); the tick is ACTIVE inside it and QUIET outside.
export const WINDOW_ET = Object.freeze({ start: '04:30', end: '07:30' });
const CLASSIFY_AFTER_ET = '04:30';
const BRIEF_DEADLINE_ET = '05:45';

/** Pure: 'HH:MM' -> minutes since midnight. */
export function hhmmToMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Pure: is the ET wall-clock minute-of-day inside [start, end]? */
export function inWindow(minuteOfDay, window = WINDOW_ET) {
  const s = hhmmToMinutes(window.start), e = hhmmToMinutes(window.end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || !Number.isFinite(minuteOfDay)) return false;
  return s <= e ? (minuteOfDay >= s && minuteOfDay <= e) : (minuteOfDay >= s || minuteOfDay <= e);
}

/** Pure: space-free ISO-8601 ET stamp for the line (the only field that could carry whitespace). */
export function etStamp(now) {
  const h = String(etLocalHour(now)).padStart(2, '0');
  const m = String(etLocalMinute(now)).padStart(2, '0');
  return `${etDateStr(now)}T${h}:${m}ET`;
}

const MISSING_RELATION = new Set(['42P01', 'PGRST205']);
// lib/supabase-client-schema-drift.cjs (SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-A): the canonical service
// client THROWS this code when a head+count probe resolves count=null with no error — the ONLY
// signature of a missing relation under that probe. It is the same fact as 42P01, arriving as a
// throw instead of an error row, and MUST be read the same way: no source, not a failure.
const MISSING_RELATION_THROW_CODES = new Set(['COUNT_UNMEASURABLE']);

/** Pure: does a thrown/returned error mean "the relation does not exist" (child B not landed)? */
export function isMissingRelation(err) {
  if (!err) return false;
  if (MISSING_RELATION.has(err.code) || MISSING_RELATION_THROW_CODES.has(err.code)) return true;
  return /count unmeasurable|relation .* does not exist|schema drift detected/i.test(String(err.message || ''));
}

/**
 * Count rows matching a query. Returns { count: number } on success, { count: null } when the
 * relation does not exist (child B not landed — NOT an error), and { count: null, error } on any
 * other failure. `build` receives the base query and returns the filtered query.
 */
export async function countRows(sb, table, build = (q) => q) {
  try {
    const q = build(sb.from(table).select('id', { count: 'exact', head: true }));
    const { count, error } = await q;
    if (error) {
      if (isMissingRelation(error)) return { count: null };
      return { count: null, error: `${table}: ${error.message || error.code || 'query failed'}` };
    }
    // A null count with no error is the missing-relation signature on a client that does not throw.
    if (count === null || count === undefined) return { count: null };
    return { count: typeof count === 'number' ? count : 0 };
  } catch (e) {
    if (isMissingRelation(e)) return { count: null };
    return { count: null, error: `${table}: ${e && e.message ? e.message : String(e)}` };
  }
}

/**
 * Compute the tick. deps: { sb, now?, env? }. Returns the result object the --json mode prints and
 * renderLines() turns into the line contract. Never throws.
 */
export async function runQuietTick({ sb, now = new Date(), env = process.env } = {}) {
  const etMinute = etLocalHour(now) * 60 + etLocalMinute(now);
  const today = etDateStr(now);
  const mode = inWindow(etMinute) ? 'ACTIVE' : 'QUIET';
  const errors = [];
  const c = async (table, build) => {
    const r = await countRows(sb, table, build);
    if (r.error) errors.push(r.error);
    return r.count;
  };

  const classify = etMinute >= hhmmToMinutes(CLASSIFY_AFTER_ET)
    ? await c('michael_gmail_triage_items', (q) => q.eq('et_date', today).is('class', null))
    : 0;
  const grade = await c('michael_todoist_snapshot', (q) => q.eq('et_date', today).is('effort_grade', null));
  const briefVerified = await c('michael_brief_runs', (q) => q.eq('et_date', today).eq('verified', true));
  const briefUnfinalized = await c('michael_brief_runs', (q) => q.eq('et_date', today).eq('verified', true).is('enriched_at', null));
  const feeder = await c('michael_feeder_runs', (q) => q.eq('et_date', today).eq('status', 'failed'));
  const rulings = await c('michael_staged_items', (q) => q.eq('kind', 'ruling').is('dispositioned_at', null));
  const sid = env.CLAUDE_SESSION_ID || null;
  const inbox = sid
    ? await c('session_coordination', (q) => q.eq('target_session', sid).is('acknowledged_at', null).in('payload->>kind', ['michael_handoff', 'coordinator_request', 'coordinator_directive', 'chairman_directive', 'comms_check']))
    : null;

  // Brief state: 'verified' | 'finalize' | 'missing' | 'pending' | '?'
  let brief;
  if (briefVerified === null) brief = '?';
  else if (briefUnfinalized > 0) brief = 'finalize';
  else if (briefVerified > 0) brief = 'verified';
  else if (etMinute >= hhmmToMinutes(BRIEF_DEADLINE_ET) && inWindow(etMinute)) brief = 'missing';
  else brief = 'pending';

  const reason = mode === 'ACTIVE' ? `inside ${WINDOW_ET.start}-${WINDOW_ET.end} ET window` : `outside ${WINDOW_ET.start}-${WINDOW_ET.end} ET window (seat may park)`;
  return {
    party: PARTY, mode, et_now: etStamp(now), et_date: today,
    classify, grade, brief, feeder, inbox, rulings,
    errors: errors.length, errorDetails: errors,
    nextWakeSeconds: NEXT_WAKE_SECONDS, reason,
  };
}

const q = (v) => (v === null || v === undefined ? '?' : String(v));

/** Pure: the line contract. One QUIET_TICK line, then zero or more QUIET_TICK_* action lines. */
export function renderLines(r) {
  const lines = [
    `QUIET_TICK=${PARTY} mode=${r.mode} et_now=${r.et_now} classify=${q(r.classify)} grade=${q(r.grade)} ` +
    `brief=${r.brief} feeder=${q(r.feeder)} inbox=${q(r.inbox)} rulings=${q(r.rulings)} errors=${r.errors} ` +
    `nextWakeSeconds=${r.nextWakeSeconds} :: ${r.reason}`,
  ];
  if (r.classify > 0) lines.push(`QUIET_TICK_CLASSIFY_QUEUE=${PARTY} count=${r.classify} (spawn the Sonnet classifier + Opus re-judge; record via scripts/michael/classify-apply.mjs; STOP each sub-agent when its result is read)`);
  if (r.grade > 0) lines.push(`QUIET_TICK_GRADE_QUEUE=${PARTY} count=${r.grade} (spawn the Sonnet grader + Opus validator; STOP when read)`);
  if (r.brief === 'finalize') lines.push(`QUIET_TICK_BRIEF_FINALIZE=${PARTY} (write the lede + Today sentence, then node scripts/michael/brief-finalize.mjs)`);
  if (r.brief === 'missing') lines.push(`QUIET_TICK_BRIEF_MISSING=${PARTY} (no verified brief after ${BRIEF_DEADLINE_ET} ET; the opening sentence must say so — never claim more than landed)`);
  if (r.feeder > 0) lines.push(`QUIET_TICK_FEEDER_FAILED=${PARTY} count=${r.feeder} (the failure reaches the chairman as one line in Adam's 6am SMS, never from Michael)`);
  if (r.inbox > 0) lines.push(`QUIET_TICK_INBOX_DIRECTIVE=${PARTY} count=${r.inbox} (drain: node scripts/michael-inbox.cjs)`);
  if (r.rulings > 0) lines.push(`QUIET_TICK_RULING_UNENCODED=${PARTY} count=${r.rulings} (encode via scripts/michael/rule-encode.mjs — ENCODE-BEFORE-NEXT-USE)`);
  if (r.errors > 0) lines.push(`QUIET_TICK_ERROR=${PARTY} count=${r.errors} detail="${r.errorDetails.join(' | ').replace(/"/g, "'").slice(0, 300)}"`);
  return lines;
}

async function main() {
  const asJson = process.argv.includes('--json');
  let sb = null;
  try {
    const { createSupabaseServiceClient } = await import('../lib/supabase-client.js');
    sb = createSupabaseServiceClient();
  } catch (e) {
    const r = { party: PARTY, mode: 'QUIET', et_now: etStamp(new Date()), classify: null, grade: null, brief: '?', feeder: null, inbox: null, rulings: null, errors: 1, errorDetails: [`supabase client unavailable: ${e && e.message ? e.message : e}`], nextWakeSeconds: NEXT_WAKE_SECONDS, reason: 'no database client' };
    if (asJson) console.log(JSON.stringify(r)); else for (const l of renderLines(r)) console.log(l);
    process.exit(0);
  }
  const r = await runQuietTick({ sb });
  if (asJson) console.log(JSON.stringify(r));
  else for (const l of renderLines(r)) console.log(l);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.log(`QUIET_TICK_ERROR=${PARTY} count=1 detail="${String(e && e.message ? e.message : e).replace(/"/g, "'")}"`); process.exit(0); });
}
