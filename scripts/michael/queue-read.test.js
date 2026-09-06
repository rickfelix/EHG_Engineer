// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D / FR-9 (PR 8a) — the seat's queue reader.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { stubClient } from '../../lib/michael/db.test.js';
import { runQueueRead, exitCodeForQueue, READ_BOUND, HEADERS_MAX, ITEM_KEYS, TASK_KEYS } from './queue-read.mjs';

// 05:00 ET on 2026-09-06 (EDT) -> 09:00Z
const NOW = new Date('2026-09-06T09:00:00.000Z');
const env = { GITHUB_ACTIONS: 'false', CI: '' };
const MISSING = { data: null, error: { code: '42P01', message: 'relation does not exist' } };
const ITEMS = [
  { thread_id: 't1', rule_key: null, last_message_id: 'm1', borderline: false, summary: 'never printed', needs_you_reason: 'never printed' },
  { thread_id: 't2', rule_key: 'gmail/vercel', last_message_id: 'm2', borderline: true },
];
const TASKS = [{ task_id: 'k1', proposed_date: null, role_tag: 'home' }, { task_id: 'k2', proposed_date: '2026-09-07' }];

/** DB stub scripted per table; records every call. `counts` answers the exact-count reads. */
function db({ items = ITEMS, tasks = TASKS, absent = false, counts = {}, fail = null } = {}) {
  const calls = [];
  const sb = stubClient((table, ops) => {
    calls.push({ table, ops });
    if (absent) return MISSING;
    if (fail === table) return { data: null, error: { code: '57014', message: 'statement timeout' } };
    const head = ops[0].args[1] && ops[0].args[1].head === true;
    if (head) return { data: null, count: counts[table] ?? null, error: null };
    if (table === 'michael_gmail_triage_items') return { data: items, error: null };
    if (table === 'michael_todoist_snapshot') return { data: tasks, error: null };
    return { data: [], error: null };
  });
  return { sb, calls };
}
/** Gmail factory answering threads.get with metadata headers; records calls. */
function gmailFactory({ reject = new Set() } = {}, calls = []) {
  return async (auth) => {
    calls.push(['factory', auth]);
    return { users: { threads: { get: async (args) => {
      calls.push(['threads.get', args]);
      if (reject.has(args.id)) throw new Error('boom');
      return { data: { id: args.id, messages: [{ id: `m-${args.id}`, labelIds: ['INBOX'], payload: { headers: [{ name: 'From', value: `${args.id}@example.org` }, { name: 'Subject', value: `About ${args.id}` }, { name: 'Date', value: 'Sun, 6 Sep 2026 04:00:00 -0400' }] } }] } };
    } } } };
  };
}

