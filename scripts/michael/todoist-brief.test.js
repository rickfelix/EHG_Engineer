// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D / FR-7, TS-10, TS-15, TS-17 — the Todoist feeder (GHA venue).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { stubClient } from '../../lib/michael/db.test.js';
import { runTodoistBrief, parseEstMinutes, gradeFor, dueDateOf, isDueOrOverdue, snapshotRow, mutationRecord, excludedProjectIds, SNAPSHOT_KEYS, SNAPSHOT_UPDATE_KEYS, EXCLUDED_PROJECT_NAMES } from './todoist-brief.mjs';
import { etDateStr } from '../../lib/time/chairman-et-wall-clock.js';

// 05:00 ET on 2026-09-06 (EDT) -> 09:00Z (inside 04:45-05:30); 02:00 ET -> 06:00Z.
const NOW = new Date('2026-09-06T09:00:00.000Z');
const TWO_AM = new Date('2026-09-06T06:00:00.000Z');
const env = { MICHAEL_DAILY_CHECKIN_TASK_ID: 'T_CHECKIN' };
const MISSING = { data: null, error: { code: '42P01', message: 'relation does not exist' } };
const PROJECTS = [{ id: 'P_EVA', name: 'EVA' }, { id: 'P_FP', name: 'For Processing' }, { id: '6grHWpvVM8QXrj5W', name: 'EHG Chairman' }, { id: 'P_HOME', name: 'Home' }, { id: 'P_EXELON', name: 'Exelon' }];
const RULES = [
  { rule_key: 'todoist/exelon-project', rule_json: { role_tag: 'exelon', match: { project: 'Exelon' } }, auto_apply: false, auto_apply_verb: null },
  { rule_key: 'todoist/home-label', rule_json: { role_tag: 'home', match: { project: 'Home' }, label: 'home-day' }, auto_apply: true, auto_apply_verb: 'label' },
  { rule_key: 'todoist/checkin-today', rule_json: { role_tag: 'ritual', match: { keyword: 'check-in' } }, auto_apply: true, auto_apply_verb: 'reschedule' },
  { rule_key: 'todoist/descriptive-archive', rule_json: { role_tag: 'x', match: { project: 'Home' }, label: 'never' }, auto_apply: true, auto_apply_verb: 'archive' },
];
const TASKS = [
  { id: 't1', content: 'Fix the gutter\nEst: 45m', projectId: 'P_HOME', labels: [], due: { date: '2026-09-06' } },
  { id: 't2', content: 'Cover the shift', description: 'Est: 2 hours', projectId: 'P_EXELON', labels: ['work'], due: { date: '2026-09-05' } },
  { id: 't3', content: 'Untimed thing', projectId: 'P_HOME', labels: ['home-day'], due: { date: '2026-09-06' } },
  { id: 't4', content: 'Future thing', projectId: 'P_HOME', labels: [], due: { date: '2026-09-07' } },
  { id: 't5', content: 'No due', projectId: 'P_HOME', labels: [] },
  { id: 't6', content: 'EVA thing', projectId: 'P_EVA', labels: [], due: { date: '2026-09-06' } },
  { id: 't7', content: 'EHG thing', projectId: '6grHWpvVM8QXrj5W', labels: [], due: { date: '2026-09-06' } },
  { id: 'T_CHECKIN', content: 'Daily check-in', projectId: 'P_HOME', labels: [], due: { date: '2026-09-04' } },
  { id: 't9', content: 'Evening thing', projectId: 'P_HOME', labels: [], due: { datetime: '2026-09-06T03:30:00Z' } },
];

function client({ projects = PROJECTS, tasks = TASKS, rejectUpdate = null, pageSize = 0 } = {}, calls = []) {
  const paged = (all) => (args) => { if (!pageSize) return { results: all }; const start = args && args.cursor ? Number(args.cursor) : 0; return { results: all.slice(start, start + pageSize), nextCursor: start + pageSize < all.length ? String(start + pageSize) : null }; };
  return {
    getProjects: async (args) => { calls.push(['getProjects', args]); return paged(projects)(args); },
    getTasks: async (args) => { calls.push(['getTasks', args]); return paged(tasks)(args); },
    updateTask: async (id, args) => { calls.push(['updateTask', id, args]); if (rejectUpdate && rejectUpdate.has(id)) throw new Error('todoist 500'); return { id }; },
  };
}
function db({ runs = [], rules = RULES, snapshot = [], absent = false, updateAnswer = null } = {}) {
  const calls = [];
  const sb = stubClient((table, ops) => {
    calls.push({ table, kind: ops[0].op, ops });
    if (absent) return MISSING;
    if (ops[0].op === 'update') { const id = ops.find((o) => o.op === 'eq' && o.args[0] === 'task_id'); const tid = id ? id.args[1] : null; return { data: updateAnswer ? updateAnswer(tid, ops[0].args[0]) : [{ task_id: tid }], error: null }; }
    if (ops[0].op !== 'select') return { data: null, error: null };
    if (table === 'michael_feeder_runs') return { data: runs, error: null };
    if (table === 'michael_rules') return { data: rules, error: null };
    if (table === 'michael_todoist_snapshot') return { data: snapshot, error: null };
    return { data: [], error: null };
  });
  return { sb, calls };
}

