// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D / FR-4, TS-7, TS-11, TS-15, TS-17 — gmail-triage part 1 (read-only).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { stubClient } from '../../lib/michael/db.test.js';
import { runGmailTriage, inboxQueries, intentFor, itemRow, firstMatch, ITEM_KEYS, ITEM_UPDATE_KEYS, LABEL_KEYS } from './gmail-triage.mjs';

// 05:00 ET on 2026-09-06 (EDT) -> 09:00Z (inside 04:30-05:30); 02:00 ET -> 06:00Z.
const NOW = new Date('2026-09-06T09:00:00.000Z');
const TWO_AM = new Date('2026-09-06T06:00:00.000Z');
const env = { GITHUB_ACTIONS: 'false', CI: '' };
const MISSING = { data: null, error: { code: '42P01', message: 'relation does not exist' } };

const RULES = [
  { rule_key: 'gmail/exelon-digest', rule_json: { match: { from: 'alerts@exelon.com' }, class: 'newsletter', action: { verb: 'archive' } }, auto_apply: true, auto_apply_verb: 'archive' },
  { rule_key: 'gmail/receipts', rule_json: { match: { subject: 'receipt' }, class: 'receipt', action: { verb: 'label', label_id: 'L_receipts' } }, auto_apply: true, auto_apply_verb: 'label' },
  { rule_key: 'gmail/vercel', rule_json: { match: { from: 'vercel.com' }, class: 'fleet' }, auto_apply: false, auto_apply_verb: null },
  { rule_key: 'gmail/descriptive', rule_json: { match: { subject: 'newsletter' }, class: 'newsletter', action: { verb: 'archive' } }, auto_apply: false, auto_apply_verb: null },
];
const THREADS = {
  t1: { from: 'Exelon Alerts <alerts@exelon.com>', subject: 'Outage digest', lastMessageId: 'm1' },
  t2: { from: 'Shop <shop@x.com>', subject: 'Your receipt', lastMessageId: 'm2' },
  t3: { from: 'Vercel <noreply@vercel.com>', subject: 'Deploy failed', lastMessageId: 'm3' },
  t4: { from: 'Friend <f@example.org>', subject: 'Lunch?', lastMessageId: 'm4' },
  t5: { from: 'News <n@example.org>', subject: 'Weekly newsletter', lastMessageId: 'm5' },
};

/** Gmail factory: labels.list, threads.list (per query), threads.get (metadata). Records calls. */
function gmailFactory({ labels = [{ id: 'L_receipts', name: 'Receipts', type: 'user' }, { id: 'L_keep', name: 'Keep Me', type: 'user' }], fresh = ['t1', 't2', 't3', 't4', 't5'], sweep = ['t4'], threads = THREADS, reject = {} } = {}, calls = []) {
  const meta = (id) => ({ id, messages: [{ id: threads[id].lastMessageId, labelIds: ['INBOX'], payload: { headers: [{ name: 'From', value: threads[id].from }, { name: 'Subject', value: threads[id].subject }] } }] });
  return async (auth) => {
    calls.push(['factory', auth]);
    return { users: {
      labels: { list: async (args) => { calls.push(['labels.list', args]); if (reject.labels) throw reject.labels; return { data: { labels } }; } },
      threads: {
        list: async (args) => { calls.push(['threads.list', args]); if (reject.list) throw reject.list; const ids = args.q.startsWith('in:inbox newer') ? fresh : sweep; return { data: { threads: ids.map((id) => ({ id })) } }; },
        get: async (args) => { calls.push(['threads.get', args]); if (reject.get && reject.get.has(args.id)) throw new Error('boom'); return { data: meta(args.id) }; },
        modify: async () => { throw new Error('modify must never be called in PR 4a'); },
      },
    } };
  };
}
/** DB stub scripted per table; records every call. */
function db({ runs = [], labels = [], rules = RULES, absent = false } = {}) {
  const calls = [];
  const sb = stubClient((table, ops) => {
    calls.push({ table, kind: ops[0].op, ops });
    if (absent) return MISSING;
    if (ops[0].op !== 'select') return { data: null, error: null };
    if (table === 'michael_feeder_runs') return { data: runs, error: null };
    if (table === 'michael_gmail_labels') return { data: labels, error: null };
    if (table === 'michael_rules') return { data: rules, error: null };
    return { data: [], error: null };
  });
  return { sb, calls };
}

