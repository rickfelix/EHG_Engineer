#!/usr/bin/env node
// scripts/michael/calendar-read.mjs — the calendar feeder (host Task Scheduler, 04:00-05:00 ET).
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D (FR-3). Spec §5 calendar-read.
//
// Reads today ±1 ET day from 'primary' and the Exelon calendar (MICHAEL_EXELON_CALENDAR_ID), builds
// michael_calendar_day rows keyed (et_date, event_id) with coded_marker / optional / overlap_group, and
// classifies today (Recovery / Interpersonal / Deep / Shallow, coded override, Tuesday-office rule) into
// the run row's counts. Runs under runFeeder: inert outside the window, before the migration, when a
// run is in flight or already ok. DRY-RUN BY DEFAULT (prints what would be written); --apply writes.
// One calendar failing -> degraded (counts.failed_calendar); both failing -> failed. assertHostVenue
// runs FIRST, regardless of injected auth (TR-3). Logs and counts carry ids and numbers only.
//
// Usage: node scripts/michael/calendar-read.mjs [--apply] [--et-date YYYY-MM-DD] [--json]
import 'dotenv/config';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { createMichaelClient, parseArgs, writeRows, refusal, emit } from '../../lib/michael/db.mjs';
import { runFeeder, exitCodeFor, gracefulExit } from '../../lib/michael/feeder.mjs';
import { assertHostVenue } from '../../lib/integrations/google/chairman-oauth.js';
import { listCalendarEvents } from '../../lib/michael/google-clients.mjs';
import { resolveConstant } from '../../lib/michael/constants.mjs';
import { etDateStr, etLocalHour } from '../../lib/time/chairman-et-wall-clock.js';

export const FEEDER = 'calendar-read';
export const PRIMARY = 'primary';
export const CLASSIFICATIONS = Object.freeze(['Recovery', 'Interpersonal', 'Deep', 'Shallow']);
/** Coded markers that override the day classification outright. */
export const CODED_OVERRIDES = Object.freeze({ DEEP: 'Deep', RECOVERY: 'Recovery', OFFICE: 'Interpersonal', SHALLOW: 'Shallow' });
const OFFICE_RE = /\b(office|on-site|onsite|in person|in-person)\b/i;
const ACCEPTED = new Set(['accepted', null]);

