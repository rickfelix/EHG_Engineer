// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D / FR-6, TS-9, TS-11, TS-15, TS-19 — the Google Tasks bridge.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { stubClient } from '../../lib/michael/db.test.js';
import { runTasksClassifier, normalizeContent, parseItems, ageHours, routeItem, routePayload, cleanupPayload, errCode, fetchLabeledTasks, ROUTE_KEYS, CLEANUP_KEYS, TASK_LABELS, TITLE_MAX, TODOIST_MAX_PAGES } from './tasks-classifier.mjs';

// 04:00 ET on 2026-09-06 (EDT) -> 08:00Z (inside 03:45-04:30); 02:00 ET -> 06:00Z.
const NOW = new Date('2026-09-06T08:00:00.000Z');
const TWO_AM = new Date('2026-09-06T06:00:00.000Z');
const env = { GITHUB_ACTIONS: 'false', CI: '', MICHAEL_TASKS_DRIVE_FOLDER_ID: 'FOLDER' };
const MISSING = { data: null, error: { code: '42P01', message: 'relation does not exist' } };
const RULES = [{ rule_key: 'tasks/four-bucket', rule_json: { buckets: { ehg: ['venture', 'leo'], exelon: ['outage', 'shift'], home: ['dentist', 'car'], errand: ['buy', 'pick up'] }, projects: { exelon: 'P_EXELON', home: 'P_HOME' } } }];
const FRESH = '2026-09-06T02:00:00.000Z';
const ITEMS = [{ id: 'g1', title: 'Book the dentist' }, { id: 'g2', title: 'Cover the night shift' }, { id: 'g3', title: 'Review the LEO roadmap' }, { id: 'g4', title: 'Call mom' }, { id: 'g5', title: 'Buy milk' }];

function driveFactory({ files = [{ id: 'F_TASKS', name: 'current-tasks.json', parents: ['FOLDER'], modifiedTime: FRESH }], text = JSON.stringify({ items: ITEMS }), reject = null } = {}, calls = []) {
  return async (auth) => {
    calls.push(['factory', auth]);
    return { files: {
      list: async (args) => { calls.push(['files.list', args]); if (reject) throw reject; return { data: { files } }; },
      get: async (args, opts) => { calls.push(['files.get', args, opts]); if (args.alt === 'media') return { data: text }; return { data: files.find((f) => f.id === args.fileId) || { id: args.fileId, parents: [] } }; },
    } };
  };
}
function todoistClient({ tasks = [], rejectAdd = null, pageSize = 0 } = {}, calls = []) {
  return {
    getTasks: async (args) => {
      calls.push(['getTasks', args]);
      if (!pageSize) return { results: tasks };
      const start = args.cursor ? Number(args.cursor) : 0;
      const page = tasks.slice(start, start + pageSize);
      return { results: page, nextCursor: start + pageSize < tasks.length ? String(start + pageSize) : null };
    },
    addTask: async (args) => { calls.push(['addTask', args]); if (rejectAdd && rejectAdd.has(args.content)) throw new Error('todoist 500'); return { id: `T_${calls.length}` }; },
  };
}
function db({ runs = [], okRuns = [], rules = RULES, open = {}, ledger = [], absent = false } = {}) {
  const calls = [];
  const sb = stubClient((table, ops) => {
    calls.push({ table, kind: ops[0].op, ops });
    if (absent) return MISSING;
    if (ops[0].op !== 'select') return { data: null, error: null };
    // the marker read is the feeder-scoped, status-free, started_at-ordered read; the harness read is date-scoped
    if (table === 'michael_feeder_runs') return { data: ops.some((o) => o.op === 'eq' && o.args[0] === 'feeder') ? okRuns : runs, error: null };
    if (table === 'michael_rules') return { data: rules, error: null };
    if (table === 'michael_staged_items') {
      const k = ops.find((o) => o.op === 'eq' && o.args[0] === 'kind');
      const kind = k ? k.args[1] : '';
      // the bridged-id ledger read has no dispositioned_at filter; the stage dedupe read does
      if (kind === 'tasks_cleanup' && !ops.some((o) => o.op === 'is')) return { data: ledger.map((payload) => ({ payload })), error: null };
      return { data: (open[kind] || []).map((payload) => ({ payload })), error: null };
    }
    return { data: [], error: null };
  });
  return { sb, calls };
}