describe('runQueueRead', () => {
  it('reads the class-null items and effort_grade-null tasks for the ET date, bounded by the literal read bound, and prints only the published keys', async () => {
    const { sb, calls } = db();
    const r = await runQueueRead({ sb, argv: [], now: NOW, env });
    expect(r).toMatchObject({ ok: true, tables_absent: false, et_date: '2026-09-06', counts: { items: 2, tasks: 2, items_truncated: false, tasks_truncated: false } });
    expect(r.items).toEqual([{ thread_id: 't1', rule_key: null, last_message_id: 'm1', borderline: false }, { thread_id: 't2', rule_key: 'gmail/vercel', last_message_id: 'm2', borderline: true }]);
    expect(r.tasks).toEqual([{ task_id: 'k1', proposed_date: null }, { task_id: 'k2', proposed_date: '2026-09-07' }]);
    for (const it of r.items) expect(Object.keys(it)).toEqual([...ITEM_KEYS]);
    for (const t of r.tasks) expect(Object.keys(t)).toEqual([...TASK_KEYS]);
    expect(JSON.stringify(r)).not.toMatch(/never printed/);
    const [itemsRead, tasksRead] = calls;
    expect(itemsRead.table).toBe('michael_gmail_triage_items');
    expect(itemsRead.ops.map((o) => o.op)).toEqual(['select', 'limit', 'eq', 'is', 'order']);
    expect(itemsRead.ops[1].args).toEqual([READ_BOUND]); expect(READ_BOUND).toBe(500);
    expect(itemsRead.ops[2].args).toEqual(['et_date', '2026-09-06']); expect(itemsRead.ops[3].args).toEqual(['class', null]);
    expect(tasksRead.table).toBe('michael_todoist_snapshot');
    expect(tasksRead.ops[2].args).toEqual(['et_date', '2026-09-06']); expect(tasksRead.ops[3].args).toEqual(['effort_grade', null]);
    expect(calls).toHaveLength(2);
    expect(exitCodeForQueue(r)).toBe(0);
  });
  it('--et-date overrides the date and is validated; --date is refused; a read failure is reported with exit 1', async () => {
    const { sb, calls } = db();
    const r = await runQueueRead({ sb, argv: ['--et-date', '2026-09-05'], now: NOW, env });
    expect(r.et_date).toBe('2026-09-05'); expect(calls[0].ops[2].args).toEqual(['et_date', '2026-09-05']);
    expect(await runQueueRead({ sb, argv: ['--et-date', 'yesterday'], now: NOW, env })).toMatchObject({ ok: false, refusal: 'ET_DATE_INVALID' });
    const d = await runQueueRead({ sb, argv: ['--date', '2026-09-05'], now: NOW, env });
    expect(d).toMatchObject({ ok: false, refusal: 'FLAG_UNSUPPORTED' }); expect(exitCodeForQueue(d)).toBe(2);
    const f = await runQueueRead({ sb: db({ fail: 'michael_todoist_snapshot' }).sb, argv: [], now: NOW, env });
    expect(f.ok).toBe(false); expect(f.errors).toHaveLength(1); expect(f.items).toHaveLength(2); expect(exitCodeForQueue(f)).toBe(1);
  });
  it('absent tables yield empty lists, ok, exit 0 and no second read', async () => {
    const { sb, calls } = db({ absent: true });
    const r = await runQueueRead({ sb, argv: [], now: NOW, env });
    expect(r).toEqual({ ok: true, tables_absent: true, et_date: '2026-09-06', items: [], tasks: [], counts: { items: 0, tasks: 0 }, errors: [] });
    expect(calls).toHaveLength(1);
    expect(exitCodeForQueue(r)).toBe(0);
  });
  it('a full page is reported truncated and only then counted exactly (presence first, never a head-count on an absent table)', async () => {
    const items = Array.from({ length: READ_BOUND }, (_, i) => ({ thread_id: `t${i}`, rule_key: null, last_message_id: null, borderline: false }));
    const { sb, calls } = db({ items, counts: { michael_gmail_triage_items: 1234 } });
    const r = await runQueueRead({ sb, argv: [], now: NOW, env });
    expect(r.counts).toMatchObject({ items: 500, items_truncated: true, items_total: 1234, tasks_truncated: false });
    expect(r.counts.tasks_total).toBeUndefined();
    const heads = calls.filter((c) => c.ops[0].args[1] && c.ops[0].args[1].head === true);
    expect(heads).toHaveLength(1);
    expect(heads[0].table).toBe('michael_gmail_triage_items');
    expect(heads[0].ops.slice(1).map((o) => o.args)).toEqual([['et_date', '2026-09-06'], ['class', null]]);
    expect(exitCodeForQueue(r)).toBe(0);
  });
  it('--headers re-fetches From/Subject/List-Id/Date per queued thread to stdout only (host venue), capped, failures counted; refused on GHA', async () => {
    const calls = [];
    const { sb, calls: dbCalls } = db();
    const r = await runQueueRead({ sb, argv: ['--headers'], now: NOW, env, auth: 'AUTH', gmail: gmailFactory({ reject: new Set(['t2']) }, calls) });
    expect(r.items[0].headers).toEqual({ from: 't1@example.org', subject: 'About t1', list_id: null, date: 'Sun, 6 Sep 2026 04:00:00 -0400' });
    expect(r.items[1].headers).toBe(null);
    expect(r.counts).toMatchObject({ headers_fetched: 1, headers_failed: 1, headers_skipped: 0 });
    expect(calls.filter((c) => c[0] === 'threads.get').map((c) => c[1])).toEqual([
      { userId: 'me', id: 't1', format: 'metadata', metadataHeaders: ['From', 'Subject', 'List-Id', 'Date'], fields: 'id,messages(id,labelIds,payload/headers)' },
      { userId: 'me', id: 't2', format: 'metadata', metadataHeaders: ['From', 'Subject', 'List-Id', 'Date'], fields: 'id,messages(id,labelIds,payload/headers)' },
    ]);
    // nothing written: reads only
    expect(dbCalls.every((c) => c.ops[0].op === 'select')).toBe(true);
    const plain = await runQueueRead({ sb, argv: [], now: NOW, env, gmail: gmailFactory({}, calls) });
    expect(plain.items.every((i) => !('headers' in i))).toBe(true);
    expect(calls.filter((c) => c[0] === 'factory')).toHaveLength(1);
    const gha = await runQueueRead({ sb, argv: ['--headers'], now: NOW, env: { GITHUB_ACTIONS: 'true' }, gmail: gmailFactory({}, calls) });
    expect(gha).toMatchObject({ ok: false, refusal: 'HOST_VENUE_REQUIRED' });
    const many = Array.from({ length: HEADERS_MAX + 5 }, (_, i) => ({ thread_id: `t${i}`, rule_key: null, last_message_id: null, borderline: false }));
    const capCalls = [];
    const capped = await runQueueRead({ sb: db({ items: many }).sb, argv: ['--headers'], now: NOW, env, auth: 'AUTH', gmail: gmailFactory({}, capCalls) });
    expect(capped.counts).toMatchObject({ headers_fetched: HEADERS_MAX, headers_skipped: 5 });
    expect(capCalls.filter((c) => c[0] === 'threads.get')).toHaveLength(HEADERS_MAX);
  });
  it('is read-only: no writeRows import and no update/insert/upsert call in the source', () => {
    const src = readFileSync(new URL('./queue-read.mjs', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n');
    expect(src).not.toMatch(/writeRows|\.insert\(|\.upsert\(|\.update\(|\.delete\(|writeFileSync|appendFileSync/);
  });
});