describe('pure helpers', () => {
  it('parses Est lines in the common shapes and grades S/M/L', () => {
    expect(parseEstMinutes('Fix\nEst: 45m')).toBe(45);
    expect(parseEstMinutes('Est: 2 hours')).toBe(120);
    expect(parseEstMinutes('Est: 1h30')).toBe(90);
    expect(parseEstMinutes('Est: 1.5h')).toBe(90);
    expect(parseEstMinutes('Est: 20 min')).toBe(20);
    expect(parseEstMinutes('Est: 25')).toBe(25);
    // compound forms (adversarial review): no word boundary between the hour unit and the next digit
    expect(parseEstMinutes('Est: 1h30m')).toBe(90);
    expect(parseEstMinutes('Est: 2h15m')).toBe(135);
    expect(parseEstMinutes('Est: 1hr30m')).toBe(90);
    expect(parseEstMinutes('Est: 1h 30')).toBe(90);
    expect(parseEstMinutes('Est: 1 hour 5 minutes')).toBe(65);
    expect(parseEstMinutes('Est: 0m')).toBe(null);
    expect(parseEstMinutes('Estimate everything')).toBe(null);
    expect(parseEstMinutes('Est: soon')).toBe(null);
    expect(parseEstMinutes('')).toBe(null);
    expect(gradeFor(29)).toBe('S'); expect(gradeFor(30)).toBe('M'); expect(gradeFor(89)).toBe('M'); expect(gradeFor(90)).toBe('L'); expect(gradeFor(null)).toBe(null);
  });
  it('due dates: a date is taken as-is, a datetime is converted to the ET calendar date; overdue and today qualify', () => {
    expect(dueDateOf({ due: { date: '2026-09-06' } }, etDateStr)).toBe('2026-09-06');
    // 03:30Z on the 6th is 23:30 ET on the 5th
    expect(dueDateOf({ due: { datetime: '2026-09-06T03:30:00Z' } }, etDateStr)).toBe('2026-09-05');
    // a floating datetime (no offset) is the chairman's ET wall clock: 23:30 on the 5th stays the 5th, never runner-UTC shifted
    expect(dueDateOf({ due: { date: '2026-09-05T23:30:00' } }, etDateStr)).toBe('2026-09-05');
    expect(dueDateOf({ due: { datetime: '2026-09-06T00:30:00', date: '2026-09-06' } }, etDateStr)).toBe('2026-09-06');
    expect(dueDateOf({ due: { datetime: '2026-09-06T03:30:00+00:00' } }, etDateStr)).toBe('2026-09-05');
    expect(dueDateOf({ due: null }, etDateStr)).toBe(null);
    expect(excludedProjectIds([{ id: 'a', name: ' eva ' }, { id: 'b', name: 'Sub', parentId: 'a' }, { id: 'c', name: 'Deeper', parentId: 'b' }, { id: 'd', name: 'Home' }])).toEqual(new Set(['a', 'b', 'c']));
    expect(isDueOrOverdue({ due: { date: '2026-09-05' } }, '2026-09-06', etDateStr)).toBe(true);
    expect(isDueOrOverdue({ due: { date: '2026-09-07' } }, '2026-09-06', etDateStr)).toBe(false);
    expect(isDueOrOverdue({}, '2026-09-06', etDateStr)).toBe(false);
  });
  it('snapshotRow has the uniform owned key set and mutationRecord is redacted to a hash', () => {
    const r = snapshotRow({ etDate: '2026-09-06', task: TASKS[0], roleTag: 'home', ruleKey: 'k' });
    expect(r).toEqual({ et_date: '2026-09-06', task_id: 't1', effort_grade: 'M', est_minutes: 45, role_tag: 'home', rule_key: 'k' });
    expect(Object.keys(r)).toEqual([...SNAPSHOT_KEYS]);
    expect(SNAPSHOT_KEYS).not.toContain('chosen_action'); expect(SNAPSHOT_KEYS).not.toContain('mutations_applied'); expect(SNAPSHOT_KEYS).not.toContain('moved_back_at');
    const m = mutationRecord({ action: 'label:home-day', task: TASKS[0], ruleKey: 'k', at: '2026-09-06T09:00:00.000Z', detail: { label: 'home-day' } });
    expect(m).toMatchObject({ action: 'label:home-day', rule_key: 'k', content_len: TASKS[0].content.length, by: 'todoist-brief', label: 'home-day' });
    expect(m.content_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(m)).not.toContain('gutter');
    expect(EXCLUDED_PROJECT_NAMES).toEqual(['EVA', 'For Processing']);
  });
});