/** Pure: 'YYYY-MM-DD' shifted by n days (calendar arithmetic, no timezone). */
export function shiftDate(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Pure: the UTC instant of midnight ET on an ET calendar date (tries the two ET offsets). */
export function etMidnightUtc(dateStr) {
  for (const off of ['-04:00', '-05:00']) {
    const d = new Date(`${dateStr}T00:00:00${off}`);
    if (etDateStr(d) === dateStr && etLocalHour(d) === 0) return d;
  }
  return new Date(`${dateStr}T00:00:00-05:00`);
}

/** Pure: a leading bracket tag such as [DEEP] or [Office], uppercased, or null. */
export function parseCodedMarker(title) {
  const m = /^\s*\[([A-Za-z0-9_-]+)\]/.exec(String(title || ''));
  return m ? m[1].toUpperCase() : null;
}

/** Pure: the chairman's own response status on an event (accepted | declined | tentative | needsAction | null when he is the organizer / no attendees). */
export function selfResponse(event) {
  const self = (Array.isArray(event.attendees) ? event.attendees : []).find((a) => a && a.self === true);
  return self && self.responseStatus ? String(self.responseStatus) : null;
}

/** Pure: optional = unanswered or tentative, or 'optional' in the title, or the attendee marked optional. */
export function isOptional(event) {
  const rs = selfResponse(event);
  if (rs === 'needsAction' || rs === 'tentative') return true;
  const self = (Array.isArray(event.attendees) ? event.attendees : []).find((a) => a && a.self === true);
  if (self && self.optional === true) return true;
  return /\boptional\b/i.test(String(event.summary || ''));
}

/** Pure: one michael_calendar_day row from a Google event (uniform key set, DB-D5). */
export function eventRow(event, calendarId) {
  const allDay = Boolean(event.start && event.start.date && !event.start.dateTime);
  const startsAt = allDay ? null : (event.start && event.start.dateTime ? new Date(event.start.dateTime).toISOString() : null);
  const endsAt = allDay ? null : (event.end && event.end.dateTime ? new Date(event.end.dateTime).toISOString() : null);
  const etDate = allDay ? String(event.start.date) : (startsAt ? etDateStr(new Date(startsAt)) : null);
  return {
    et_date: etDate,
    event_id: String(event.id),
    calendar_id: String(calendarId),
    title: event.summary ? String(event.summary) : null,
    starts_at: startsAt,
    ends_at: endsAt,
    all_day: allDay,
    response_status: selfResponse(event),
    coded_marker: parseCodedMarker(event.summary),
    optional: isOptional(event),
    overlap_group: null,
  };
}

/** Pure: same event_id on both calendars collapses to one row, preferring primary (DB-D7). Returns { rows, collisions }. */
export function dedupeAcrossCalendars(rows) {
  const byKey = new Map();
  let collisions = 0;
  for (const r of rows) {
    const key = `${r.et_date}|${r.event_id}`;
    const cur = byKey.get(key);
    if (!cur) { byKey.set(key, r); continue; }
    collisions += 1;
    if (cur.calendar_id !== PRIMARY && r.calendar_id === PRIMARY) byKey.set(key, r);
  }
  return { rows: [...byKey.values()], collisions };
}

/** Pure: timed events on the same date whose intervals intersect share overlap_group '<date>:g<n>'. Returns new rows. */
export function assignOverlapGroups(rows) {
  const out = rows.map((r) => ({ ...r, overlap_group: null }));
  const byDate = new Map();
  for (const r of out) { if (r.starts_at && r.ends_at) { if (!byDate.has(r.et_date)) byDate.set(r.et_date, []); byDate.get(r.et_date).push(r); } }
  for (const [date, list] of byDate) {
    list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    let group = [], groupEnd = null, n = 0;
    const flush = () => { if (group.length > 1) { n += 1; for (const g of group) g.overlap_group = `${date}:g${n}`; } group = []; groupEnd = null; };
    for (const r of list) {
      if (group.length && r.starts_at < groupEnd) { group.push(r); if (r.ends_at > groupEnd) groupEnd = r.ends_at; }
      else { flush(); group = [r]; groupEnd = r.ends_at; }
    }
    flush();
  }
  return out;
}

/** Pure: ET weekday name for an ET date string. */
export function etWeekday(dateStr) {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(`${dateStr}T12:00:00Z`).getUTCDay()];
}

/**
 * Pure: classify one ET date from its rows. Order: coded override wins; Tuesday-office; Recovery (no
 * non-optional events); Interpersonal (>= 3 accepted meetings); Deep (< 2 meetings); Shallow otherwise.
 */
export function classifyDay(rows, dateStr) {
  const today = rows.filter((r) => r.et_date === dateStr);
  const coded = today.map((r) => r.coded_marker).filter(Boolean);
  const override = coded.map((c) => CODED_OVERRIDES[c]).find(Boolean);
  const accepted = today.filter((r) => !r.optional && ACCEPTED.has(r.response_status));
  const meetings = accepted.filter((r) => !r.all_day);
  const inOffice = accepted.some((r) => r.coded_marker === 'OFFICE' || OFFICE_RE.test(String(r.title || '')));
  let classification, reason;
  if (override) { classification = override; reason = `coded ${coded.find((c) => CODED_OVERRIDES[c])}`; }
  else if (etWeekday(dateStr) === 'Tuesday' && inOffice) { classification = 'Interpersonal'; reason = 'tuesday_office'; }
  else if (today.filter((r) => !r.optional).length === 0) { classification = 'Recovery'; reason = 'no_non_optional_events'; }
  else if (meetings.length >= 3) { classification = 'Interpersonal'; reason = `${meetings.length} accepted meetings`; }
  else if (meetings.length < 2) { classification = 'Deep'; reason = `${meetings.length} meetings`; }
  else { classification = 'Shallow'; reason = '2 meetings'; }
  return { classification, reason, meetings: meetings.length, coded, weekday: etWeekday(dateStr) };
}

