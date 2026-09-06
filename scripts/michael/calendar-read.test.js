// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D / FR-3, TS-8, TS-11, TS-15 — the calendar feeder.
import { describe, it, expect, vi } from 'vitest';
import { stubClient } from '../../lib/michael/db.test.js';
import {
  runCalendarRead, parseCodedMarker, isOptional, eventRows, isMeeting, persisted, PERSISTED_KEYS, dedupeAcrossCalendars, assignOverlapGroups,
  classifyDay, summarize, shiftDate, etMidnightUtc, etWeekday, PRIMARY,
} from './calendar-read.mjs';

// 04:30 ET on Sunday 2026-09-06 (EDT) -> 08:30Z; Tuesday 2026-09-08 04:30 ET -> 08:30Z.
const SUNDAY = new Date('2026-09-06T08:30:00.000Z');
const TUESDAY = new Date('2026-09-08T08:30:00.000Z');
const TWO_AM = new Date('2026-09-06T06:00:00.000Z');
const env = { GITHUB_ACTIONS: 'false', CI: '', MICHAEL_EXELON_CALENDAR_ID: 'exelon@group.calendar.google.com' };
const MISSING = { data: null, error: { code: '42P01', message: 'relation does not exist' } };

const ev = (id, start, end, extra = {}) => ({ id, summary: extra.summary || id, start: { dateTime: start }, end: { dateTime: end }, ...extra });
const allDay = (id, date, extra = {}) => ({ id, summary: extra.summary || id, start: { date }, end: { date: shiftDate(date, 1) }, ...extra });
const accepted = { attendees: [{ self: true, responseStatus: 'accepted' }, { email: 'peer@example.org', responseStatus: 'accepted' }] };
const solo = { attendees: [{ self: true, responseStatus: 'accepted' }] };
const tentative = { attendees: [{ self: true, responseStatus: 'tentative' }] };

/** Calendar factory answering per calendarId; records calls. */
function calendars(byId, calls = []) {
  return async (auth) => { calls.push(['factory', auth]); return { events: { list: async (args) => { calls.push(['list', args]); const a = byId[args.calendarId]; if (a instanceof Error) throw a; return { data: { items: a || [] } }; } } }; };
}
function db({ reads = [], writes = [] } = {}) {
  const calls = [];
  let r = 0, w = 0;
  const sb = stubClient((table, ops) => { calls.push({ table, kind: ops[0].op, ops }); if (ops[0].op === 'select') return reads[r++] || { data: [], error: null }; return writes[w++] || { data: null, error: null }; });
  return { sb, calls };
}