describe('pure helpers', () => {
  it('normalizes content, parses both file shapes, ages a file, and routes by the first matching rule with a project', () => {
    expect(normalizeContent('  Buy MILK!! ')).toBe('buy milk');
    expect(parseItems(JSON.stringify([{ id: 1, title: ' a ' }, { id: 2, content: 'b' }, { id: 3 }, { title: 'no id' }]))).toEqual([{ id: '1', title: 'a' }, { id: '2', title: 'b' }]);
    expect(parseItems('not json')).toBe(null);
    expect(parseItems(JSON.stringify({ nope: [] }))).toBe(null);
    expect(ageHours('2026-09-05T08:00:00.000Z', NOW)).toBe(24);
    expect(ageHours('garbage', NOW)).toBe(Infinity);
    expect(routeItem(RULES, { id: 'x', title: 'book the dentist' })).toEqual({ bucket: 'home', project_id: 'P_HOME', rule_key: 'tasks/four-bucket', keyword: 'dentist' });
    expect(routeItem(RULES, { id: 'x', title: 'venture review' }, { ehg: 'P_EHG' })).toMatchObject({ bucket: 'ehg', project_id: 'P_EHG' });
    expect(routeItem(RULES, { id: 'x', title: 'venture review' })).toBe(null);
    expect(routeItem(RULES, { id: 'x', title: 'buy milk' })).toBe(null);
    expect(routeItem([{ rule_key: 'n', rule_json: null }], { id: 'x', title: 'anything' })).toBe(null);
  });
  it('staged payloads carry exactly the named keys and a 200-char title', () => {
    const long = 'x'.repeat(500);
    const p = routePayload('2026-09-06', { id: 'g9', title: long }, 'F_TASKS');
    expect(Object.keys(p)).toEqual([...ROUTE_KEYS]);
    expect(p).toMatchObject({ dedupe_key: '2026-09-06:g9', source_file_id: 'F_TASKS', reason: 'no_rule' });
    expect(p.title).toHaveLength(TITLE_MAX);
    expect(p.dedupe_sha256).toMatch(/^[0-9a-f]{64}$/);
    const c = cleanupPayload('2026-09-06', 'F_TASKS', FRESH, ['g2', 'g1']);
    expect(Object.keys(c)).toEqual([...CLEANUP_KEYS]);
    expect(c).toMatchObject({ dedupe_key: `2026-09-06:cleanup:F_TASKS:${FRESH}`, item_ids: ['g1', 'g2'], count: 2 });
    expect(errCode('404: File not found')).toBe('404');
    expect(errCode('FILE_OUTSIDE_CONFIGURED_FOLDER')).toBe('FILE_OUTSIDE_CONFIGURED_FOLDER');
    expect(errCode('File not found: current-tasks.json')).toBe('API_ERROR');
  });
  it('fetchLabeledTasks follows nextCursor across pages and reports an exceeded page bound', async () => {
    const tasks = Array.from({ length: 120 }, (_, i) => ({ content: `t${i}`, labels: [] }));
    const calls = [];
    const r = await fetchLabeledTasks(todoistClient({ tasks, pageSize: 50 }, calls), 'captured');
    expect(r).toMatchObject({ complete: true, pages: 3 });
    expect(r.tasks).toHaveLength(120);
    expect(calls.map((c) => c[1])).toEqual([{ label: 'captured' }, { label: 'captured', cursor: '50' }, { label: 'captured', cursor: '100' }]);
    const huge = Array.from({ length: 50 * (TODOIST_MAX_PAGES + 1) }, (_, i) => ({ content: `h${i}`, labels: [] }));
    expect(await fetchLabeledTasks(todoistClient({ tasks: huge, pageSize: 50 }), 'captured')).toMatchObject({ complete: false, pages: TODOIST_MAX_PAGES });
  });
});