describe('pure helpers', () => {
  it('inboxQueries excludes keep_in_inbox label names from the fresh query only', () => {
    expect(inboxQueries([])).toEqual(['in:inbox newer_than:1d', 'in:inbox older_than:1d']);
    expect(inboxQueries(['Keep Me', 'Family'])).toEqual(['in:inbox newer_than:1d -label:"Keep Me" -label:"Family"', 'in:inbox older_than:1d']);
  });
  it('intentFor yields an intent only for auto_apply=true with verb label or archive (SECURITY F-2)', () => {
    expect(intentFor(RULES[0], { action: { verb: 'archive' } })).toBe('archive');
    expect(intentFor(RULES[1], { action: { verb: 'label', label_id: 'L_receipts' } })).toBe('label:L_receipts');
    expect(intentFor(RULES[3], { action: { verb: 'archive' } })).toBe(null);
    expect(intentFor({ auto_apply: true, auto_apply_verb: 'reschedule' }, {})).toBe(null);
    expect(intentFor({ auto_apply: true, auto_apply_verb: 'label' }, { action: { verb: 'label' } })).toBe(null);
  });
  it('itemRow has the uniform owned key set; firstMatch takes the first rule in order and skips a missing class', () => {
    const meta = { threadId: 't1', ...THREADS.t1 };
    const hit = firstMatch(RULES, meta);
    expect(hit.rule.rule_key).toBe('gmail/exelon-digest');
    const row = itemRow({ etDate: '2026-09-06', meta, rule: hit.rule, match: hit.match });
    expect(row).toEqual({ et_date: '2026-09-06', thread_id: 't1', class: 'newsletter', rule_key: 'gmail/exelon-digest', action_intent: 'archive', last_message_id: 'm1' });
    expect(Object.keys(row)).toEqual([...ITEM_KEYS]);
    expect(itemRow({ etDate: '2026-09-06', meta: { threadId: 't4', lastMessageId: null }, rule: null, match: null })).toEqual({ et_date: '2026-09-06', thread_id: 't4', class: null, rule_key: null, action_intent: null, last_message_id: null });
    expect(firstMatch(RULES, meta, new Set(['newsletter']))).toMatchObject({ skipped: true });
    expect(firstMatch(RULES, { threadId: 'x', from: 'nobody', subject: 'nothing' })).toBe(null);
  });
});