describe('pure helpers', () => {
  it('coded markers, optional detection, date shifting and ET midnight', () => {
    expect(parseCodedMarker('[DEEP] writing block')).toBe('DEEP');
    expect(parseCodedMarker('  [office] Tuesday')).toBe('OFFICE');
    expect(parseCodedMarker('Lunch [DEEP]')).toBe(null);
    expect(isOptional({ summary: 'x', ...tentative })).toBe(true);
    expect(isOptional({ summary: 'x', attendees: [{ self: true, responseStatus: 'needsAction' }] })).toBe(true);
    expect(isOptional({ summary: 'Optional: sync', ...accepted })).toBe(true);
    expect(isOptional({ summary: 'x', attendees: [{ self: true, responseStatus: 'accepted', optional: true }] })).toBe(true);
    expect(isOptional({ summary: 'x', ...accepted })).toBe(false);
    expect(shiftDate('2026-09-06', -1)).toBe('2026-09-05');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(etMidnightUtc('2026-09-06').toISOString()).toBe('2026-09-06T04:00:00.000Z');
    expect(etMidnightUtc('2026-12-06').toISOString()).toBe('2026-12-06T05:00:00.000Z');
    expect(etWeekday('2026-09-08')).toBe('Tuesday');
  });
  it('eventRow carries the uniform key set; all-day rows have no times and take their own date', () => {
    const r = eventRows(ev('e1', '2026-09-06T13:00:00Z', '2026-09-06T14:00:00Z', { summary: '[DEEP] Focus', ...accepted }), PRIMARY)[0];
    expect(r).toEqual({ et_date: '2026-09-06', event_id: 'e1', calendar_id: 'primary', title: '[DEEP] Focus', starts_at: '2026-09-06T13:00:00.000Z', ends_at: '2026-09-06T14:00:00.000Z', all_day: false, response_status: 'accepted', coded_marker: 'DEEP', optional: false, overlap_group: null, is_meeting: true });
    expect(Object.keys(persisted(r))).toEqual([...PERSISTED_KEYS]);
    expect(isMeeting({ ...solo })).toBe(false); expect(isMeeting({})).toBe(false);
    // a multi-day all-day event yields one row per covered date (end.date exclusive); malformed events yield none
    expect(eventRows({ id: 'ooo', summary: 'OOO', start: { date: '2026-09-03' }, end: { date: '2026-09-08' } }, PRIMARY).map((x) => x.et_date)).toEqual(['2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07']);
    // a block that began months ago walks only the window's dates and still reaches today
    expect(eventRows({ id: 'leave', start: { date: '2026-07-20' }, end: { date: '2026-10-01' } }, PRIMARY, { from: '2026-09-05', toExclusive: '2026-09-08' }).map((x) => x.et_date)).toEqual(['2026-09-05', '2026-09-06', '2026-09-07']);
    expect(eventRows({ id: 'short', start: { date: '2026-09-06' }, end: { date: '2026-09-07' } }, PRIMARY, { from: '2026-09-05', toExclusive: '2026-09-08' }).map((x) => x.et_date)).toEqual(['2026-09-06']);
    expect(isMeeting({ attendees: [{ self: true }, { email: 'room@resource.calendar.google.com', resource: true }] })).toBe(false);
    expect(eventRows({ id: 'bad', start: { dateTime: 'not a date' } }, PRIMARY)).toEqual([]);
    expect(eventRows({ id: 'nostart' }, PRIMARY)).toEqual([]);
    const a = eventRows(allDay('h1', '2026-09-07', { summary: 'Holiday' }), 'exelon')[0];
    expect(a).toMatchObject({ et_date: '2026-09-07', all_day: true, starts_at: null, ends_at: null, response_status: null, coded_marker: null });
    expect(Object.keys(a)).toEqual(Object.keys(r));
    // 23:30 ET on the 5th is 03:30Z on the 6th: the ET date wins
    expect(eventRows(ev('late', '2026-09-06T03:30:00Z', '2026-09-06T04:30:00Z'), PRIMARY)[0].et_date).toBe('2026-09-05');
  });
  it('dedupes the same event_id across calendars preferring primary, and groups intersecting intervals per date', () => {
    const rows = [eventRows(ev('shared', '2026-09-06T13:00:00Z', '2026-09-06T14:00:00Z'), 'exelon')[0], eventRows(ev('shared', '2026-09-06T13:00:00Z', '2026-09-06T14:00:00Z'), PRIMARY)[0], eventRows(ev('solo', '2026-09-06T15:00:00Z', '2026-09-06T16:00:00Z'), 'exelon')[0]];
    const d = dedupeAcrossCalendars(rows);
    expect(d.collisions).toBe(1);
    expect(d.rows.map((r) => `${r.event_id}@${r.calendar_id}`)).toEqual(['shared@primary', 'solo@exelon']);
    const grouped = assignOverlapGroups([
      eventRows(ev('a', '2026-09-06T13:00:00Z', '2026-09-06T14:00:00Z'), PRIMARY)[0],
      eventRows(ev('b', '2026-09-06T13:30:00Z', '2026-09-06T15:00:00Z'), PRIMARY)[0],
      eventRows(ev('c', '2026-09-06T14:30:00Z', '2026-09-06T15:30:00Z'), PRIMARY)[0],
      eventRows(ev('d', '2026-09-06T15:30:00Z', '2026-09-06T16:00:00Z'), PRIMARY)[0],
      eventRows(ev('e', '2026-09-07T13:00:00Z', '2026-09-07T14:00:00Z'), PRIMARY)[0],
      eventRows(ev('f', '2026-09-07T13:15:00Z', '2026-09-07T13:45:00Z'), PRIMARY)[0],
      eventRows(allDay('g', '2026-09-06'), PRIMARY)[0],
    ]);
    expect(Object.fromEntries(grouped.map((r) => [r.event_id, r.overlap_group]))).toEqual({ a: '2026-09-06:g1', b: '2026-09-06:g1', c: '2026-09-06:g1', d: null, e: '2026-09-07:g1', f: '2026-09-07:g1', g: null });
  });
});