describe('runTodoistBrief', () => {
  it('refuses --date and a bad --et-date; is inert outside 04:45-05:30 ET and while the tables are absent, with no Todoist call', async () => {
    const calls = [];
    expect(await runTodoistBrief({ sb: db().sb, argv: ['--date', 'x'], now: NOW, todoist: client({}, calls), env })).toMatchObject({ ok: false, refusal: 'FLAG_UNSUPPORTED' });
    expect(await runTodoistBrief({ sb: db().sb, argv: ['--et-date', 'x'], now: NOW, todoist: client({}, calls), env })).toMatchObject({ ok: false, refusal: 'ET_DATE_INVALID' });
    expect(await runTodoistBrief({ sb: db().sb, argv: ['--apply'], now: TWO_AM, todoist: client({}, calls), env })).toMatchObject({ action: 'inert', reason: 'outside_et_window' });
    expect(await runTodoistBrief({ sb: db({ absent: true }).sb, argv: ['--apply'], now: NOW, todoist: client({}, calls), env })).toMatchObject({ action: 'inert', reason: 'tables_absent' });
    expect(calls).toEqual([]);
  });
  it('TS-10 dry run: exclusions by name and id, grading, role tags, ungraded null, planned mutations; writes nothing', async () => {
    const calls = [];
    const { sb, calls: dbCalls } = db();
    const r = await runTodoistBrief({ sb, argv: [], now: NOW, todoist: client({}, calls), env });
    expect(r).toMatchObject({ action: 'dry_run', status: 'ok', counts: { tasks_seen: 9, due_or_overdue: 7, excluded_by_name: 1, ehg_pointer: 1, graded: 2, ungraded: 3, role_tagged: 5, mutations_planned: 4 } });
    const byId = Object.fromEntries(r.preview.rows.map((x) => [x.task_id, x]));
    expect(Object.keys(byId).sort()).toEqual(['T_CHECKIN', 't1', 't2', 't3', 't9']);
    expect(byId.t1).toMatchObject({ effort_grade: 'M', est_minutes: 45, role_tag: 'home', rule_key: 'todoist/home-label' });
    expect(byId.t2).toMatchObject({ effort_grade: 'L', est_minutes: 120, role_tag: 'exelon' });
    expect(byId.t3).toMatchObject({ effort_grade: null, est_minutes: null, role_tag: 'home' });
    expect(byId.T_CHECKIN).toMatchObject({ role_tag: 'home' });
    expect(r.preview.mutations).toEqual([
      { task_id: 't1', action: 'label:home-day', rule_key: 'todoist/home-label' },
      { task_id: 'T_CHECKIN', action: 'label:home-day', rule_key: 'todoist/home-label' },
      { task_id: 't9', action: 'label:home-day', rule_key: 'todoist/home-label' },
      { task_id: 'T_CHECKIN', action: 'reschedule:2026-09-06', rule_key: 'todoist/checkin-today' },
    ]);
    expect(calls.filter((c) => c[0] === 'updateTask')).toEqual([]);
    expect(dbCalls.filter((c) => c.kind !== 'select')).toEqual([]);
    expect(JSON.stringify(r.counts)).not.toMatch(/gutter|shift|check-in/i);
  });
  it('TS-10 apply: guarded snapshot writes of the owned keys, label and reschedule mutations applied once and recorded redacted', async () => {
    const calls = [];
    const { sb, calls: dbCalls } = db();
    const r = await runTodoistBrief({ sb, argv: ['--apply'], now: NOW, todoist: client({}, calls), env });
    expect(r).toMatchObject({ action: 'run', status: 'ok', counts: { rows_written: 5, updates: 5, mutations_applied: 4, mutations_deduped: 0, mutation_failed: 0 } });
    const up = dbCalls.find((c) => c.table === 'michael_todoist_snapshot' && c.kind === 'upsert');
    expect(up.ops[0].args[1]).toEqual({ onConflict: 'et_date,task_id', ignoreDuplicates: true });
    for (const row of up.ops[0].args[0]) expect(Object.keys(row)).toEqual([...SNAPSHOT_KEYS]);
    const updates = dbCalls.filter((c) => c.table === 'michael_todoist_snapshot' && c.kind === 'update');
    const snapshotUpdates = updates.filter((u) => !('mutations_applied' in u.ops[0].args[0]));
    expect(snapshotUpdates).toHaveLength(5);
    for (const u of snapshotUpdates) {
      const keys = Object.keys(u.ops[0].args[0]);
      expect(keys.every((k) => SNAPSHOT_UPDATE_KEYS.includes(k))).toBe(true);
      expect(Object.values(u.ops[0].args[0]).some((v) => v === null)).toBe(false);
      expect(u.ops.map((o) => o.op)).toEqual(['update', 'eq', 'eq', 'is', 'is', 'select']);
      expect(u.ops[3].args).toEqual(['chosen_action', null]); expect(u.ops[4].args).toEqual(['moved_back_at', null]);
    }
    // the ungraded rows (t3, t9, T_CHECKIN) never carry effort_grade/est_minutes in their patch: a re-fire cannot null a seat grade
    expect(snapshotUpdates.filter((u) => 'effort_grade' in u.ops[0].args[0]).map((u) => u.ops[2].args[1]).sort()).toEqual(['t1', 't2']);
    const mutUpdates = updates.filter((u) => 'mutations_applied' in u.ops[0].args[0]);
    expect(mutUpdates).toHaveLength(4);
    for (const u of mutUpdates) {
      expect(u.ops.map((o) => o.op)).toEqual(['update', 'eq', 'eq', 'is', 'is', 'select']);
      expect(Array.isArray(u.ops[0].args[0].mutations_applied)).toBe(true);
      expect(JSON.stringify(u.ops[0].args[0])).not.toMatch(/gutter|check-in|Evening/);
    }
    expect(calls.filter((c) => c[0] === 'updateTask')).toEqual([
      ['updateTask', 't1', { labels: ['home-day'] }],
      ['updateTask', 'T_CHECKIN', { labels: ['home-day'] }],
      ['updateTask', 't9', { labels: ['home-day'] }],
      ['updateTask', 'T_CHECKIN', { dueDate: '2026-09-06' }],
    ]);
  });
  it('TS-10 re-run: a mutation already in mutations_applied is deduped, a row with chosen_action set is untouched, an archive-verb rule never mutates', async () => {
    const calls = [];
    const snapshot = [
      { task_id: 't1', mutations_applied: [{ action: 'label:home-day', at: 'x' }], chosen_action: null, moved_back_at: null },
      { task_id: 't9', mutations_applied: [], chosen_action: 'reschedule', moved_back_at: null },
    ];
    const r = await runTodoistBrief({ sb: db({ snapshot }).sb, argv: ['--apply'], now: NOW, todoist: client({}, calls), env });
    expect(r.counts).toMatchObject({ mutations_planned: 4, mutations_applied: 2, mutations_deduped: 1, mutation_skipped_chosen: 1 });
    expect(calls.filter((c) => c[0] === 'updateTask').map((c) => c[1])).toEqual(['T_CHECKIN', 'T_CHECKIN']);
  });
  it('the check-in task already due today is not rescheduled; a failing updateTask is counted and degrades', async () => {
    const calls = [];
    const tasks = TASKS.map((t) => (t.id === 'T_CHECKIN' ? { ...t, due: { date: '2026-09-06' } } : t));
    const r = await runTodoistBrief({ sb: db().sb, argv: [], now: NOW, todoist: client({ tasks }, calls), env });
    expect(r.preview.mutations.map((m) => m.action)).toEqual(['label:home-day', 'label:home-day', 'label:home-day']);
    const f = await runTodoistBrief({ sb: db().sb, argv: ['--apply'], now: NOW, todoist: client({ rejectUpdate: new Set(['t1']) }), env });
    expect(f).toMatchObject({ status: 'degraded', counts: { mutation_failed: 1, mutations_applied: 3 } });
  });
  it('a recurring check-in is re-anchored through its own due string (recurrence kept); one without "every" is skipped with a reason; unconfigured id is surfaced', async () => {
    const calls = [];
    const tasks = TASKS.map((t) => (t.id === 'T_CHECKIN' ? { ...t, due: { date: '2026-09-04', isRecurring: true, string: 'every day' } } : t));
    const r = await runTodoistBrief({ sb: db().sb, argv: ['--apply'], now: NOW, todoist: client({ tasks }, calls), env });
    expect(calls.filter((c) => c[0] === 'updateTask' && c[2].dueString)).toEqual([['updateTask', 'T_CHECKIN', { dueString: 'every day' }]]);
    expect(calls.some((c) => c[0] === 'updateTask' && c[2].dueDate)).toBe(false);
    expect(r.counts).toMatchObject({ mutations_applied: 4, reschedule_skipped: null });
    const odd = TASKS.map((t) => (t.id === 'T_CHECKIN' ? { ...t, due: { date: '2026-09-04', isRecurring: true, string: 'tomorrow' } } : t));
    const s = await runTodoistBrief({ sb: db().sb, argv: [], now: NOW, todoist: client({ tasks: odd }), env });
    expect(s.counts).toMatchObject({ mutations_planned: 3, reschedule_skipped: 'recurring_without_every' });
    const u = await runTodoistBrief({ sb: db().sb, argv: [], now: NOW, todoist: client(), env: {} });
    expect(u.counts).toMatchObject({ mutations_planned: 3, reschedule_skipped: 'checkin_unconfigured' });
  });
  it('a check-in outside the kept set gets a base row before its mutation is recorded; a 0-row record write is counted unrecorded and degrades', async () => {
    const calls = [];
    // the check-in lives in the EHG project (pointer only), overdue: not in `kept`, still rescheduled and given a row
    const tasks = TASKS.map((t) => (t.id === 'T_CHECKIN' ? { ...t, projectId: '6grHWpvVM8QXrj5W' } : t));
    const { sb, calls: dbCalls } = db();
    const r = await runTodoistBrief({ sb, argv: ['--apply'], now: NOW, todoist: client({ tasks }, calls), env });
    expect(r.counts).toMatchObject({ ehg_pointer: 2, rows_added_for_mutation: 1, rows_written: 5, mutations_applied: 3 });
    const up = dbCalls.find((c) => c.table === 'michael_todoist_snapshot' && c.kind === 'upsert');
    expect(up.ops[0].args[0].map((x) => x.task_id)).toContain('T_CHECKIN');
    expect(calls.filter((c) => c[0] === 'updateTask').map((c) => c[1])).toEqual(['t1', 't9', 'T_CHECKIN']);
    const zero = await runTodoistBrief({ sb: db({ updateAnswer: (id, patch) => ('mutations_applied' in patch && id === 't1' ? [] : [{ task_id: id }]) }).sb, argv: ['--apply'], now: NOW, todoist: client(), env });
    expect(zero).toMatchObject({ status: 'degraded', counts: { mutations_applied: 3, mutation_unrecorded: 1, updates: 5 } });
    const unmatched = await runTodoistBrief({ sb: db({ updateAnswer: (id, patch) => ('mutations_applied' in patch || id !== 't2' ? [{ task_id: id }] : []) }).sb, argv: ['--apply'], now: NOW, todoist: client(), env });
    expect(unmatched.counts).toMatchObject({ updates: 4, updates_unmatched: 1 });
  });
  it('a label rule without role_tag or label is inert and counted, never applied', async () => {
    const rules = [...RULES, { rule_key: 'todoist/bare-label', rule_json: { match: { project: 'Home' }, label: 'bare' }, auto_apply: true, auto_apply_verb: 'label' }];
    const r = await runTodoistBrief({ sb: db({ rules }).sb, argv: [], now: NOW, todoist: client(), env });
    expect(r.counts).toMatchObject({ label_rules_inert: 1, mutations_planned: 4 });
    expect(r.preview.mutations.some((m) => m.action === 'label:bare')).toBe(false);
  });
  it('pages through projects and tasks; an exceeded page bound fails the run without writing', async () => {
    const calls = [];
    const r = await runTodoistBrief({ sb: db().sb, argv: [], now: NOW, todoist: client({ pageSize: 4 }, calls), env });
    expect(r.counts.tasks_seen).toBe(9);
    expect(calls.filter((c) => c[0] === 'getTasks')).toHaveLength(3);
  });
  it('is credential-free: no Google import, no host key, TODOIST client created lazily inside run', () => {
    const src = readFileSync(new URL('./todoist-brief.mjs', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n');
    expect(src).not.toMatch(/chairman-oauth|googleapis|readHostKey|MICHAEL_ENCRYPTION_KEY|assertHostVenue|^import .*todoist-sync/m);
  });
});