describe('runGmailTriage', () => {
  it('refuses GITHUB_ACTIONS=true before any call, refuses --modify with MODIFY_NOT_LANDED, --date, and a bad --et-date', async () => {
    const calls = [];
    const { sb, calls: dbCalls } = db();
    expect(await runGmailTriage({ sb, argv: ['--apply'], now: NOW, auth: 'AUTH', gmail: gmailFactory({}, calls), env: { ...env, GITHUB_ACTIONS: 'true' } })).toMatchObject({ ok: false, refusal: 'HOST_VENUE_REQUIRED' });
    expect(await runGmailTriage({ sb, argv: ['--apply', '--modify'], now: NOW, auth: 'AUTH', gmail: gmailFactory({}, calls), env })).toMatchObject({ ok: false, refusal: 'MODIFY_NOT_LANDED' });
    expect(await runGmailTriage({ sb, argv: ['--date', '2026-09-06'], now: NOW, auth: 'AUTH', env })).toMatchObject({ ok: false, refusal: 'FLAG_UNSUPPORTED' });
    expect(await runGmailTriage({ sb, argv: ['--et-date', 'x'], now: NOW, auth: 'AUTH', env })).toMatchObject({ ok: false, refusal: 'ET_DATE_INVALID' });
    expect(calls).toEqual([]); expect(dbCalls).toEqual([]);
  });
  it('is inert outside 04:30-05:30 ET and while the tables are absent, with no Gmail call', async () => {
    const calls = [];
    expect(await runGmailTriage({ sb: db().sb, argv: ['--apply'], now: TWO_AM, auth: 'AUTH', gmail: gmailFactory({}, calls), env })).toMatchObject({ action: 'inert', reason: 'outside_et_window' });
    expect(await runGmailTriage({ sb: db({ absent: true }).sb, argv: ['--apply'], now: NOW, auth: 'AUTH', gmail: gmailFactory({}, calls), env })).toMatchObject({ action: 'inert', reason: 'tables_absent' });
    expect(calls).toEqual([]);
  });
  it('dry run: metadata-only reads, rules-first matching, auto_apply gate, fleet class, unmatched queued; writes nothing', async () => {
    const calls = [];
    const { sb, calls: dbCalls } = db({ labels: [{ label_id: 'L_keep', name: 'Keep Me', class: null, keep_in_inbox: true }] });
    const r = await runGmailTriage({ sb, argv: [], now: NOW, auth: 'AUTH', gmail: gmailFactory({}, calls), env });
    expect(r).toMatchObject({ ok: true, action: 'dry_run', status: 'ok', et_date: '2026-09-06' });
    expect(calls.filter((c) => c[0] === 'threads.list').map((c) => c[1])).toEqual([
      { userId: 'me', q: 'in:inbox newer_than:1d -label:"Keep Me"', maxResults: 200 },
      { userId: 'me', q: 'in:inbox older_than:1d', maxResults: 200 },
    ]);
    for (const g of calls.filter((c) => c[0] === 'threads.get')) expect(g[1]).toMatchObject({ format: 'metadata', metadataHeaders: ['From', 'Subject', 'List-Id', 'Date'] });
    expect(calls.filter((c) => c[0] === 'threads.get')).toHaveLength(5);
    expect(r.counts).toMatchObject({ dry_run: true, labels_seen: 2, missing_labels: [], threads_seen: 5, matched: 4, unmatched: 1, fleet: 1, intents: 2, meta_failed: 0, truncated_query: [] });
    const byId = Object.fromEntries(r.preview.map((x) => [x.thread_id, x]));
    expect(byId.t1).toMatchObject({ class: 'newsletter', rule_key: 'gmail/exelon-digest', action_intent: 'archive', last_message_id: 'm1' });
    expect(byId.t2).toMatchObject({ class: 'receipt', action_intent: 'label:L_receipts' });
    expect(byId.t3).toMatchObject({ class: 'fleet', rule_key: 'gmail/vercel', action_intent: null });
    expect(byId.t4).toMatchObject({ class: null, rule_key: null, action_intent: null });
    expect(byId.t5).toMatchObject({ class: 'newsletter', rule_key: 'gmail/descriptive', action_intent: null });
    expect(dbCalls.filter((c) => c.kind !== 'select')).toEqual([]);
    const text = JSON.stringify({ counts: r.counts, preview: r.preview });
    // no header value (sender, subject) reaches counts or rows; class names come from rule_json, not from mail
    for (const pii of ['@', 'Outage digest', 'Your receipt', 'Deploy failed', 'Lunch?', 'Weekly newsletter', 'alerts', 'vercel.com']) expect(text).not.toContain(pii);
  });
  it('--apply: label reconcile writes only the three owned columns; items use ignoreDuplicates then guarded updates of the owned keys (TS-17)', async () => {
    const { sb, calls: dbCalls } = db({ labels: [] });
    const r = await runGmailTriage({ sb, argv: ['--apply'], now: NOW, auth: 'AUTH', gmail: gmailFactory(), env });
    expect(r).toMatchObject({ ok: true, action: 'run', status: 'ok', attempt: 1, counts: { rows_written: 5, updates: 5 } });
    const labelUp = dbCalls.find((c) => c.table === 'michael_gmail_labels' && c.kind === 'upsert');
    expect(labelUp.ops[0].args[1]).toEqual({ onConflict: 'label_id' });
    for (const row of labelUp.ops[0].args[0]) expect(Object.keys(row)).toEqual([...LABEL_KEYS]);
    const itemUp = dbCalls.find((c) => c.table === 'michael_gmail_triage_items' && c.kind === 'upsert');
    expect(itemUp.ops[0].args[1]).toEqual({ onConflict: 'et_date,thread_id', ignoreDuplicates: true });
    for (const row of itemUp.ops[0].args[0]) expect(Object.keys(row)).toEqual([...ITEM_KEYS]);
    const updates = dbCalls.filter((c) => c.table === 'michael_gmail_triage_items' && c.kind === 'update');
    expect(updates).toHaveLength(5);
    for (const u of updates) {
      expect(Object.keys(u.ops[0].args[0])).toEqual([...ITEM_UPDATE_KEYS]);
      expect(u.ops.map((o) => o.op)).toEqual(['update', 'eq', 'eq', 'is']);
      expect(u.ops[3].args).toEqual(['action_taken_at', null]);
    }
    expect(dbCalls.filter((c) => c.table === 'michael_feeder_runs').map((c) => c.kind)).toEqual(['select', 'insert', 'update']);
  });
  it('TS-7: a configured class whose label is missing from Gmail degrades, is listed, and its rule is skipped while others proceed', async () => {
    const { sb } = db({ labels: [{ label_id: 'L_news', name: 'Newsletters', class: 'newsletter', keep_in_inbox: false }, { label_id: 'L_receipts', name: 'Receipts', class: 'receipt', keep_in_inbox: false }] });
    const r = await runGmailTriage({ sb, argv: [], now: NOW, auth: 'AUTH', gmail: gmailFactory(), env });
    expect(r).toMatchObject({ action: 'dry_run', status: 'degraded', counts: { missing_labels: ['L_news'], skipped_class: 2, matched: 2, unmatched: 3 } });
    const byId = Object.fromEntries(r.preview.map((x) => [x.thread_id, x]));
    expect(byId.t1).toMatchObject({ class: null, rule_key: null, action_intent: null });
    expect(byId.t2).toMatchObject({ class: 'receipt', action_intent: 'label:L_receipts' });
  });
  it('labels.list failing is failed; a thread metadata failure is counted and degrades; a full page marks truncated_query', async () => {
    const err = Object.assign(new Error('rate limited'), { code: 429 });
    expect(await runGmailTriage({ sb: db().sb, argv: [], now: NOW, auth: 'AUTH', gmail: gmailFactory({ reject: { labels: err } }), env })).toMatchObject({ action: 'dry_run', status: 'failed', counts: { error_code: '429', phase: 'labels' } });
    const r = await runGmailTriage({ sb: db().sb, argv: [], now: NOW, auth: 'AUTH', gmail: gmailFactory({ reject: { get: new Set(['t4']) } }), env });
    expect(r).toMatchObject({ status: 'degraded', counts: { meta_failed: 1, threads_seen: 5 } });
    expect(r.preview.map((x) => x.thread_id)).not.toContain('t4');
    const big = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`b${i}`, { from: 'x@y', subject: 's', lastMessageId: `m${i}` }]));
    const t = await runGmailTriage({ sb: db().sb, argv: [], now: NOW, auth: 'AUTH', gmail: gmailFactory({ fresh: Object.keys(big), sweep: [], threads: big }), env });
    expect(t).toMatchObject({ status: 'degraded', counts: { truncated_query: ['fresh'], threads_seen: 200 } });
  });
  it('no modify call exists in the module and no credential is read directly (source assertions)', () => {
    const codeOnly = (text) => text.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n');
    const src = codeOnly(readFileSync(new URL('./gmail-triage.mjs', import.meta.url), 'utf8'));
    expect(src).not.toMatch(/modifyThread|threads\.modify|readHostKey|getStoredTokens|MICHAEL_ENCRYPTION_KEY|from 'googleapis'/);
  });
});