describe('classifyDay (TS-8)', () => {
  const D = '2026-09-06', T = '2026-09-08';
  const timed = (id, h, extra = {}) => eventRows(ev(id, `${D}T${String(h).padStart(2, '0')}:00:00Z`, `${D}T${String(h + 1).padStart(2, '0')}:00:00Z`, { ...accepted, ...extra }), PRIMARY)[0];
  it('Recovery when no non-optional events (none, or only optional/tentative ones)', () => {
    expect(classifyDay([], D)).toMatchObject({ classification: 'Recovery', meetings: 0 });
    expect(classifyDay([eventRows(ev('t', `${D}T13:00:00Z`, `${D}T14:00:00Z`, tentative), PRIMARY)[0]], D)).toMatchObject({ classification: 'Recovery' });
  });
  it('Interpersonal with three or more accepted meetings; Deep with fewer than two; Shallow with exactly two', () => {
    expect(classifyDay([timed('a', 13), timed('b', 15), timed('c', 17)], D)).toMatchObject({ classification: 'Interpersonal', meetings: 3 });
    expect(classifyDay([timed('a', 13)], D)).toMatchObject({ classification: 'Deep', meetings: 1 });
    expect(classifyDay([timed('a', 13), timed('b', 15)], D)).toMatchObject({ classification: 'Shallow', meetings: 2 });
    // a declined meeting and an all-day event do not count as meetings; the all-day event still makes the day non-Recovery
    expect(classifyDay([eventRows(allDay('h', D), PRIMARY)[0], timed('x', 13, { attendees: [{ self: true, responseStatus: 'declined' }, { email: 'p@x' }] })], D)).toMatchObject({ classification: 'Deep', meetings: 0 });
    // self-created timed blocks with no other attendee are not meetings
    expect(classifyDay([timed('gym', 11, solo), timed('lunch', 16, solo), timed('focus', 18, solo)], D)).toMatchObject({ classification: 'Deep', meetings: 0 });
    // a declined coded event never overrides; a day with only declined events is Recovery
    expect(classifyDay([timed('a', 13), timed('b', 15), timed('c', 17), timed('pto', 19, { summary: '[RECOVERY] PTO', attendees: [{ self: true, responseStatus: 'declined' }, { email: 'p@x' }] })], D)).toMatchObject({ classification: 'Interpersonal', coded: [] });
    expect(classifyDay([timed('d', 13, { attendees: [{ self: true, responseStatus: 'declined' }, { email: 'p@x' }] })], D)).toMatchObject({ classification: 'Recovery' });
    // a tentative or unanswered coded invite never overrides either
    expect(classifyDay([timed('a', 13), timed('b', 15), timed('c', 17), timed('maybe', 19, { summary: '[RECOVERY] maybe', ...tentative })], D)).toMatchObject({ classification: 'Interpersonal', coded: [] });
    // three solo blocks with a booked room are still not meetings
    expect(classifyDay([timed('g', 11, { attendees: [{ self: true, responseStatus: 'accepted' }, { resource: true }] }), timed('l', 16, { attendees: [{ self: true, responseStatus: 'accepted' }, { resource: true }] }), timed('f', 18, { attendees: [{ self: true, responseStatus: 'accepted' }, { resource: true }] })], D)).toMatchObject({ classification: 'Deep', meetings: 0 });
  });
  it('a coded event overrides everything, including three meetings and the Tuesday rule', () => {
    expect(classifyDay([timed('a', 13), timed('b', 15), timed('c', 17), timed('d', 19, { summary: '[DEEP] write' })], D)).toMatchObject({ classification: 'Deep', reason: 'coded DEEP', coded: ['DEEP'] });
    const tue = (id, h, extra = {}) => eventRows(ev(id, `${T}T${String(h).padStart(2, '0')}:00:00Z`, `${T}T${String(h + 1).padStart(2, '0')}:00:00Z`, { ...accepted, ...extra }), PRIMARY)[0];
    expect(classifyDay([tue('o', 13, { summary: 'Office day' }), tue('r', 15, { summary: '[RECOVERY] rest' })], T)).toMatchObject({ classification: 'Recovery', reason: 'coded RECOVERY' });
    expect(classifyDay([timed('u', 13, { summary: '[MYSTERY] thing' })], D)).toMatchObject({ classification: 'Deep', coded: ['MYSTERY'] });
  });
  it('Tuesday-office rule marks Tuesday Interpersonal when any accepted in-office event exists, but not on other days', () => {
    const tue = (id, h, extra = {}) => eventRows(ev(id, `${T}T${String(h).padStart(2, '0')}:00:00Z`, `${T}T${String(h + 1).padStart(2, '0')}:00:00Z`, { ...accepted, ...extra }), PRIMARY)[0];
    expect(classifyDay([tue('o', 13, { summary: 'In office: badge day' })], T)).toMatchObject({ classification: 'Interpersonal', reason: 'tuesday_office', weekday: 'Tuesday' });
    expect(classifyDay([tue('o', 13, { summary: '[OFFICE] day' })], T)).toMatchObject({ classification: 'Interpersonal' });
    expect(classifyDay([tue('o', 13, { summary: 'Office day', ...tentative })], T)).toMatchObject({ classification: 'Recovery' });
    expect(classifyDay([timed('o', 13, { summary: 'Office day' })], D)).toMatchObject({ classification: 'Deep', weekday: 'Sunday' });
  });
  it('summarize reports counts by date, coded, optional and overlap groups', () => {
    const rows = assignOverlapGroups([timed('a', 13), timed('b', 13, { summary: '[DEEP] x' }), eventRows(ev('t', `${D}T20:00:00Z`, `${D}T21:00:00Z`, tentative), PRIMARY)[0], eventRows(allDay('n', shiftDate(D, 1)), PRIMARY)[0]]);
    expect(summarize(rows, D)).toMatchObject({ classification: 'Deep', events_by_date: { [D]: 3, [shiftDate(D, 1)]: 1 }, coded: 1, optional: 1, overlaps: 1 });
  });
});