/** Pure: per-date counters and the count fields the run row carries (numbers and ids only). */
export function summarize(rows, dateStr) {
  const eventsByDate = {};
  for (const r of rows) eventsByDate[r.et_date] = (eventsByDate[r.et_date] || 0) + 1;
  return {
    ...classifyDay(rows, dateStr),
    events_by_date: eventsByDate,
    coded: rows.filter((r) => r.coded_marker).length,
    optional: rows.filter((r) => r.optional).length,
    overlaps: new Set(rows.map((r) => r.overlap_group).filter(Boolean)).size,
  };
}

/** The feeder. deps: { sb, argv, now, auth, calendar (factory), env }. Never throws. */
export async function runCalendarRead({ sb, argv = [], now = new Date(), auth, calendar, env = process.env } = {}) {
  const a = parseArgs(argv);
  const apply = a.apply === true;
  if (a.date !== undefined) return refusal('FLAG_UNSUPPORTED', '--date is not supported on feeders; use --et-date YYYY-MM-DD');
  const etDateOverride = a['et-date'] !== undefined ? String(a['et-date']) : undefined;
  if (etDateOverride !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(etDateOverride)) return refusal('ET_DATE_INVALID', '--et-date must be YYYY-MM-DD');
  try { assertHostVenue(env); } catch (e) { return refusal(e.code || 'HOST_VENUE_REQUIRED', e.message); }
  const exelon = resolveConstant('MICHAEL_EXELON_CALENDAR_ID', env);
  if (!exelon.ok) return refusal(exelon.refusal, exelon.message, { variable: exelon.variable });

  return runFeeder({
    feeder: FEEDER,
    etDateOverride,
    dryRun: !apply,
    run: async ({ etDate }) => {
      const dates = [shiftDate(etDate, -1), etDate, shiftDate(etDate, 1)];
      const timeMin = etMidnightUtc(dates[0]).toISOString();
      const timeMax = etMidnightUtc(shiftDate(etDate, 2)).toISOString();
      const failed = [];
      let rows = [];
      for (const calendarId of [PRIMARY, exelon.value]) {
        const r = await listCalendarEvents({ calendarId, timeMin, timeMax }, { auth, calendarFactory: calendar, sb, env });
        if (!r.ok) { failed.push({ calendar: calendarId === PRIMARY ? PRIMARY : 'exelon', error: r.error }); continue; }
        for (const ev of r.events) {
          if (!ev || !ev.id || ev.status === 'cancelled') continue;
          const row = eventRow(ev, calendarId);
          if (dates.includes(row.et_date)) rows.push(row);
        }
      }
      if (failed.length === 2) return { status: 'failed', counts: { failed_calendar: failed.map((f) => f.calendar), error_code: failed[0].error.split(':')[0] } };
      const dd = dedupeAcrossCalendars(rows);
      rows = assignOverlapGroups(dd.rows);
      const counts = { ...summarize(rows, etDate), cross_calendar_collisions: dd.collisions, rows_total: rows.length, dates, dry_run: !apply, failed_calendar: failed.map((f) => f.calendar) };
      if (apply && rows.length) {
        const w = await writeRows(sb, 'michael_calendar_day', (t) => t.upsert(rows, { onConflict: 'et_date,event_id' }));
        if (!w.ok) return { status: 'failed', counts: { ...counts, write_refusal: w.refusal } };
        counts.rows_written = rows.length;
      }
      return { status: failed.length ? 'degraded' : 'ok', counts, preview: apply ? undefined : rows };
    },
  }, { sb, env, now });
}

async function main() {
  const argv = process.argv.slice(2);
  const r = await runCalendarRead({ sb: createMichaelClient(), argv });
  emit(r, { json: argv.includes('--json') });
  await gracefulExit(exitCodeFor(r));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(`[michael:calendar-read] fatal ${e && e.code ? e.code : ''}`); process.exitCode = 2; });
}