describe('runTasksClassifier', () => {
  it('refuses GITHUB_ACTIONS=true before any Drive call even with auth injected; missing folder constant; --date', async () => {
    const calls = [];
    const { sb, calls: dbCalls } = db();
    expect(await runTasksClassifier({ sb, argv: ['--apply'], now: NOW, auth: 'AUTH', drive: driveFactory({}, calls), todoist: todoistClient(), env: { ...env, GITHUB_ACTIONS: 'true' } })).toMatchObject({ ok: false, refusal: 'HOST_VENUE_REQUIRED' });
    expect(await runTasksClassifier({ sb, argv: [], now: NOW, auth: 'AUTH', drive: driveFactory({}, calls), env: { GITHUB_ACTIONS: 'false' } })).toMatchObject({ ok: false, refusal: 'CONSTANT_MISSING', variable: 'MICHAEL_TASKS_DRIVE_FOLDER_ID' });
    expect(await runTasksClassifier({ sb, argv: ['--date', '2026-09-06'], now: NOW, auth: 'AUTH', env })).toMatchObject({ ok: false, refusal: 'FLAG_UNSUPPORTED' });
    expect(calls).toEqual([]); expect(dbCalls).toEqual([]);
  });
  it('is inert outside 03:45-04:30 ET and while the tables are absent, with no Drive call', async () => {
    const calls = [];
    expect(await runTasksClassifier({ sb: db().sb, argv: ['--apply'], now: TWO_AM, auth: 'AUTH', drive: driveFactory({}, calls), env })).toMatchObject({ action: 'inert', reason: 'outside_et_window' });
    expect(await runTasksClassifier({ sb: db({ absent: true }).sb, argv: ['--apply'], now: NOW, auth: 'AUTH', drive: driveFactory({}, calls), env })).toMatchObject({ action: 'inert', reason: 'tables_absent' });
    expect(calls).toEqual([]);
  });
  it('TS-9: a stale file (> 36 h) is skipped/stale with no Todoist call; a missing file is skipped/file_missing', async () => {
    const tcalls = [];
    const stale = await runTasksClassifier({ sb: db().sb, argv: ['--apply'], now: NOW, auth: 'AUTH', drive: driveFactory({ files: [{ id: 'F_TASKS', name: 'current-tasks.json', parents: ['FOLDER'], modifiedTime: '2026-09-04T00:00:00.000Z' }] }), todoist: todoistClient({}, tcalls), env });
    expect(stale).toMatchObject({ action: 'run', status: 'skipped', counts: { reason: 'stale' } });
    expect(tcalls).toEqual([]);
    expect(await runTasksClassifier({ sb: db().sb, argv: [], now: NOW, auth: 'AUTH', drive: driveFactory({ files: [] }), env })).toMatchObject({ status: 'skipped', counts: { reason: 'file_missing' } });
  });
  it('TS-9: an unconsumed cleanup-pending.json (newer than the last ok run marker) is skipped/cleanup_pending; a consumed one proceeds', async () => {
    const files = [{ id: 'F_TASKS', name: 'current-tasks.json', parents: ['FOLDER'], modifiedTime: FRESH }, { id: 'F_CLEAN', name: 'cleanup-pending.json', parents: ['FOLDER'], modifiedTime: '2026-09-05T20:00:00.000Z' }];
    const tcalls = [];
    expect(await runTasksClassifier({ sb: db().sb, argv: ['--apply'], now: NOW, auth: 'AUTH', drive: driveFactory({ files }), todoist: todoistClient({}, tcalls), env })).toMatchObject({ status: 'skipped', counts: { reason: 'cleanup_pending' } });
    expect(tcalls).toEqual([]);
    // the skipped run records the file's modifiedTime as the marker, so the very next fire proceeds
    const skipped = await runTasksClassifier({ sb: db().sb, argv: ['--apply'], now: NOW, auth: 'AUTH', drive: driveFactory({ files }), todoist: todoistClient(), env });
    expect(skipped.counts.cleanup_marker).toBe('2026-09-05T20:00:00.000Z');
    const consumed = db({ okRuns: [{ counts: { reason: 'cleanup_pending', cleanup_marker: '2026-09-05T20:00:00.000Z' } }, { counts: {} }] });
    const next = await runTasksClassifier({ sb: consumed.sb, argv: [], now: NOW, auth: 'AUTH', drive: driveFactory({ files }), todoist: todoistClient(), env });
    expect(next).toMatchObject({ status: 'ok', counts: { cleanup_marker: '2026-09-05T20:00:00.000Z' } });
    // a NEWER cleanup file trips the guard again
    const newer = files.map((f) => (f.name === 'cleanup-pending.json' ? { ...f, modifiedTime: '2026-09-06T01:00:00.000Z' } : f));
    expect((await runTasksClassifier({ sb: consumed.sb, argv: [], now: NOW, auth: 'AUTH', drive: driveFactory({ files: newer }), todoist: todoistClient(), env })).counts).toMatchObject({ reason: 'cleanup_pending' });
  });
  it('TS-9 dry run: routes by bucket, previews creations and stagings, calls no addTask and writes nothing', async () => {
    const tcalls = [];
    const { sb, calls: dbCalls } = db();
    const r = await runTasksClassifier({ sb, argv: [], now: NOW, auth: 'AUTH', drive: driveFactory(), todoist: todoistClient({ tasks: [{ content: 'Cover the night shift', labels: ['captured', 'from-google-tasks'], addedAt: '2026-09-05T12:00:00.000Z' }] }, tcalls), env });
    expect(r).toMatchObject({ action: 'dry_run', status: 'ok', counts: { items: 5, routed: 3, unrouted: 2, duplicates: 1, created: 0, buckets: { home: 1, exelon: 1, ehg: 1 }, todoist_recent: 1, cleanup_written_to_drive: false } });
    expect(tcalls).toEqual([['getTasks', { label: 'captured' }]]);
    expect(r.preview.would_create).toEqual([{ id: 'g1', bucket: 'home', project_id: 'P_HOME' }, { id: 'g3', bucket: 'ehg', project_id: '6grHWpvVM8QXrj5W' }]);
    expect(r.preview.task_route.map((p) => p.dedupe_key)).toEqual(['2026-09-06:g4', '2026-09-06:g5']);
    expect(r.preview.tasks_cleanup[0]).toMatchObject({ item_ids: ['g1', 'g2', 'g3'], count: 3 });
    expect(dbCalls.filter((c) => c.kind !== 'select')).toEqual([]);
    expect(JSON.stringify(r.counts)).not.toMatch(/dentist|shift|mom|milk/i);
  });
  it('TS-9 apply: creates routed non-duplicate tasks with both labels, stages unrouted items and the consumed set, never writes Drive', async () => {
    const tcalls = [], dcalls = [];
    const { sb, calls: dbCalls } = db();
    const r = await runTasksClassifier({ sb, argv: ['--apply'], now: NOW, auth: 'AUTH', drive: driveFactory({}, dcalls), todoist: todoistClient({ tasks: [{ content: 'cover the NIGHT shift', labels: ['captured', 'from-google-tasks'], addedAt: '2026-09-05T12:00:00.000Z' }, { content: 'Book the dentist', labels: ['captured'], addedAt: '2026-09-05T12:00:00.000Z' }, { content: 'Buy milk', labels: ['captured', 'from-google-tasks'], addedAt: '2026-08-01T00:00:00.000Z' }] }, tcalls), env });
    expect(r).toMatchObject({ action: 'run', status: 'ok', counts: { created: 2, duplicates: 1, staged_task_route: 2, staged_cleanup: 1, cleanup_staged: true, cleanup_written_to_drive: false } });
    expect(tcalls.filter((c) => c[0] === 'addTask')).toEqual([['addTask', { content: 'Book the dentist', projectId: 'P_HOME', labels: [...TASK_LABELS] }], ['addTask', { content: 'Review the LEO roadmap', projectId: '6grHWpvVM8QXrj5W', labels: [...TASK_LABELS] }]]);
    const inserts = dbCalls.filter((c) => c.table === 'michael_staged_items' && c.kind === 'insert');
    expect(inserts).toHaveLength(2);
    expect(inserts[0].ops[0].args[0].map((x) => x.kind)).toEqual(['task_route', 'task_route']);
    for (const row of inserts[0].ops[0].args[0]) expect(Object.keys(row.payload)).toEqual([...ROUTE_KEYS]);
    expect(inserts[1].ops[0].args[0][0]).toMatchObject({ kind: 'tasks_cleanup', payload: { item_ids: ['g1', 'g2', 'g3'], count: 3 } });
    expect(dcalls.filter((c) => c[0] === 'files.get' && c[1].alt === 'media')).toHaveLength(1);
    expect(dcalls.some((c) => /create|update/.test(c[0]))).toBe(false);
    const reads = dbCalls.filter((c) => c.table === 'michael_staged_items' && c.kind === 'select');
    const opens = reads.filter((c) => c.ops.some((o) => o.op === 'is'));
    expect(opens).toHaveLength(2);
    for (const o of opens) expect(o.ops.map((x) => x.op)).toEqual(['select', 'limit', 'eq', 'is']);
    // the bridged-id ledger read covers open AND dispositioned tasks_cleanup rows
    const ledgerReads = reads.filter((c) => !c.ops.some((o) => o.op === 'is'));
    expect(ledgerReads).toHaveLength(1);
    expect(ledgerReads[0].ops.map((x) => x.op)).toEqual(['select', 'limit', 'eq', 'order']);
  });
  it('TS-19: a second fire stages zero duplicates for dedupe_keys already open', async () => {
    // g4 is open under yesterday's key: the same item is not re-staged under today's key either
    const { sb, calls: dbCalls } = db({ open: { task_route: [{ dedupe_key: '2026-09-05:g4' }], tasks_cleanup: [{ dedupe_key: `2026-09-06:cleanup:F_TASKS:${FRESH}` }] } });
    const r = await runTasksClassifier({ sb, argv: ['--apply'], now: NOW, auth: 'AUTH', drive: driveFactory(), todoist: todoistClient(), env });
    expect(r.counts).toMatchObject({ staged_task_route: 1, staged_cleanup: 0, stage_dupes_skipped: 2 });
    const inserts = dbCalls.filter((c) => c.table === 'michael_staged_items' && c.kind === 'insert');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].ops[0].args[0].map((x) => x.payload.dedupe_key)).toEqual(['2026-09-06:g5']);
  });
  it('an item this feeder already bridged (tasks_cleanup ledger) is never re-created, even after its Todoist twin was completed or aged past 7 days', async () => {
    const tcalls = [];
    const { sb } = db({ ledger: [{ dedupe_key: '2026-09-04:cleanup:F_TASKS:x', item_ids: ['g1', 'g3'], count: 2 }] });
    const r = await runTasksClassifier({ sb, argv: ['--apply'], now: NOW, auth: 'AUTH', drive: driveFactory(), todoist: todoistClient({ tasks: [] }, tcalls), env });
    expect(tcalls.filter((c) => c[0] === 'addTask').map((c) => c[1].content)).toEqual(['Cover the night shift']);
    expect(r.counts).toMatchObject({ already_bridged: 2, created: 1, duplicates: 0 });
  });
  it('the Todoist dedupe follows every page: a twin on page 2 is still a duplicate', async () => {
    const tcalls = [];
    const filler = Array.from({ length: 50 }, (_, i) => ({ content: `other ${i}`, labels: ['captured', 'from-google-tasks'], addedAt: '2026-09-05T12:00:00.000Z' }));
    const tasks = [...filler, { content: 'book the dentist', labels: ['captured', 'from-google-tasks'], addedAt: '2026-09-05T12:00:00.000Z' }];
    const r = await runTasksClassifier({ sb: db().sb, argv: ['--apply'], now: NOW, auth: 'AUTH', drive: driveFactory(), todoist: todoistClient({ tasks, pageSize: 50 }, tcalls), env });
    expect(r.counts).toMatchObject({ todoist_pages: 2, duplicates: 1, created: 2 });
    expect(tcalls.filter((c) => c[0] === 'addTask').map((c) => c[1].content)).not.toContain('Book the dentist');
  });
  it('a failing addTask is counted and degrades; an unreachable Todoist dedupe creates nothing and degrades; an unparseable file fails', async () => {
    const tcalls = [];
    const r = await runTasksClassifier({ sb: db().sb, argv: ['--apply'], now: NOW, auth: 'AUTH', drive: driveFactory(), todoist: todoistClient({ rejectAdd: new Set(['Book the dentist']) }, tcalls), env });
    expect(r).toMatchObject({ status: 'degraded', counts: { create_failed: 1, created: 2 } });
    const broken = { getTasks: async () => { throw Object.assign(new Error('down'), { code: 'ECONNRESET' }); }, addTask: vi.fn() };
    const d = await runTasksClassifier({ sb: db().sb, argv: ['--apply'], now: NOW, auth: 'AUTH', drive: driveFactory(), todoist: broken, env });
    expect(d).toMatchObject({ status: 'degraded', counts: { created: 0, dedupe_error: 'ECONNRESET' } });
    expect(broken.addTask).not.toHaveBeenCalled();
    expect(await runTasksClassifier({ sb: db().sb, argv: [], now: NOW, auth: 'AUTH', drive: driveFactory({ text: 'nope' }), todoist: todoistClient(), env })).toMatchObject({ status: 'failed', counts: { error_code: 'FILE_UNPARSEABLE' } });
  });
  it('imports no Todoist or Google SDK at module load and reads no credential directly', () => {
    const src = readFileSync(new URL('./tasks-classifier.mjs', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n');
    expect(src).not.toMatch(/^import .*todoist-sync|from 'googleapis'|readHostKey|getStoredTokens|MICHAEL_ENCRYPTION_KEY|files\.(create|update)/m);
  });
});