describe('runCalendarRead (TS-11, TS-15)', () => {
  const fixtures = {
    primary: [ev('p1', '2026-09-06T13:00:00Z', '2026-09-06T14:00:00Z', accepted), ev('shared', '2026-09-05T13:00:00Z', '2026-09-05T14:00:00Z'), ev('far', '2026-09-20T13:00:00Z', '2026-09-20T14:00:00Z'), { id: 'gone', status: 'cancelled', start: { dateTime: '2026-09-06T15:00:00Z' }, end: { dateTime: '2026-09-06T16:00:00Z' } }],
    'exelon@group.calendar.google.com': [ev('shared', '2026-09-05T13:00:00Z', '2026-09-05T14:00:00Z'), allDay('x1', '2026-09-07')],
  };
  it('GITHUB_ACTIONS=true is refused HOST_VENUE_REQUIRED before any client or read, even with auth injected', async () => {
    const calls = [];
    const { sb, calls: dbCalls } = db();
    const r = await runCalendarRead({ sb, argv: [], now: SUNDAY, auth: 'AUTH', calendar: calendars(fixtures, calls), env: { ...env, GITHUB_ACTIONS: 'true' } });
    expect(r).toMatchObject({ ok: false, refusal: 'HOST_VENUE_REQUIRED' });
    expect(calls).toEqual([]); expect(dbCalls).toEqual([]);
  });
  it('a missing MICHAEL_EXELON_CALENDAR_ID is CONSTANT_MISSING; --date is refused; outside the window is inert with no API call', async () => {
    const { sb } = db();
    expect(await runCalendarRead({ sb, argv: [], now: SUNDAY, auth: 'AUTH', calendar: calendars(fixtures), env: { GITHUB_ACTIONS: 'false' } })).toMatchObject({ ok: false, refusal: 'CONSTANT_MISSING', variable: 'MICHAEL_EXELON_CALENDAR_ID' });
    expect(await runCalendarRead({ sb, argv: ['--date', '2026-09-06'], now: SUNDAY, auth: 'AUTH', env })).toMatchObject({ ok: false, refusal: 'FLAG_UNSUPPORTED' });
    const calls = [];
    const r = await runCalendarRead({ sb, argv: ['--apply'], now: TWO_AM, auth: 'AUTH', calendar: calendars(fixtures, calls), env });
    expect(r).toMatchObject({ ok: true, action: 'inert', reason: 'outside_et_window' });
    expect(calls).toEqual([]);
    const absent = db({ reads: [MISSING] });
    expect(await runCalendarRead({ sb: absent.sb, argv: ['--apply'], now: SUNDAY, auth: 'AUTH', calendar: calendars(fixtures, calls), env })).toMatchObject({ action: 'inert', reason: 'tables_absent' });
    expect(calls).toEqual([]);
  });
  it('dry run (default) reads both calendars over today ±1 ET, previews the rows and writes nothing', async () => {
    const calls = [];
    const { sb, calls: dbCalls } = db();
    const r = await runCalendarRead({ sb, argv: ['--json'], now: SUNDAY, auth: 'AUTH', calendar: calendars(fixtures, calls), env });
    expect(r).toMatchObject({ ok: true, action: 'dry_run', status: 'ok', et_date: '2026-09-06' });
    expect(calls.filter((c) => c[0] === 'list').map((c) => c[1].calendarId)).toEqual(['primary', 'exelon@group.calendar.google.com']);
    expect(calls[1][1]).toMatchObject({ timeMin: '2026-09-05T04:00:00.000Z', timeMax: '2026-09-08T04:00:00.000Z' });
    expect(r.counts).toMatchObject({ classification: 'Deep', cross_calendar_collisions: 1, rows_total: 3, dry_run: true, failed_calendar: [], truncated_calendar: [], skipped_malformed: 0, events_by_date: { '2026-09-05': 1, '2026-09-06': 1, '2026-09-07': 1 } });
    for (const row of r.preview) expect(Object.keys(row)).toEqual([...PERSISTED_KEYS]);
    expect(r.preview.map((x) => `${x.event_id}@${x.calendar_id}`)).toEqual(['p1@primary', 'shared@primary', 'x1@exelon@group.calendar.google.com']);
    expect(dbCalls.map((c) => c.kind)).toEqual(['select']);
    expect(JSON.stringify(r.counts)).not.toContain('p1@');
  });
  it('--apply upserts the rows by (et_date, event_id) with a uniform key set and writes the run row', async () => {
    const { sb, calls: dbCalls } = db();
    const r = await runCalendarRead({ sb, argv: ['--apply'], now: SUNDAY, auth: 'AUTH', calendar: calendars(fixtures), env });
    expect(r).toMatchObject({ ok: true, action: 'run', status: 'ok', attempt: 1 });
    const up = dbCalls.find((c) => c.table === 'michael_calendar_day');
    expect(up.ops[0].op).toBe('upsert');
    expect(up.ops[0].args[1]).toEqual({ onConflict: 'et_date,event_id' });
    const rows = up.ops[0].args[0];
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(Object.keys(row)).toEqual([...PERSISTED_KEYS]);
    expect(dbCalls.map((c) => `${c.table}:${c.kind}`)).toEqual(['michael_feeder_runs:select', 'michael_feeder_runs:insert', 'michael_calendar_day:upsert', 'michael_feeder_runs:update']);
    expect(dbCalls[3].ops[0].args[0]).toMatchObject({ status: 'ok', counts: { rows_written: 3, classification: 'Deep' } });
  });
  it('one calendar rejecting is degraded with counts.failed_calendar; both rejecting is failed with error_code', async () => {
    const err = Object.assign(new Error('backend'), { code: 503 });
    const one = await runCalendarRead({ sb: db().sb, argv: ['--apply'], now: SUNDAY, auth: 'AUTH', calendar: calendars({ primary: fixtures.primary, 'exelon@group.calendar.google.com': err }), env });
    expect(one).toMatchObject({ action: 'run', status: 'degraded', counts: { failed_calendar: ['exelon'], rows_total: 2 } });
    const both = await runCalendarRead({ sb: db().sb, argv: ['--apply'], now: SUNDAY, auth: 'AUTH', calendar: calendars({ primary: err, 'exelon@group.calendar.google.com': err }), env });
    expect(both).toMatchObject({ action: 'run', status: 'failed', counts: { failed_calendar: ['primary', 'exelon'], error_code: '503' } });
  });
  it('a long all-day block that began before the window reaches today through the run loop', async () => {
    const factory = calendars({ primary: [{ id: 'leave', summary: 'Parental leave', start: { date: '2026-07-20' }, end: { date: '2026-10-01' } }], 'exelon@group.calendar.google.com': [] });
    const r = await runCalendarRead({ sb: db().sb, argv: [], now: SUNDAY, auth: 'AUTH', calendar: factory, env });
    expect(r.preview.map((x) => x.et_date)).toEqual(['2026-09-05', '2026-09-06', '2026-09-07']);
    expect(r.counts).toMatchObject({ rows_total: 3, events_by_date: { '2026-09-06': 1 } });
  });
  it('a truncated calendar page degrades the run, and a malformed event is skipped and counted', async () => {
    const factory = async () => ({ events: { list: async (args) => ({ data: { items: args.calendarId === 'primary' ? [ev('p1', '2026-09-06T13:00:00Z', '2026-09-06T14:00:00Z', accepted), { id: 'bad', start: { dateTime: 'nope' } }] : [], nextPageToken: args.calendarId === 'primary' ? 'tok' : undefined } }) } });
    const r = await runCalendarRead({ sb: db().sb, argv: [], now: SUNDAY, auth: 'AUTH', calendar: factory, env });
    expect(r).toMatchObject({ action: 'dry_run', status: 'degraded', counts: { truncated_calendar: ['primary'], skipped_malformed: 1, rows_total: 1 } });
  });
  it('--et-date pins the ET date and the Tuesday-office rule reaches the counts', async () => {
    const tue = { primary: [ev('o', '2026-09-08T13:00:00Z', '2026-09-08T14:00:00Z', { summary: 'Office day', ...accepted })], 'exelon@group.calendar.google.com': [] };
    const r = await runCalendarRead({ sb: db().sb, argv: ['--et-date', '2026-09-08'], now: TUESDAY, auth: 'AUTH', calendar: calendars(tue), env });
    expect(r).toMatchObject({ action: 'dry_run', et_date: '2026-09-08', counts: { classification: 'Interpersonal', reason: 'tuesday_office' } });
    expect(await runCalendarRead({ sb: db().sb, argv: ['--et-date', 'tuesday'], now: TUESDAY, auth: 'AUTH', env })).toMatchObject({ ok: false, refusal: 'ET_DATE_INVALID' });
  });
  it('does not import googleapis or read a credential at import time', async () => {
    const src = (await import('node:fs')).readFileSync(new URL('./calendar-read.mjs', import.meta.url), 'utf8');
    expect(src).not.toMatch(/from 'googleapis'|readHostKey|getStoredTokens|MICHAEL_ENCRYPTION_KEY/);
    expect(vi.isMockFunction(runCalendarRead)).toBe(false);
  });
});
